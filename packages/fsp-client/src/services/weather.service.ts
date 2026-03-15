/**
 * weather.service.ts
 * ------------------
 * Agentic Scheduler — FSP Integration — FSP Weather service
 * ---------------------------------------------------------
 * Provides METAR and TAF retrieval on the FSP core API.
 * All public methods return ServiceResult and never throw to the caller.
 *
 * Key exports: WeatherService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type { FspMetar, FspTaf, ServiceResult } from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for weather data retrieval on the FSP core API.
 */
@Injectable()
export class WeatherService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Retrieves the current METAR for a weather station.
   *
   * @param operatorId - The FSP operator identifier.
   * @param stationId  - ICAO weather station identifier (e.g. "KORD").
   * @returns ServiceResult containing the METAR data, or an error.
   */
  public async getMetar(
    operatorId: string,
    stationId: string,
  ): Promise<ServiceResult<FspMetar>> {
    try {
      const data = await this.coreClient.get<FspMetar>(
        `/api/V1/operator/${operatorId}/weather/${stationId}/metar`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves the current TAF for a weather station.
   *
   * @param operatorId - The FSP operator identifier.
   * @param stationId  - ICAO weather station identifier (e.g. "KORD").
   * @returns ServiceResult containing the TAF data, or an error.
   */
  public async getTaf(
    operatorId: string,
    stationId: string,
  ): Promise<ServiceResult<FspTaf>> {
    try {
      const data = await this.coreClient.get<FspTaf>(
        `/api/V1/operator/${operatorId}/weather/${stationId}/taf`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
