/**
 * availability.service.ts
 * -----------------------
 * Agentic Scheduler — FSP Integration — FSP Availability service
 * --------------------------------------------------------------
 * Provides user and batch availability queries, override management,
 * and reservation availability checks on the FSP core API.
 * All public methods return ServiceResult and never throw to the caller.
 *
 * Key exports: AvailabilityService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type {
  FspAvailability,
  FspAvailabilityBatchRequest,
  FspAvailabilityBatchResponse,
  FspAvailabilityOverride,
  FspReservationAvailabilityCheck,
  ServiceResult,
} from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for availability operations on the FSP core API.
 */
@Injectable()
export class AvailabilityService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Retrieves availability windows for a single user.
   *
   * @param operatorId - The FSP operator identifier.
   * @param userId     - The user whose availability to retrieve.
   * @param params     - Optional query parameters (e.g. date range).
   * @returns ServiceResult containing availability data, or an error.
   */
  public async getUserAvailability(
    operatorId: string,
    userId: string,
    params: Record<string, unknown>,
  ): Promise<ServiceResult<FspAvailability>> {
    try {
      const data = await this.coreClient.get<FspAvailability>(
        `/api/V1/operator/${operatorId}/availability/${userId}`,
        params,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves availability for multiple users in a single request.
   *
   * @param operatorId - The FSP operator identifier.
   * @param req        - Batch availability request body.
   * @returns ServiceResult containing batch availability results, or an error.
   */
  public async getBatchAvailability(
    operatorId: string,
    req: FspAvailabilityBatchRequest,
  ): Promise<ServiceResult<FspAvailabilityBatchResponse>> {
    try {
      const data = await this.coreClient.post<FspAvailabilityBatchResponse>(
        `/api/V1/operator/${operatorId}/availability/batch`,
        req,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves availability with all active overrides applied.
   *
   * @param operatorId - The FSP operator identifier.
   * @param userId     - The user whose availability to retrieve.
   * @param params     - Optional query parameters.
   * @returns ServiceResult containing availability data with overrides, or an error.
   */
  public async getAvailabilityWithOverrides(
    operatorId: string,
    userId: string,
    params: Record<string, unknown>,
  ): Promise<ServiceResult<FspAvailability>> {
    try {
      const data = await this.coreClient.get<FspAvailability>(
        `/api/V1/operator/${operatorId}/availability/${userId}/withOverrides`,
        params,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Checks whether a proposed reservation would create scheduling conflicts.
   *
   * @param operatorId - The FSP operator identifier.
   * @param req        - The reservation parameters to check.
   * @returns ServiceResult containing the availability check result, or an error.
   */
  public async checkReservationAvailability(
    operatorId: string,
    req: FspReservationAvailabilityCheck,
  ): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const data = await this.coreClient.post<Record<string, unknown>>(
        `/api/V1/operator/${operatorId}/availability/check`,
        req,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Adds an availability override for a user.
   *
   * @param operatorId - The FSP operator identifier.
   * @param userId     - The user to add the override for.
   * @param req        - The override to create.
   * @returns ServiceResult containing the created override, or an error.
   */
  public async addOverride(
    operatorId: string,
    userId: string,
    req: Omit<FspAvailabilityOverride, 'overrideId'>,
  ): Promise<ServiceResult<FspAvailabilityOverride>> {
    try {
      const data = await this.coreClient.post<FspAvailabilityOverride>(
        `/api/V1/operator/${operatorId}/availability/${userId}/overrides`,
        req,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Updates an existing availability override.
   *
   * @param operatorId  - The FSP operator identifier.
   * @param userId      - The user whose override to update.
   * @param overrideId  - The override identifier to update.
   * @param req         - Updated override data.
   * @returns ServiceResult containing the updated override, or an error.
   */
  public async updateOverride(
    operatorId: string,
    userId: string,
    overrideId: string,
    req: Partial<FspAvailabilityOverride>,
  ): Promise<ServiceResult<FspAvailabilityOverride>> {
    try {
      const data = await this.coreClient.put<FspAvailabilityOverride>(
        `/api/V1/operator/${operatorId}/availability/${userId}/overrides/${overrideId}`,
        req,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Deletes an availability override.
   *
   * @param operatorId  - The FSP operator identifier.
   * @param userId      - The user whose override to delete.
   * @param overrideId  - The override identifier to delete.
   * @returns ServiceResult containing the deletion response, or an error.
   */
  public async deleteOverride(
    operatorId: string,
    userId: string,
    overrideId: string,
  ): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const data = await this.coreClient.delete<Record<string, unknown>>(
        `/api/V1/operator/${operatorId}/availability/${userId}/overrides/${overrideId}`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
