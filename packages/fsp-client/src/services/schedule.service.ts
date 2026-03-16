/**
 * schedule.service.ts
 * -------------------
 * Agentic Scheduler — FSP Integration — FSP Schedule service
 * ----------------------------------------------------------
 * Provides schedule retrieval, display hours, filters, and cancellation
 * reason operations on the FSP core API.
 * All public methods return ServiceResult and never throw to the caller.
 *
 * Key exports: ScheduleService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type {
  FspSchedule,
  FspDisplayHours,
  FspScheduleFilters,
  FspCancellationReason,
  ServiceResult,
} from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for schedule-related operations on the FSP core API.
 */
@Injectable()
export class ScheduleService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Retrieves the operator's schedule entries matching the given filters.
   *
   * @param operatorId - The FSP operator identifier.
   * @param params     - Optional filter parameters.
   * @returns ServiceResult containing an array of schedule entries, or an error.
   */
  public async getSchedule(
    operatorId: string,
    params: Partial<FspScheduleFilters>,
  ): Promise<ServiceResult<FspSchedule[]>> {
    try {
      const data = await this.coreClient.get<FspSchedule[]>(
        `/api/V1/operator/${operatorId}/schedule`,
        params as Record<string, unknown>,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves display hours (opening and closing times) for the operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing display hours, or an error.
   */
  public async getDisplayHours(operatorId: string): Promise<ServiceResult<FspDisplayHours[]>> {
    try {
      const data = await this.coreClient.get<FspDisplayHours[]>(
        `/api/V1/operator/${operatorId}/schedule/displayHours`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves available schedule filter options for the operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing schedule filter options, or an error.
   */
  public async getFilters(operatorId: string): Promise<ServiceResult<FspScheduleFilters>> {
    try {
      const data = await this.coreClient.get<FspScheduleFilters>(
        `/api/V1/operator/${operatorId}/schedule/filters`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves available cancellation reasons for the operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing an array of cancellation reasons, or an error.
   */
  public async getCancellationReasons(
    operatorId: string,
  ): Promise<ServiceResult<FspCancellationReason[]>> {
    try {
      const data = await this.coreClient.get<FspCancellationReason[]>(
        `/api/V1/operator/${operatorId}/schedule/cancellationReasons`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
