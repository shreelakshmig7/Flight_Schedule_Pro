/**
 * find-a-time.service.ts
 * ----------------------
 * Agentic Scheduler — FSP Integration — FSP FindATime service
 * -----------------------------------------------------------
 * Provides find-a-time preferences management and available slot discovery
 * on the FSP core API. All public methods return ServiceResult.
 *
 * Key exports: FindATimeService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type {
  FspFindATimePreferences,
  FspFindATimeSlot,
  FspFindATimeRequest,
  ServiceResult,
} from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/** Shape of the find-a-time slots API response wrapper. */
interface FindATimeSlotsResponse {
  slots: FspFindATimeSlot[];
}

/**
 * Service for find-a-time operations on the FSP core API.
 */
@Injectable()
export class FindATimeService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Retrieves find-a-time scheduling preferences for a user.
   *
   * @param operatorId - The FSP operator identifier.
   * @param userId     - The user whose preferences to retrieve.
   * @returns ServiceResult containing the user's preferences, or an error.
   */
  public async getPreferences(
    operatorId: string,
    userId: string,
  ): Promise<ServiceResult<FspFindATimePreferences>> {
    try {
      const data = await this.coreClient.get<FspFindATimePreferences>(
        `/api/V1/operator/${operatorId}/findatime/preferences/${userId}`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Updates find-a-time scheduling preferences for a user.
   *
   * @param operatorId - The FSP operator identifier.
   * @param userId     - The user whose preferences to update.
   * @param prefs      - Updated preference values.
   * @returns ServiceResult containing the updated preferences, or an error.
   */
  public async updatePreferences(
    operatorId: string,
    userId: string,
    prefs: Partial<FspFindATimePreferences>,
  ): Promise<ServiceResult<FspFindATimePreferences>> {
    try {
      const data = await this.coreClient.put<FspFindATimePreferences>(
        `/api/V1/operator/${operatorId}/findatime/preferences/${userId}`,
        prefs,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Discovers available time slots matching the given scheduling request.
   *
   * @param operatorId - The FSP operator identifier.
   * @param req        - The find-a-time request parameters.
   * @returns ServiceResult containing an array of available slots, or an error.
   */
  public async getAvailableSlots(
    operatorId: string,
    req: FspFindATimeRequest,
  ): Promise<ServiceResult<FspFindATimeSlot[]>> {
    try {
      const response = await this.coreClient.post<FindATimeSlotsResponse>(
        `/api/V1/operator/${operatorId}/findatime/slots`,
        req,
      );
      return { success: true, data: response.slots ?? [] };
    } catch (err) {
      return buildError(err);
    }
  }
}
