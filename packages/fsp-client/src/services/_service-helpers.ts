/**
 * _service-helpers.ts
 * -------------------
 * Agentic Scheduler — FSP Integration — Internal service utility helpers
 * -----------------------------------------------------------------------
 * Shared error-building utilities used by all 19 FSP service classes.
 * This file is intentionally prefixed with _ to signal it is internal to
 * the services directory and should not be exported from the package index.
 *
 * Key exports: buildError
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import type { ServiceResult } from '@fsp-scheduler/shared-types';
import { FspApiError } from '../fsp.errors';

/**
 * Converts a caught unknown error into a typed failure ServiceResult.
 *
 * @param err - The caught error (unknown type at call site).
 * @returns A failure ServiceResult with error message and optional FSP errors.
 */
export function buildError<T>(err: unknown): ServiceResult<T> {
  if (err instanceof FspApiError && err.fspErrors !== undefined) {
    return {
      success: false,
      error: err.message,
      data: null,
      fspErrors: err.fspErrors,
    };
  }
  if (err instanceof FspApiError) {
    return {
      success: false,
      error: err.message,
      data: null,
    };
  }
  return {
    success: false,
    error: err instanceof Error ? err.message : String(err),
    data: null,
  };
}
