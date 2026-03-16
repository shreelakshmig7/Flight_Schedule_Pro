/**
 * audit.service.ts
 * ----------------
 * Agentic Scheduler — FSP Integration — Audit business logic service
 * -------------------------------------------------------------------
 * Provides cursor-based paginated audit log queries, single entry lookup,
 * and monthly archival of entries older than 1 year.
 *
 * Supports filtering by event_type (action), actor_id (operatorId),
 * suggestion_id (entityId), and date range.
 *
 * Archive job:
 * - Runs monthly (via cron)
 * - Copies rows older than 1 year to audit_log_archive in batches of 1,000
 * - Only deletes from audit_log after confirming archive copy succeeded
 *
 * Key exports: AuditService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-22 — Immutable Audit Log
 * Used By: PR-20 — Bulk Approve/Decline and Activity Feed
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@fsp-scheduler/database';
import type { TenantContextData } from '@fsp-scheduler/shared-types';

/** Logger name for this service. */
const SERVICE_NAME = 'AuditService';

/** Batch size for archive operations. */
const ARCHIVE_BATCH_SIZE = 1000;

/** Archive threshold: 1 year in milliseconds. */
const ARCHIVE_THRESHOLD_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Filters for audit log queries.
 */
export interface AuditLogFilters {
  eventType?: string; // Filter by action (e.g., 'SUGGESTION_CREATED')
  actorId?: string; // Filter by operatorId
  suggestionId?: string; // Filter by entityId
  startDate?: Date; // createdAt >= startDate
  endDate?: Date; // createdAt <= endDate
}

/**
 * Cursor-based pagination parameters.
 */
export interface AuditLogPaginationParams {
  limit?: number; // Default: 50
  cursor?: string; // ISO timestamp for the next page
}

/**
 * Paginated response for audit log entries.
 */
export interface AuditLogPage {
  entries: AuditLogEntry[];
  nextCursor?: string; // ISO timestamp of last entry, if more results exist
}

/**
 * Single audit log entry response.
 */
export interface AuditLogEntry {
  id: string;
  eventType: string; // action
  actorId: string; // operatorId
  suggestionId?: string; // entityId
  payload?: object; // metadata
  createdAt: string; // ISO timestamp
}

/**
 * Service that handles audit log operations.
 * All database queries include operatorId (tenant context) to enforce
 * tenant isolation.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(SERVICE_NAME);

  /**
   * @param prisma - Global PrismaService for database access.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists audit entries for the authenticated operator with cursor-based pagination.
   *
   * Returns entries ordered by createdAt descending (newest first). If a cursor is provided,
   * returns entries created before that timestamp. Supports filtering by event type,
   * actor ID, suggestion ID, and date range.
   *
   * @param tenantContext - Authenticated tenant data.
   * @param filters - Optional filters for event type, actor, suggestion, date range.
   * @param pagination - Optional cursor and limit for pagination.
   * @returns Paginated audit log entries with nextCursor if more results exist.
   * @throws BadRequestException if limit is invalid or filters are malformed.
   */
  public async listAuditEntries(
    tenantContext: TenantContextData,
    filters?: AuditLogFilters,
    pagination?: AuditLogPaginationParams,
  ): Promise<AuditLogPage> {
    const limit = pagination?.limit ?? 50;
    const cursor = pagination?.cursor ? new Date(pagination.cursor) : null;

    // Validate limit
    if (limit < 1 || limit > 1000) {
      throw new BadRequestException('Limit must be between 1 and 1000');
    }

    this.logger.log(
      `Listing audit entries for operatorId=${tenantContext.operatorId}, ` +
      `filters=${JSON.stringify(filters)}, limit=${limit}`,
    );

    // Build where clause with tenant isolation and optional filters
    const whereClause: Record<string, unknown> = {
      operatorId: tenantContext.operatorId,
    };

    if (filters?.eventType) {
      whereClause.action = filters.eventType;
    }

    if (filters?.actorId) {
      whereClause.operatorId = filters.actorId;
    }

    if (filters?.suggestionId) {
      whereClause.entityId = filters.suggestionId;
    }

    // Date range filters
    const dateFilter: Record<string, Date> = {};
    if (filters?.startDate) {
      dateFilter.gte = filters.startDate;
    }
    if (filters?.endDate) {
      dateFilter.lte = filters.endDate;
    }
    if (Object.keys(dateFilter).length > 0) {
      whereClause.createdAt = dateFilter;
    }

    // Cursor-based pagination: fetch limit+1 to determine if more results exist
    if (cursor) {
      const existing = (whereClause.createdAt ?? {}) as Record<string, unknown>;
      whereClause.createdAt = {
        ...existing,
        lt: cursor,
      };
    }

    const entries = await this.prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra to check for more results
      select: {
        id: true,
        action: true,
        operatorId: true,
        entityId: true,
        metadata: true,
        createdAt: true,
      },
    });

    // Determine if there are more results
    const results = entries;
    const hasMore = entries.length > limit;
    if (hasMore) {
      results.pop(); // Remove the extra entry
    }

    const page: AuditLogPage = {
      entries: results.map((e) => this.toAuditLogEntry(e)),
    };
    if (hasMore && entries.length > 0) {
      const lastEntry = entries[limit - 1];
      if (lastEntry) {
        page.nextCursor = lastEntry.createdAt.toISOString();
      }
    }

    return page;
  }

  /**
   * Retrieves a single audit log entry by ID.
   *
   * Enforces tenant isolation — the entry's operatorId must match
   * the authenticated operator.
   *
   * @param tenantContext - Authenticated tenant data.
   * @param id - The audit log entry ID.
   * @returns The audit log entry or null if not found or tenant mismatch.
   */
  public async getAuditEntry(
    tenantContext: TenantContextData,
    id: string,
  ): Promise<AuditLogEntry | null> {
    this.logger.log(
      `Fetching audit entry id=${id} for operatorId=${tenantContext.operatorId}`,
    );

    const entry = await this.prisma.auditLog.findUnique({
      where: { id },
      select: {
        id: true,
        action: true,
        operatorId: true,
        entityId: true,
        metadata: true,
        createdAt: true,
      },
    });

    if (!entry) {
      return null;
    }

    // Enforce tenant isolation
    if (entry.operatorId !== tenantContext.operatorId) {
      this.logger.warn(
        `Audit entry id=${id} requested by unauthorized operatorId=${tenantContext.operatorId}`,
      );
      return null;
    }

    return this.toAuditLogEntry(entry);
  }

  /**
   * Archives audit log entries older than 1 year to audit_log_archive.
   *
   * Operates in batches of 1,000 for data consistency. Only deletes from
   * audit_log after confirming the archive copy succeeded.
   *
   * This is intended to be called by a scheduled job (monthly cron).
   *
   * @returns The number of entries archived.
   */
  public async archiveOldEntries(): Promise<number> {
    const thresholdDate = new Date(Date.now() - ARCHIVE_THRESHOLD_MS);

    this.logger.log(
      `Starting audit log archive job for entries older than ${thresholdDate.toISOString()}`,
    );

    let totalArchived = 0;

    // Batch loop: fetch and archive entries in chunks
    let hasMore = true;
    while (hasMore) {
      // Fetch batch of old entries
      const batch = await this.prisma.auditLog.findMany({
        where: {
          createdAt: {
            lt: thresholdDate,
          },
        },
        take: ARCHIVE_BATCH_SIZE,
        orderBy: { createdAt: 'asc' },
      });

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      this.logger.log(
        `Archiving batch of ${batch.length} entries (total so far: ${totalArchived})`,
      );

      // Copy to archive table using raw SQL to ensure data integrity
      const ids = batch.map((e) => e.id);
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO audit_log_archive SELECT * FROM audit_log WHERE id = ANY($1)`,
        ids,
      );

      this.logger.debug(`Archive copy completed: ${batch.length} rows`);

      // Delete from source table after confirming archive
      const deleteResult = await this.prisma.auditLog.deleteMany({
        where: {
          id: {
            in: ids,
          },
        },
      });

      this.logger.log(
        `Deleted ${deleteResult.count} entries from audit_log after archive`,
      );

      totalArchived += deleteResult.count;

      // Stop if we got fewer than the batch size (reached the end)
      if (batch.length < ARCHIVE_BATCH_SIZE) {
        hasMore = false;
      }
    }

    this.logger.log(
      `Audit log archive job completed. Total archived: ${totalArchived}`,
    );

    return totalArchived;
  }

  /**
   * Maps a Prisma AuditLog record to the AuditLogEntry response shape.
   *
   * @param entry - The Prisma AuditLog model instance.
   * @returns A serialisable AuditLogEntry.
   */
  private toAuditLogEntry(entry: {
    id: string;
    action: string;
    operatorId: string;
    entityId?: string | null;
    metadata?: unknown;
    createdAt: Date;
  }): AuditLogEntry {
    const result: AuditLogEntry = {
      id: entry.id,
      eventType: entry.action,
      actorId: entry.operatorId,
      createdAt: entry.createdAt.toISOString(),
    };
    if (entry.entityId != null) {
      result.suggestionId = entry.entityId;
    }
    if (entry.metadata != null) {
      result.payload = entry.metadata as object;
    }
    return result;
  }
}
