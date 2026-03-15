/**
 * instructors.service.ts
 * ----------------------
 * Agentic Scheduler — FSP Integration — FSP Instructors service
 * -------------------------------------------------------------
 * Provides instructor listing on the FSP core API.
 * All public methods return ServiceResult and never throw to the caller.
 *
 * Key exports: InstructorsService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type { FspInstructor, ServiceResult } from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for instructor listing on the FSP core API.
 */
@Injectable()
export class InstructorsService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Lists all instructors for the given operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing an array of instructors, or an error.
   */
  public async listInstructors(operatorId: string): Promise<ServiceResult<FspInstructor[]>> {
    try {
      const data = await this.coreClient.get<FspInstructor[]>(
        `/api/V1/operator/${operatorId}/instructors`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
