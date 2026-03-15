/**
 * auto-schedule.service.ts
 * ------------------------
 * Agentic Scheduler — FSP Integration — FSP AutoSchedule service
 * --------------------------------------------------------------
 * Provides auto-schedule settings, execution, and feedback operations
 * on the FSP core API. All public methods return ServiceResult.
 *
 * Key exports: AutoScheduleService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type {
  FspAutoScheduleSettings,
  FspAutoScheduleExecuteRequest,
  FspAutoScheduleResult,
  FspAutoScheduleFeedback,
  ServiceResult,
} from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for auto-schedule operations on the FSP core API.
 */
@Injectable()
export class AutoScheduleService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Retrieves auto-schedule settings for the operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing the auto-schedule settings, or an error.
   */
  public async getSettings(operatorId: string): Promise<ServiceResult<FspAutoScheduleSettings>> {
    try {
      const data = await this.coreClient.get<FspAutoScheduleSettings>(
        `/api/V1/operator/${operatorId}/autoSchedule/settings`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Updates auto-schedule settings for the operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @param settings   - Partial settings to update.
   * @returns ServiceResult containing the updated settings, or an error.
   */
  public async updateSettings(
    operatorId: string,
    settings: Partial<FspAutoScheduleSettings>,
  ): Promise<ServiceResult<FspAutoScheduleSettings>> {
    try {
      const data = await this.coreClient.put<FspAutoScheduleSettings>(
        `/api/V1/operator/${operatorId}/autoSchedule/settings`,
        settings,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Triggers the auto-scheduler to run for the given operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @param req        - Execution parameters including optional dry-run flag.
   * @returns ServiceResult containing the auto-schedule run result, or an error.
   */
  public async execute(
    operatorId: string,
    req: FspAutoScheduleExecuteRequest,
  ): Promise<ServiceResult<FspAutoScheduleResult>> {
    try {
      const data = await this.coreClient.post<FspAutoScheduleResult>(
        `/api/V1/operator/${operatorId}/autoSchedule/execute`,
        req,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Submits feedback for a specific auto-scheduled event.
   *
   * @param operatorId - The FSP operator identifier.
   * @param eventId    - The schedulable event identifier.
   * @param feedback   - Feedback payload.
   * @returns ServiceResult indicating success or failure.
   */
  public async submitFeedback(
    operatorId: string,
    eventId: string,
    feedback: FspAutoScheduleFeedback,
  ): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const data = await this.coreClient.post<Record<string, unknown>>(
        `/api/V1/operator/${operatorId}/autoSchedule/events/${eventId}/feedback`,
        feedback,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
