/**
 * activity-types.service.ts
 * -------------------------
 * Agentic Scheduler — FSP Integration — FSP ActivityTypes service
 * ---------------------------------------------------------------
 * Provides activity type listing on the FSP core API.
 * All public methods return ServiceResult and never throw to the caller.
 *
 * Key exports: ActivityTypesService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type { FspActivityType, ServiceResult } from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for activity type listing on the FSP core API.
 */
@Injectable()
export class ActivityTypesService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Lists all activity types configured for the given operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing an array of activity types, or an error.
   */
  public async listActivityTypes(operatorId: string): Promise<ServiceResult<FspActivityType[]>> {
    try {
      const data = await this.coreClient.get<FspActivityType[]>(
        `/api/V1/operator/${operatorId}/activityTypes`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
