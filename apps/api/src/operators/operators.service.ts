/**
 * operators.service.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — Operators business logic service
 * ----------------------------------------------------------------------
 * Provides operator bootstrap (idempotent upsert) and config retrieval.
 * Bootstrap creates a new operator row if it does not exist, or returns
 * the existing row — enabling safe idempotent retries. getMyConfig reads
 * the operator row by its internal operatorId for the authenticated tenant.
 *
 * Key exports: OperatorsService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@fsp-scheduler/database';
import {
  OPERATOR_DEFAULT_POLLING_TIER,
} from '@fsp-scheduler/shared-types';
import type {
  OperatorBootstrapRequest,
  OperatorConfigResponse,
  TenantContextData,
} from '@fsp-scheduler/shared-types';

/** Logger name for this service. */
const SERVICE_NAME = 'OperatorsService';

/**
 * Service that handles operator lifecycle operations.
 * All database queries include operatorId (or fspOperatorId for bootstrap)
 * to enforce tenant isolation.
 */
@Injectable()
export class OperatorsService {
  private readonly logger = new Logger(SERVICE_NAME);

  /**
   * @param prisma - Global PrismaService for database access.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bootstraps an operator in the local database.
   *
   * Idempotent — if the operator already exists (matched by fspOperatorId),
   * it updates the name and returns the existing record. Safe to call
   * multiple times with the same fspOperatorId.
   *
   * @param req - Bootstrap request containing FSP operator ID and name.
   * @returns The operator config reflecting the created/updated record.
   */
  public async bootstrap(req: OperatorBootstrapRequest): Promise<OperatorConfigResponse> {
    this.logger.log(`Bootstrapping operator fspOperatorId=${req.fspOperatorId}`);

    const operator = await this.prisma.operator.upsert({
      where: { fspOperatorId: req.fspOperatorId },
      update: {
        name: req.operatorName,
        isActive: true,
      },
      create: {
        operatorId: `fsp-${req.fspOperatorId}`,
        fspOperatorId: req.fspOperatorId,
        name: req.operatorName,
        pollingTier: OPERATOR_DEFAULT_POLLING_TIER,
        isActive: true,
      },
    });

    this.logger.log(
      `Operator bootstrapped: id=${operator.operatorId} fspOperatorId=${operator.fspOperatorId}`,
    );

    return this.toConfigResponse(operator);
  }

  /**
   * Returns the operator configuration for the authenticated tenant.
   *
   * @param tenantContext - Authenticated tenant data from TenantContext.
   * @returns The operator config for the current tenant.
   * @throws Will propagate Prisma errors if the operator is not found.
   */
  public async getMyConfig(
    tenantContext: TenantContextData,
  ): Promise<OperatorConfigResponse> {
    this.logger.log(`Fetching config for operatorId=${tenantContext.operatorId}`);

    const operator = await this.prisma.operator.findUniqueOrThrow({
      where: { operatorId: tenantContext.operatorId },
    });

    return this.toConfigResponse(operator);
  }

  /**
   * Maps a Prisma Operator record to the OperatorConfigResponse shape.
   *
   * @param operator - The Prisma Operator model instance.
   * @returns A serialisable OperatorConfigResponse.
   */
  private toConfigResponse(operator: {
    operatorId: string;
    fspOperatorId: number;
    name: string;
    pollingTier: string;
    isActive: boolean;
    createdAt: Date;
  }): OperatorConfigResponse {
    return {
      id: operator.operatorId,
      fspOperatorId: operator.fspOperatorId,
      name: operator.name,
      pollingTier: operator.pollingTier,
      priorityWeights: {},
      policyConfig: {},
      isActive: operator.isActive,
      createdAt: operator.createdAt.toISOString(),
    };
  }
}
