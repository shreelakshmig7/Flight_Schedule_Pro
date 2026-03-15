/**
 * reservations.service.ts
 * -----------------------
 * Agentic Scheduler — FSP Integration — FSP Reservations service
 * --------------------------------------------------------------
 * Provides full CRUD and query operations for FSP reservations on the
 * core API. All public methods return ServiceResult.
 *
 * Key exports: ReservationsService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type {
  FspReservation,
  FspReservationCreateRequest,
  FspReservationListRequest,
  FspReservationListResponse,
  ServiceResult,
} from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for reservation CRUD and query operations on the FSP core API.
 */
@Injectable()
export class ReservationsService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Creates a new reservation (V2 endpoint).
   *
   * @param operatorId - The FSP operator identifier.
   * @param req        - Reservation creation payload.
   * @returns ServiceResult containing the created reservation, or an error.
   */
  public async createReservation(
    operatorId: string,
    req: FspReservationCreateRequest,
  ): Promise<ServiceResult<FspReservation>> {
    try {
      const data = await this.coreClient.post<FspReservation>('/api/V2/Reservation', {
        ...req,
        operatorId,
      });
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Validates a reservation without persisting it.
   *
   * @param operatorId - The FSP operator identifier.
   * @param req        - Reservation payload to validate.
   * @returns ServiceResult containing the validation result, or an error.
   */
  public async validateReservation(
    operatorId: string,
    req: FspReservationCreateRequest,
  ): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const data = await this.coreClient.post<Record<string, unknown>>(
        '/api/V2/Reservation/validate',
        { ...req, operatorId },
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves a single reservation by ID.
   *
   * @param operatorId     - The FSP operator identifier.
   * @param reservationId  - The reservation identifier.
   * @returns ServiceResult containing the reservation, or an error.
   */
  public async getReservation(
    operatorId: string,
    reservationId: string,
  ): Promise<ServiceResult<FspReservation>> {
    try {
      const data = await this.coreClient.get<FspReservation>(
        `/api/V1/operator/${operatorId}/reservations/${reservationId}`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves all reservations for a specific person (student or instructor).
   *
   * @param operatorId - The FSP operator identifier.
   * @param personId   - The person's user identifier.
   * @param params     - Optional query parameters (e.g. date range).
   * @returns ServiceResult containing an array of reservations, or an error.
   */
  public async getReservationsForPerson(
    operatorId: string,
    personId: string,
    params: Record<string, unknown>,
  ): Promise<ServiceResult<FspReservation[]>> {
    try {
      const data = await this.coreClient.get<FspReservation[]>(
        `/api/V1/operator/${operatorId}/persons/${personId}/reservations`,
        params,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Updates an existing reservation.
   *
   * @param operatorId     - The FSP operator identifier.
   * @param reservationId  - The reservation identifier.
   * @param req            - Updated reservation fields.
   * @returns ServiceResult containing the updated reservation, or an error.
   */
  public async updateReservation(
    operatorId: string,
    reservationId: string,
    req: Partial<FspReservationCreateRequest>,
  ): Promise<ServiceResult<FspReservation>> {
    try {
      const data = await this.coreClient.put<FspReservation>(
        `/api/V1/operator/${operatorId}/reservations/${reservationId}`,
        req,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Deletes a reservation.
   *
   * @param operatorId     - The FSP operator identifier.
   * @param reservationId  - The reservation identifier to delete.
   * @returns ServiceResult indicating success or failure.
   */
  public async deleteReservation(
    operatorId: string,
    reservationId: string,
  ): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const data = await this.coreClient.delete<Record<string, unknown>>(
        `/api/V1/operator/${operatorId}/reservations/${reservationId}`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Lists reservations for an operator using the known list endpoint.
   *
   * @param operatorId - The FSP operator identifier.
   * @param req        - Filter and pagination parameters.
   * @returns ServiceResult containing the paginated reservation list, or an error.
   */
  public async listReservations(
    operatorId: string,
    req: FspReservationListRequest,
  ): Promise<ServiceResult<FspReservationListResponse>> {
    try {
      const data = await this.coreClient.post<FspReservationListResponse>(
        `/api/V1/operator/${operatorId}/operatorReservations/list`,
        req,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Checks available times for a potential reservation.
   *
   * @param operatorId - The FSP operator identifier.
   * @param req        - Parameters describing the desired reservation window.
   * @returns ServiceResult containing available time options, or an error.
   */
  public async checkAvailableTimes(
    operatorId: string,
    req: Record<string, unknown>,
  ): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const data = await this.coreClient.post<Record<string, unknown>>(
        `/api/V1/operator/${operatorId}/reservations/availableTimes`,
        req,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Checks availability for a reservation request.
   *
   * @param operatorId - The FSP operator identifier.
   * @param req        - The reservation request to check.
   * @returns ServiceResult containing the availability result, or an error.
   */
  public async checkAvailability(
    operatorId: string,
    req: Record<string, unknown>,
  ): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const data = await this.coreClient.post<Record<string, unknown>>(
        `/api/V1/operator/${operatorId}/reservations/checkAvailability`,
        req,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves available aircraft options for a reservation request.
   *
   * @param operatorId - The FSP operator identifier.
   * @param req        - Parameters constraining aircraft selection.
   * @returns ServiceResult containing available aircraft options, or an error.
   */
  public async getAircraftOptions(
    operatorId: string,
    req: Record<string, unknown>,
  ): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const data = await this.coreClient.post<Record<string, unknown>>(
        `/api/V1/operator/${operatorId}/reservations/aircraftOptions`,
        req,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
