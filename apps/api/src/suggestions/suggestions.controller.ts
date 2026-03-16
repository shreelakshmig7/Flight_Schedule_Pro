/**
 * suggestions.controller.ts
 * --------------------------
 * Agentic Scheduler — FSP Integration — Suggestions REST controller
 * -----------------------------------------------------------------
 * Exposes six endpoints under /suggestions:
 *
 *   GET  /suggestions              — cursor-paginated list (tenant-scoped)
 *   POST /suggestions              — create a new PENDING suggestion
 *   POST /suggestions/:id/approve  — PENDING → APPROVED (FSP validateOnly)
 *   POST /suggestions/:id/reject   — PENDING → REJECTED
 *   POST /suggestions/bulk-approve — approve multiple suggestions sequentially
 *   POST /suggestions/bulk-reject  — reject multiple suggestions with same reason
 *
 * All endpoints are protected by the global FspAuthGuard. TenantContext is
 * populated by the guard before each handler executes.
 *
 * HTTP status codes:
 *   201 — suggestion created successfully
 *   200 — approve/reject/list/bulk completed successfully
 *   404 — suggestion not found for this tenant
 *   409 — invalid state transition or FSP validation failure
 *
 * Key exports: SuggestionsController
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-20 — Bulk Approve/Decline and Activity Feed
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { SuggestionsService } from './suggestions.service';
import { TenantContext } from '../auth/tenant-context';
import type { CreateSuggestionDto, ListSuggestionsQuery } from './suggestions.service';

/** Default page size for cursor-paginated list responses. */
const DEFAULT_LIST_LIMIT = 20;

/** Maximum allowed page size to prevent oversized queries. */
const MAX_LIST_LIMIT = 100;

/**
 * REST controller for the suggestion lifecycle endpoints.
 * All routes are prefixed with /suggestions.
 */
@Controller('suggestions')
export class SuggestionsController {
  /**
   * @param suggestionsService - Service handling all suggestion state machine logic.
   * @param tenantContext      - Request-scoped tenant context (populated by guard).
   */
  constructor(
    private readonly suggestionsService: SuggestionsService,
    private readonly tenantContext: TenantContext,
  ) {}

  // ── GET /suggestions ──────────────────────────────────────────────────────

  /**
   * Returns a cursor-paginated list of suggestions for the authenticated tenant.
   *
   * Query parameters:
   *   limit        — number of items per page (default 20, max 100)
   *   after        — cursor ID for next page (from previous response.nextCursor)
   *   status       — filter by suggestion status
   *   useCaseType  — filter by use-case type
   *
   * @param query - Raw query string parameters.
   * @returns SuggestionListResult with items, hasNextPage, and nextCursor.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  public async list(
    @Query() query: Record<string, string | undefined>,
  ) {
    const tenant = this.tenantContext.get();

    const rawLimit = query['limit'] ? parseInt(query['limit'], 10) : DEFAULT_LIST_LIMIT;
    const limit = Number.isNaN(rawLimit)
      ? DEFAULT_LIST_LIMIT
      : Math.min(rawLimit, MAX_LIST_LIMIT);

    // Build the query object, omitting undefined values for exactOptionalPropertyTypes compat
    const listQuery: ListSuggestionsQuery = { limit };
    const afterValue = query['after'];
    const statusValue = query['status'];
    const useCaseTypeValue = query['useCaseType'];
    if (afterValue !== undefined) listQuery.afterCursor = afterValue;
    if (statusValue !== undefined) listQuery.status = statusValue;
    if (useCaseTypeValue !== undefined) listQuery.useCaseType = useCaseTypeValue;

    return this.suggestionsService.listSuggestions(tenant, listQuery);
  }

  // ── POST /suggestions ─────────────────────────────────────────────────────

  /**
   * Creates a new suggestion in PENDING state.
   *
   * The request body must include useCaseType and candidatePayload. The
   * candidatePayload is stored as-is and forwarded to FSP validateOnly when
   * the suggestion is later approved.
   *
   * @param dto - Suggestion creation parameters.
   * @returns The newly created Suggestion row (HTTP 201).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async create(@Body() dto: CreateSuggestionDto) {
    const tenant = this.tenantContext.get();
    return this.suggestionsService.createSuggestion(tenant, dto);
  }

  // ── POST /suggestions/:id/approve ─────────────────────────────────────────

  /**
   * Approves a PENDING suggestion after passing FSP validateOnly.
   *
   * Returns the updated suggestion with status APPROVED on success.
   * Returns 409 if the suggestion is not PENDING or FSP validation fails.
   * Returns 404 if the suggestion does not belong to this tenant.
   *
   * @param id - The suggestion ID from the URL path.
   * @returns The updated Suggestion row (HTTP 200).
   */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  public async approve(@Param('id') id: string) {
    const tenant = this.tenantContext.get();
    return this.suggestionsService.approveSuggestion(tenant, id);
  }

  // ── POST /suggestions/:id/reject ──────────────────────────────────────────

  /**
   * Rejects a PENDING suggestion with an optional operator-supplied reason.
   *
   * Returns the updated suggestion with status REJECTED on success.
   * Returns 409 if the suggestion is not PENDING.
   * Returns 404 if the suggestion does not belong to this tenant.
   *
   * @param id   - The suggestion ID from the URL path.
   * @param body - Optional rejection body with a `reason` string.
   * @returns The updated Suggestion row (HTTP 200).
   */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  public async reject(
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const tenant = this.tenantContext.get();
    return this.suggestionsService.rejectSuggestion(tenant, id, body.reason ?? '');
  }

  // ── POST /suggestions/bulk-approve ────────────────────────────────────────

  /**
   * Bulk approves multiple PENDING suggestions sequentially.
   *
   * Processes suggestions one by one to avoid FSP rate limit exhaustion.
   * If any suggestion fails validation or is in an invalid state, it is
   * skipped and the rest continue processing.
   *
   * Returns an object with two arrays:
   *   - approved: suggestions that were successfully approved
   *   - failed: suggestions that failed with error reasons
   *
   * @param body - Request body with { suggestionIds: string[] }
   * @returns Object with approved and failed arrays (HTTP 200).
   */
  @Post('bulk-approve')
  @HttpCode(HttpStatus.OK)
  public async bulkApprove(
    @Body() body: { suggestionIds: string[] },
  ) {
    const tenant = this.tenantContext.get();
    return this.suggestionsService.bulkApproveSuggestions(tenant, body.suggestionIds);
  }

  // ── POST /suggestions/bulk-reject ─────────────────────────────────────────

  /**
   * Bulk rejects multiple PENDING suggestions with the same reason.
   *
   * Processes suggestions sequentially. If any suggestion is in an invalid
   * state or not found, it is skipped and the rest continue processing.
   * The same reason is applied to all selected suggestions.
   *
   * Returns an object with two arrays:
   *   - rejected: suggestions that were successfully rejected
   *   - failed: suggestions that failed with error reasons
   *
   * @param body - Request body with { suggestionIds: string[], reason: string }
   * @returns Object with rejected and failed arrays (HTTP 200).
   */
  @Post('bulk-reject')
  @HttpCode(HttpStatus.OK)
  public async bulkReject(
    @Body() body: { suggestionIds: string[]; reason: string },
  ) {
    const tenant = this.tenantContext.get();
    return this.suggestionsService.bulkRejectSuggestions(
      tenant,
      body.suggestionIds,
      body.reason,
    );
  }
}
