/**
 * schedulable-events.service.ts
 * -----------------------------
 * Agentic Scheduler — FSP Integration — FSP SchedulableEvents service
 * -------------------------------------------------------------------
 * Provides schedulable event retrieval on the FSP core API.
 * All public methods return ServiceResult and never throw to the caller.
 *
 * Key exports: SchedulableEventsService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type { FspSchedulableEvent, ServiceResult } from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for schedulable event queries on the FSP core API.
 */
@Injectable()
export class SchedulableEventsService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Retrieves schedulable events for the given operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @param params     - Optional query parameters (e.g. studentId, date range).
   * @returns ServiceResult containing an array of schedulable events, or an error.
   */
  public async getSchedulableEvents(
    operatorId: string,
    params: Record<string, unknown>,
  ): Promise<ServiceResult<FspSchedulableEvent[]>> {
    try {
      const data = await this.coreClient.get<FspSchedulableEvent[]>(
        `/api/V1/operator/${operatorId}/schedulableEvents`,
        params,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
