/**
 * flight-alerts.service.ts
 * ------------------------
 * Agentic Scheduler — FSP Integration — FSP FlightAlerts service
 * --------------------------------------------------------------
 * Provides flight alert listing, creation, update, completion, and
 * filtering operations on the FSP core API.
 * All public methods return ServiceResult and never throw to the caller.
 *
 * Key exports: FlightAlertsService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type {
  FspFlightAlert,
  FspFlightAlertCreateRequest,
  ServiceResult,
} from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for flight alert operations on the FSP core API.
 */
@Injectable()
export class FlightAlertsService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Lists flight alerts for the operator with optional query filters.
   *
   * @param operatorId - The FSP operator identifier.
   * @param params     - Optional query parameters (e.g. severity, date range).
   * @returns ServiceResult containing an array of flight alerts, or an error.
   */
  public async listAlerts(
    operatorId: string,
    params: Record<string, unknown>,
  ): Promise<ServiceResult<FspFlightAlert[]>> {
    try {
      const data = await this.coreClient.get<FspFlightAlert[]>(
        `/api/V1/operator/${operatorId}/flightAlerts`,
        params,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Creates a new flight alert.
   *
   * @param operatorId - The FSP operator identifier.
   * @param req        - The alert creation payload.
   * @returns ServiceResult containing the created alert, or an error.
   */
  public async createAlert(
    operatorId: string,
    req: FspFlightAlertCreateRequest,
  ): Promise<ServiceResult<FspFlightAlert>> {
    try {
      const data = await this.coreClient.post<FspFlightAlert>(
        `/api/V1/operator/${operatorId}/flightAlerts`,
        req,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Updates an existing flight alert.
   *
   * @param operatorId - The FSP operator identifier.
   * @param alertId    - The alert identifier to update.
   * @param req        - Updated alert fields.
   * @returns ServiceResult containing the updated alert, or an error.
   */
  public async updateAlert(
    operatorId: string,
    alertId: string,
    req: Partial<FspFlightAlertCreateRequest>,
  ): Promise<ServiceResult<FspFlightAlert>> {
    try {
      const data = await this.coreClient.put<FspFlightAlert>(
        `/api/V1/operator/${operatorId}/flightAlerts/${alertId}`,
        req,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Marks a flight alert as completed.
   *
   * @param operatorId - The FSP operator identifier.
   * @param alertId    - The alert identifier to complete.
   * @returns ServiceResult containing the updated alert, or an error.
   */
  public async completeAlert(
    operatorId: string,
    alertId: string,
  ): Promise<ServiceResult<FspFlightAlert>> {
    try {
      const data = await this.coreClient.post<FspFlightAlert>(
        `/api/V1/operator/${operatorId}/flightAlerts/${alertId}/complete`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves all overdue flight alerts for the operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing an array of overdue alerts, or an error.
   */
  public async getOverdueAlerts(operatorId: string): Promise<ServiceResult<FspFlightAlert[]>> {
    try {
      const data = await this.coreClient.get<FspFlightAlert[]>(
        `/api/V1/operator/${operatorId}/flightAlerts/overdue`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves flight alerts associated with a specific aircraft.
   *
   * @param operatorId - The FSP operator identifier.
   * @param aircraftId - The aircraft identifier.
   * @returns ServiceResult containing an array of alerts, or an error.
   */
  public async getAlertsByAircraft(
    operatorId: string,
    aircraftId: string,
  ): Promise<ServiceResult<FspFlightAlert[]>> {
    try {
      const data = await this.coreClient.get<FspFlightAlert[]>(
        `/api/V1/operator/${operatorId}/flightAlerts/aircraft/${aircraftId}`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves flight alerts filtered by alert type.
   *
   * @param operatorId - The FSP operator identifier.
   * @param alertType  - The alert type string to filter by.
   * @returns ServiceResult containing an array of alerts, or an error.
   */
  public async getAlertsByType(
    operatorId: string,
    alertType: string,
  ): Promise<ServiceResult<FspFlightAlert[]>> {
    try {
      const data = await this.coreClient.get<FspFlightAlert[]>(
        `/api/V1/operator/${operatorId}/flightAlerts/type/${alertType}`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
