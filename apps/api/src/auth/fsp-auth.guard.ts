/**
 * fsp-auth.guard.ts
 * -----------------
 * Agentic Scheduler — FSP Integration — FSP bearer token auth guard
 * -----------------------------------------------------------------
 * Global NestJS guard that validates every inbound request against the
 * FSP auth gateway. Extracts the Bearer token and x-operator-id header,
 * calls FSP getPermissions to verify the token and check canManageSchedule,
 * then looks up the operator in the local database for tenant isolation.
 * On success, populates TenantContext for downstream use.
 *
 * Key exports: FspAuthGuard
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { OperatorsService } from '@fsp-scheduler/fsp-client';
import { FspHttpClient } from '@fsp-scheduler/fsp-client';
import { Inject } from '@nestjs/common';
import { FSP_AUTH_CLIENT } from '@fsp-scheduler/fsp-client';
import { PrismaService } from '@fsp-scheduler/database';
import { TenantContext } from './tenant-context';
import { IS_PUBLIC_KEY } from './public.decorator';

/** Logger name for this guard. */
const GUARD_NAME = 'FspAuthGuard';

/**
 * Narrows an unknown value to a Record to safely access header properties.
 *
 * @param headers - The raw headers object from the request.
 * @returns The headers cast as a string-keyed record.
 */
function toHeaderRecord(headers: unknown): Record<string, string | undefined> {
  if (headers !== null && typeof headers === 'object') {
    return headers as Record<string, string | undefined>;
  }
  return {};
}

/**
 * Global authentication guard that validates FSP bearer tokens.
 *
 * Applied via APP_GUARD in app.module.ts so it runs before every handler.
 * Routes decorated with @Public() are exempt from authentication.
 */
@Injectable()
export class FspAuthGuard implements CanActivate {
  private readonly logger = new Logger(GUARD_NAME);

  /**
   * @param reflector        - NestJS reflector used to read @Public() metadata.
   * @param operatorsService - FSP client service for permission checks.
   * @param authClient       - FSP HTTP client instance for injecting bearer token.
   * @param prisma           - Database service for operator lookup.
   * @param tenantContext    - Request-scoped context populated on success.
   */
  constructor(
    private readonly reflector: Reflector,
    private readonly operatorsService: OperatorsService,
    @Inject(FSP_AUTH_CLIENT) private readonly authClient: FspHttpClient,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Validates the request and populates TenantContext on success.
   *
   * @param context - NestJS execution context providing access to the request.
   * @returns true if the request is authenticated; false to reject with 401.
   */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if the route is marked as @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const headers = toHeaderRecord(request.headers);

    // Extract Bearer token
    const authHeader = headers['authorization'];
    if (!authHeader || typeof authHeader !== 'string') {
      this.logger.warn('Missing Authorization header');
      return false;
    }

    if (!authHeader.startsWith('Bearer ')) {
      this.logger.warn('Authorization header is not a Bearer token');
      return false;
    }

    const bearerToken = authHeader.slice('Bearer '.length).trim();
    if (!bearerToken) {
      this.logger.warn('Empty bearer token');
      return false;
    }

    // Extract x-operator-id
    const operatorIdHeader = headers['x-operator-id'];
    if (!operatorIdHeader || typeof operatorIdHeader !== 'string') {
      this.logger.warn('Missing x-operator-id header');
      return false;
    }

    const fspOperatorId = parseInt(operatorIdHeader, 10);
    if (isNaN(fspOperatorId)) {
      this.logger.warn(`Invalid x-operator-id header value: ${operatorIdHeader}`);
      return false;
    }

    // Inject bearer token into FSP auth client for this call
    this.authClient.setBearerToken(bearerToken);

    // Validate token via FSP permissions endpoint
    const permissionsResult = await this.operatorsService.getPermissions(
      String(fspOperatorId),
    );

    if (!permissionsResult.success) {
      this.logger.warn(`FSP permission check failed: ${permissionsResult.error}`);
      return false;
    }

    const permissions = permissionsResult.data;

    // Check canManageSchedule permission
    if (!permissions['canManageSchedule']) {
      this.logger.warn(
        `Operator ${fspOperatorId} does not have canManageSchedule permission`,
      );
      return false;
    }

    // Extract userId from permissions response
    const userId = typeof permissions['userId'] === 'string'
      ? permissions['userId']
      : String(fspOperatorId);

    // Look up operator in database — must be bootstrapped
    const operator = await this.prisma.operator.findUnique({
      where: { fspOperatorId },
    });

    if (!operator) {
      this.logger.warn(
        `Operator fspOperatorId=${fspOperatorId} not found in DB — bootstrap required`,
      );
      return false;
    }

    // Populate tenant context for downstream handlers
    this.tenantContext.set({
      operatorId: operator.operatorId,
      fspOperatorId: operator.fspOperatorId,
      userId,
      bearerToken,
    });

    return true;
  }
}
