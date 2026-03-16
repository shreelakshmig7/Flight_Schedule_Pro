/**
 * batch-reservations.service.ts
 * -----------------------------
 * Agentic Scheduler — FSP Integration — FSP BatchReservations service
 * -------------------------------------------------------------------
 * Provides batch reservation publishing and progress tracking on the
 * FSP core API. All public methods return ServiceResult.
 *
 * Key exports: BatchReservationsService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type {
  FspBatchReservationRequest,
  FspBatchReservationProgress,
  ServiceResult,
} from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for batch reservation operations on the FSP core API.
 */
@Injectable()
export class BatchReservationsService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Publishes a batch of reservations in a single API call.
   *
   * @param operatorId - The FSP operator identifier.
   * @param req        - The batch reservation request with an array of reservations.
   * @returns ServiceResult containing the batch progress record, or an error.
   */
  public async publishBatch(
    operatorId: string,
    req: FspBatchReservationRequest,
  ): Promise<ServiceResult<FspBatchReservationProgress>> {
    try {
      const data = await this.coreClient.post<FspBatchReservationProgress>(
        `/api/V1/operator/${operatorId}/batchReservations`,
        req,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves progress for an in-flight batch reservation job.
   *
   * @param operatorId - The FSP operator identifier.
   * @param batchId    - The batch job identifier.
   * @returns ServiceResult containing the batch progress record, or an error.
   */
  public async getBatchProgress(
    operatorId: string,
    batchId: string,
  ): Promise<ServiceResult<FspBatchReservationProgress>> {
    try {
      const data = await this.coreClient.get<FspBatchReservationProgress>(
        `/api/V1/operator/${operatorId}/batchReservations/${batchId}/progress`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
