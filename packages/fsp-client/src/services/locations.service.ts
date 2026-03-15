/**
 * locations.service.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — FSP Locations service
 * -----------------------------------------------------------
 * Provides location lookup operations on the FSP core API.
 * All public methods return ServiceResult and never throw to the caller.
 *
 * Key exports: LocationsService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type { FspLocation, ServiceResult } from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for operator location lookup on the FSP core API.
 */
@Injectable()
export class LocationsService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Lists all locations for the given operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing an array of locations, or an error.
   */
  public async listLocations(operatorId: string): Promise<ServiceResult<FspLocation[]>> {
    try {
      const data = await this.coreClient.get<FspLocation[]>(
        `/api/V1/operator/${operatorId}/locations`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves a single location by ID.
   *
   * @param operatorId  - The FSP operator identifier.
   * @param locationId  - The FSP location identifier.
   * @returns ServiceResult containing the location, or an error.
   */
  public async getLocation(operatorId: string, locationId: string): Promise<ServiceResult<FspLocation>> {
    try {
      const data = await this.coreClient.get<FspLocation>(
        `/api/V1/operator/${operatorId}/locations/${locationId}`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
