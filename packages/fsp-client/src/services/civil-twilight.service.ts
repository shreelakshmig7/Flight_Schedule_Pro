/**
 * civil-twilight.service.ts
 * -------------------------
 * Agentic Scheduler — FSP Integration — FSP CivilTwilight service
 * ---------------------------------------------------------------
 * Provides civil twilight time retrieval for a location on the FSP core API.
 * All public methods return ServiceResult and never throw to the caller.
 *
 * Key exports: CivilTwilightService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type { FspCivilTwilight, ServiceResult } from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for civil twilight data retrieval on the FSP core API.
 */
@Injectable()
export class CivilTwilightService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Retrieves civil twilight times for a specific location and date.
   *
   * @param operatorId - The FSP operator identifier.
   * @param locationId - The FSP location identifier.
   * @param date       - The date string in YYYY-MM-DD format.
   * @returns ServiceResult containing civil twilight data, or an error.
   */
  public async getCivilTwilight(
    operatorId: string,
    locationId: string,
    date: string,
  ): Promise<ServiceResult<FspCivilTwilight>> {
    try {
      const data = await this.coreClient.get<FspCivilTwilight>(
        `/api/V1/operator/${operatorId}/locations/${locationId}/civilTwilight`,
        { date },
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
