/**
 * scheduling-groups.service.ts
 * ----------------------------
 * Agentic Scheduler — FSP Integration — FSP SchedulingGroups service
 * ------------------------------------------------------------------
 * Provides scheduling group listing on the FSP core API.
 * All public methods return ServiceResult and never throw to the caller.
 *
 * Key exports: SchedulingGroupsService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type { FspSchedulingGroup, ServiceResult } from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for scheduling group listing on the FSP core API.
 */
@Injectable()
export class SchedulingGroupsService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Lists all scheduling groups for the given operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing an array of scheduling groups, or an error.
   */
  public async listSchedulingGroups(operatorId: string): Promise<ServiceResult<FspSchedulingGroup[]>> {
    try {
      const data = await this.coreClient.get<FspSchedulingGroup[]>(
        `/api/V1/operator/${operatorId}/schedulingGroups`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
