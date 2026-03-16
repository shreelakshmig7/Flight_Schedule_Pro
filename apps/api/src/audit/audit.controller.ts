/**
 * audit.controller.ts
 * -------------------
 * Agentic Scheduler — FSP Integration — Audit REST controller
 * -----------------------------------------------------------
 * Handles audit log query endpoints with cursor-based pagination
 * and optional filtering.
 *
 * GET  /audit           — paginated audit log, filterable by event_type, actor_id, suggestion_id, date range
 * GET  /audit/:id       — single audit log entry
 *
 * Key exports: AuditController
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-22 — Immutable Audit Log
 */

import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuditService, AuditLogPage, AuditLogEntry, AuditLogFilters, AuditLogPaginationParams } from './audit.service';
import { TenantContext } from '../auth/tenant-context';

/**
 * REST controller for audit log query endpoints.
 * All routes are prefixed with /audit.
 */
@Controller('audit')
export class AuditController {
  /**
   * @param auditService - Service handling audit log queries and archival.
   * @param tenantContext - Request-scoped tenant context (populated by guard).
   */
  constructor(
    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Lists paginated audit entries for the authenticated operator.
   *
   * Supports cursor-based pagination via the `cursor` query parameter (ISO timestamp).
   * Filtering by event type, actor ID, suggestion ID, and date range is optional.
   *
   * @param limit - Number of entries to return (default: 50, max: 1000).
   * @param cursor - ISO timestamp cursor for pagination.
   * @param eventType - Filter by action (e.g., 'SUGGESTION_CREATED').
   * @param actorId - Filter by operatorId.
   * @param suggestionId - Filter by entityId.
   * @param startDate - ISO timestamp for range start (createdAt >= startDate).
   * @param endDate - ISO timestamp for range end (createdAt <= endDate).
   * @returns Paginated audit log page with nextCursor if more results exist.
   */
  @Get()
  public async listAuditEntries(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('event_type') eventType?: string,
    @Query('actor_id') actorId?: string,
    @Query('suggestion_id') suggestionId?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ): Promise<AuditLogPage> {
    const tenantData = this.tenantContext.get();

    const filters: AuditLogFilters = {};
    if (eventType) {
      filters.eventType = eventType;
    }
    if (actorId) {
      filters.actorId = actorId;
    }
    if (suggestionId) {
      filters.suggestionId = suggestionId;
    }
    if (startDate) {
      filters.startDate = new Date(startDate);
    }
    if (endDate) {
      filters.endDate = new Date(endDate);
    }

    const pagination: AuditLogPaginationParams = {
      limit: limit ? parseInt(limit, 10) : 50,
    };
    if (cursor !== undefined) {
      pagination.cursor = cursor;
    }

    return this.auditService.listAuditEntries(tenantData, filters, pagination);
  }

  /**
   * Retrieves a single audit log entry by ID.
   *
   * Enforces tenant isolation — returns 404 if the entry does not exist
   * or if the requesting operator does not own it.
   *
   * @param id - The audit log entry ID.
   * @returns The audit log entry or null if not found or unauthorized.
   */
  @Get(':id')
  public async getAuditEntry(@Param('id') id: string): Promise<AuditLogEntry | null> {
    const tenantData = this.tenantContext.get();
    return this.auditService.getAuditEntry(tenantData, id);
  }
}
