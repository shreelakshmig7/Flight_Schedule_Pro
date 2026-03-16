/**
 * api-client.ts
 * --------
 * Agentic Scheduler — FSP Integration — Frontend API client
 * -------
 * Simple fetch wrapper providing type-safe access to the suggestions and audit APIs.
 * All methods use the API_BASE_URL environment variable or default to http://localhost:3000.
 *
 * Key exports: fetchSuggestions, approveSuggestion, rejectSuggestion,
 *              bulkApproveSuggestions, bulkRejectSuggestions, fetchAuditEntries
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-20 — Bulk Approve/Decline and Activity Feed
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

/**
 * Generic fetch wrapper that handles JSON responses and errors.
 */
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Suggestion type returned from the API.
 * Matches the Prisma Suggestion model shape.
 */
export interface Suggestion {
  id: string;
  operatorId: string;
  fspOperatorId: number;
  useCaseType: string;
  status: string;
  reservationId?: string | null;
  changeEventId?: string | null;
  candidatePayload?: Record<string, unknown> | null;
  llmPrompt?: string | null;
  llmResponse?: string | null;
  llmModel?: string | null;
  llmTokensUsed?: number | null;
  errorMessage?: string | null;
  expiresAt?: string | null;
  rejectionReason?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Query parameters for fetching suggestions.
 */
export interface FetchSuggestionsParams {
  limit?: number;
  afterCursor?: string;
  status?: string;
  useCaseType?: string;
}

/**
 * Response shape from the suggestions list endpoint.
 */
export interface SuggestionListResult {
  items: Suggestion[];
  hasNextPage: boolean;
  nextCursor: string | null;
}

/**
 * Fetches paginated suggestions from the API with optional filters.
 *
 * @param params - Query parameters for filtering and pagination.
 * @returns Promise resolving to a paginated result set.
 */
export async function fetchSuggestions(
  params: FetchSuggestionsParams = {},
): Promise<SuggestionListResult> {
  const searchParams = new URLSearchParams();

  if (params.limit !== undefined) searchParams.append('limit', params.limit.toString());
  if (params.afterCursor !== undefined) searchParams.append('after', params.afterCursor);
  if (params.status !== undefined) searchParams.append('status', params.status);
  if (params.useCaseType !== undefined) searchParams.append('useCaseType', params.useCaseType);

  const queryString = searchParams.toString();
  const endpoint = `/suggestions${queryString ? `?${queryString}` : ''}`;

  return fetchApi<SuggestionListResult>(endpoint);
}

/**
 * Approves a suggestion by its ID.
 * The suggestion must be in PENDING status; the API performs FSP validation.
 *
 * @param id - Suggestion ID.
 * @returns Promise resolving to the updated suggestion.
 */
export async function approveSuggestion(id: string): Promise<Suggestion> {
  return fetchApi<Suggestion>(`/suggestions/${id}/approve`, {
    method: 'POST',
  });
}

/**
 * Rejects a suggestion by its ID with an optional reason.
 * The suggestion must be in PENDING status.
 *
 * @param id - Suggestion ID.
 * @param reason - Optional rejection reason.
 * @returns Promise resolving to the updated suggestion.
 */
export async function rejectSuggestion(id: string, reason: string = ''): Promise<Suggestion> {
  return fetchApi<Suggestion>(`/suggestions/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/**
 * Bulk approve response shape.
 */
export interface BulkApproveResult {
  approved: Suggestion[];
  failed: Array<{ id: string; reason: string }>;
}

/**
 * Bulk approves multiple suggestions by their IDs.
 * Processes suggestions sequentially. Skips failures and continues.
 *
 * @param ids - Array of suggestion IDs to approve.
 * @returns Promise resolving to approved and failed arrays.
 */
export async function bulkApproveSuggestions(ids: string[]): Promise<BulkApproveResult> {
  return fetchApi<BulkApproveResult>('/suggestions/bulk-approve', {
    method: 'POST',
    body: JSON.stringify({ suggestionIds: ids }),
  });
}

/**
 * Bulk reject response shape.
 */
export interface BulkRejectResult {
  rejected: Suggestion[];
  failed: Array<{ id: string; reason: string }>;
}

/**
 * Bulk rejects multiple suggestions by their IDs with a single reason.
 * Processes suggestions sequentially. Skips failures and continues.
 *
 * @param ids - Array of suggestion IDs to reject.
 * @param reason - Rejection reason to apply to all suggestions.
 * @returns Promise resolving to rejected and failed arrays.
 */
export async function bulkRejectSuggestions(
  ids: string[],
  reason: string,
): Promise<BulkRejectResult> {
  return fetchApi<BulkRejectResult>('/suggestions/bulk-reject', {
    method: 'POST',
    body: JSON.stringify({ suggestionIds: ids, reason }),
  });
}

/**
 * Audit log entry from the API.
 */
export interface AuditEntry {
  id: string;
  eventType: string;
  actorId: string;
  suggestionId?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Audit entries response shape.
 */
export interface AuditEntriesResult {
  entries: AuditEntry[];
  nextCursor?: string;
}

/**
 * Fetches paginated audit log entries for the authenticated operator.
 *
 * @param limit - Number of entries to fetch (default 50, max 1000).
 * @param cursor - Optional cursor for pagination (ISO timestamp).
 * @returns Promise resolving to paginated audit entries.
 */
export async function fetchAuditEntries(
  limit: number = 50,
  cursor?: string,
): Promise<AuditEntriesResult> {
  const searchParams = new URLSearchParams();
  searchParams.append('limit', limit.toString());
  if (cursor) searchParams.append('cursor', cursor);

  const queryString = searchParams.toString();
  const endpoint = `/audit${queryString ? `?${queryString}` : ''}`;

  return fetchApi<AuditEntriesResult>(endpoint);
}
