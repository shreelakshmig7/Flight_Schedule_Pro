/**
 * aircraft.service.ts
 * -------------------
 * Agentic Scheduler — FSP Integration — FSP Aircraft service
 * ----------------------------------------------------------
 * Provides aircraft listing, times, squawks, and maintenance reminder
 * operations on the FSP core API. All public methods return ServiceResult.
 *
 * Key exports: AircraftService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type {
  FspAircraft,
  FspAircraftSquawk,
  FspMaintenanceReminder,
  ServiceResult,
} from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for aircraft-related operations on the FSP core API.
 */
@Injectable()
export class AircraftService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Lists all aircraft for the given operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing an array of aircraft, or an error.
   */
  public async listAircraft(operatorId: string): Promise<ServiceResult<FspAircraft[]>> {
    try {
      const data = await this.coreClient.get<FspAircraft[]>(
        `/api/V1/operator/${operatorId}/aircraft`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves tachometer/hobbs times for a specific aircraft.
   *
   * @param operatorId  - The FSP operator identifier.
   * @param aircraftId  - The FSP aircraft identifier.
   * @returns ServiceResult containing the aircraft times record, or an error.
   */
  public async getAircraftTimes(
    operatorId: string,
    aircraftId: string,
  ): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const data = await this.coreClient.get<Record<string, unknown>>(
        `/api/V1/operator/${operatorId}/aircraft/${aircraftId}/times`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves open squawks for a specific aircraft.
   *
   * @param operatorId  - The FSP operator identifier.
   * @param aircraftId  - The FSP aircraft identifier.
   * @returns ServiceResult containing an array of squawks, or an error.
   */
  public async getSquawks(
    operatorId: string,
    aircraftId: string,
  ): Promise<ServiceResult<FspAircraftSquawk[]>> {
    try {
      const data = await this.coreClient.get<FspAircraftSquawk[]>(
        `/api/V1/operator/${operatorId}/aircraft/${aircraftId}/squawks`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves maintenance reminders for a specific aircraft.
   *
   * @param operatorId  - The FSP operator identifier.
   * @param aircraftId  - The FSP aircraft identifier.
   * @returns ServiceResult containing an array of maintenance reminders, or an error.
   */
  public async getMaintenanceReminders(
    operatorId: string,
    aircraftId: string,
  ): Promise<ServiceResult<FspMaintenanceReminder[]>> {
    try {
      const data = await this.coreClient.get<FspMaintenanceReminder[]>(
        `/api/V1/operator/${operatorId}/aircraft/${aircraftId}/maintenanceReminders`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
