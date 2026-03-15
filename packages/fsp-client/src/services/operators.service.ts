/**
 * operators.service.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — FSP Operators service
 * -----------------------------------------------------------
 * Provides access to operator, user, and permissions endpoints on the
 * FSP auth gateway. All public methods return ServiceResult.
 *
 * Key exports: OperatorsService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type {
  FspOperator,
  FspOperatorUser,
  FspOperatorPermissions,
  ServiceResult,
} from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for operator management operations on the FSP auth gateway.
 */
@Injectable()
export class OperatorsService {
  /**
   * @param authClient - HTTP client bound to the FSP auth gateway base URL.
   */
  constructor(private readonly authClient: FspHttpClient) {}

  /**
   * Lists all operators accessible to the authenticated user.
   *
   * @returns ServiceResult containing an array of operators, or an error.
   */
  public async listOperators(): Promise<ServiceResult<FspOperator[]>> {
    try {
      const data = await this.authClient.get<FspOperator[]>('/api/V1/Operators');
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves a single operator by ID.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing the operator, or an error.
   */
  public async getOperator(operatorId: string): Promise<ServiceResult<FspOperator>> {
    try {
      const data = await this.authClient.get<FspOperator>(`/api/V1/Operators/${operatorId}`);
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Lists all users belonging to an operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing an array of users, or an error.
   */
  public async listUsers(operatorId: string): Promise<ServiceResult<FspOperatorUser[]>> {
    try {
      const data = await this.authClient.get<FspOperatorUser[]>(
        `/api/V1/Operators/${operatorId}/users`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves the permission set for a given operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing the permissions, or an error.
   */
  public async getPermissions(operatorId: string): Promise<ServiceResult<FspOperatorPermissions>> {
    try {
      const data = await this.authClient.get<FspOperatorPermissions>(
        `/api/V1/Operators/${operatorId}/permissions`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
