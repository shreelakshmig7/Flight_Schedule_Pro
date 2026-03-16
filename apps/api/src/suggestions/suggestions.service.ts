/**
 * suggestions.service.ts
 * -----------------------
 * Agentic Scheduler — FSP Integration — Suggestions business logic service
 * -------------------------------------------------------------------------
 * Owns the suggestion lifecycle state machine. Enforces all valid state
 * transitions at the application layer (not DB constraints) so that invalid
 * transitions surface as typed NestJS exceptions with helpful messages.
 *
 * State machine (enforced here):
 *   PENDING  → APPROVED  approveSuggestion() — FSP validateOnly must pass
 *   PENDING  → REJECTED  rejectSuggestion()
 *   PENDING  → EXPIRED   expireSuggestions() cron job
 *   APPROVED → CREATED   (worker use-case handler — not this service)
 *
 * Key exports: SuggestionsService, CreateSuggestionDto, ListSuggestionsQuery,
 *              SuggestionListResult
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-10 — Suggestion State Machine
 */

import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService, Prisma } from '@fsp-scheduler/database';
import { ReservationsService } from '@fsp-scheduler/fsp-client';
import {
  SUGGESTION_STATUS,
  QUEUE_NAMES,
} from '@fsp-scheduler/shared-types';
import type {
  TenantContextData,
  FspReservationCreateRequest,
} from '@fsp-scheduler/shared-types';
import { SuggestionResultPublisher } from './suggestion-result.publisher';
import { randomUUID } from 'node:crypto';

/** Logger name for this service. */
const SERVICE_NAME = 'SuggestionsService';

// ── DTO / Query types ─────────────────────────────────────────────────────────

/** Input shape for creating a new suggestion. */
export interface CreateSuggestionDto {
  useCaseType: 'CANCELLATION_FILL' | 'NEW_OPENING' | 'WAITLIST_FILL';
  reservationId?: string;
  changeEventId?: string;
  /** Serialisable payload forwarded to FSP validateOnly on approval. */
  candidatePayload: Record<string, unknown>;
  /** ISO 8601 timestamp after which this suggestion auto-expires. */
  expiresAt?: string;
}

/** Query parameters for cursor-based list endpoint. */
export interface ListSuggestionsQuery {
  limit: number;
  afterCursor?: string;
  status?: string;
  useCaseType?: string;
}

/** Return shape from listSuggestions — cursor-paginated result set. */
export interface SuggestionListResult {
  items: unknown[];
  hasNextPage: boolean;
  nextCursor: string | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Service responsible for suggestion creation, approval, rejection, expiry,
 * and listing. Every mutating operation writes an AuditLog entry within the
 * same transaction for an immutable audit trail.
 */
@Injectable()
export class SuggestionsService {
  private readonly logger = new Logger(SERVICE_NAME);

  /**
   * @param prisma                   - Global PrismaService for database access.
   * @param fspReservationsService   - FSP ReservationsService for validateOnly calls.
   * @param suggestionResultPublisher - Service Bus publisher for approval events.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly fspReservationsService: ReservationsService,
    private readonly suggestionResultPublisher: SuggestionResultPublisher,
  ) {}

  // ── createSuggestion ───────────────────────────────────────────────────────

  /**
   * Creates a new suggestion in PENDING state.
   *
   * Writes the suggestion row and an audit log entry within a single
   * transaction. The candidate payload is stored as-is so that approveSuggestion
   * can forward it to FSP validateOnly without re-deriving it.
   *
   * @param tenant - Authenticated tenant context.
   * @param dto    - Suggestion creation parameters.
   * @returns The newly created Prisma Suggestion row.
   */
  public async createSuggestion(
    tenant: TenantContextData,
    dto: CreateSuggestionDto,
  ): Promise<unknown> {
    this.logger.log(
      `Creating suggestion operatorId=${tenant.operatorId} useCaseType=${dto.useCaseType}`,
    );

    const correlationId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const suggestion = await (tx as typeof this.prisma).suggestion.create({
        data: {
          operatorId: tenant.operatorId,
          fspOperatorId: tenant.fspOperatorId,
          useCaseType: dto.useCaseType,
          status: SUGGESTION_STATUS.PENDING,
          reservationId: dto.reservationId ?? null,
          changeEventId: dto.changeEventId ?? null,
          candidatePayload: dto.candidatePayload as Prisma.InputJsonValue,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
      });

      await (tx as typeof this.prisma).auditLog.create({
        data: {
          operatorId: tenant.operatorId,
          correlationId,
          service: SERVICE_NAME,
          action: 'suggestion.created',
          entityType: 'Suggestion',
          entityId: suggestion.id,
          metadata: {
            useCaseType: dto.useCaseType,
            status: SUGGESTION_STATUS.PENDING,
          },
        },
      });

      this.logger.log(
        `Suggestion created id=${suggestion.id} operatorId=${tenant.operatorId}`,
      );

      return suggestion;
    });
  }

  // ── approveSuggestion ──────────────────────────────────────────────────────

  /**
   * Transitions a suggestion from PENDING → APPROVED.
   *
   * Before the state transition:
   *   1. Verifies the suggestion exists and belongs to the current tenant.
   *   2. Verifies the current status is PENDING (otherwise 409).
   *   3. Calls FSP validateOnly with the stored candidatePayload.
   *      If FSP returns an error, throws ConflictException (409) — suggestion
   *      stays PENDING so the operator can correct and retry.
   *   4. Persists the status change and writes an audit log entry.
   *   5. Publishes a SuggestionResultMessage to the suggestion-results queue
   *      so the worker can execute the use-case handler.
   *
   * @param tenant       - Authenticated tenant context.
   * @param suggestionId - The suggestion row to approve.
   * @returns The updated Prisma Suggestion row.
   * @throws NotFoundException  if the suggestion is not found for this tenant.
   * @throws ConflictException  if the suggestion is not PENDING or FSP validation fails.
   */
  public async approveSuggestion(
    tenant: TenantContextData,
    suggestionId: string,
  ): Promise<unknown> {
    this.logger.log(
      `Approving suggestion id=${suggestionId} operatorId=${tenant.operatorId}`,
    );

    const correlationId = randomUUID();

    // ── 1. Load and verify ownership ────────────────────────────────────────
    const suggestion = await this.prisma.$transaction(async (tx) => {
      return (tx as typeof this.prisma).suggestion.findFirst({
        where: { id: suggestionId, operatorId: tenant.operatorId },
      });
    });

    if (!suggestion) {
      throw new NotFoundException(
        `Suggestion ${suggestionId} not found for operator ${tenant.operatorId}`,
      );
    }

    // ── 2. Guard: must be PENDING ────────────────────────────────────────────
    if (suggestion.status !== SUGGESTION_STATUS.PENDING) {
      throw new ConflictException(
        `Suggestion ${suggestionId} cannot be approved: current status is ${suggestion.status}`,
      );
    }

    // ── 3. FSP validateOnly ──────────────────────────────────────────────────
    const payload = suggestion.candidatePayload as Record<string, unknown> | null;

    const validateResult = await this.fspReservationsService.validateReservation(
      String(tenant.fspOperatorId),
      (payload ?? {}) as unknown as FspReservationCreateRequest,
    );

    if (!validateResult.success) {
      this.logger.warn(
        `FSP validateOnly failed for suggestion ${suggestionId}: ${validateResult.error}`,
      );
      throw new ConflictException(
        `FSP validation failed: ${validateResult.error}`,
      );
    }

    // ── 4. Persist state transition + audit log ──────────────────────────────
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedSuggestion = await (tx as typeof this.prisma).suggestion.update({
        where: { id: suggestionId },
        data: {
          status: SUGGESTION_STATUS.APPROVED,
          resolvedBy: tenant.userId,
          resolvedAt: now,
        },
      });

      await (tx as typeof this.prisma).auditLog.create({
        data: {
          operatorId: tenant.operatorId,
          correlationId,
          service: SERVICE_NAME,
          action: 'suggestion.approved',
          entityType: 'Suggestion',
          entityId: suggestionId,
          metadata: {
            previousStatus: SUGGESTION_STATUS.PENDING,
            newStatus: SUGGESTION_STATUS.APPROVED,
            resolvedBy: tenant.userId,
          },
        },
      });

      return updatedSuggestion;
    });

    // ── 5. Publish to suggestion-results queue ───────────────────────────────
    await this.suggestionResultPublisher.publishSuggestionResult({
      operatorId: tenant.operatorId,
      correlationId,
      enqueuedAt: now.toISOString(),
      suggestionId,
      useCaseType: suggestion.useCaseType,
      status: 'CREATED',
      createdAt: now.toISOString(),
    });

    this.logger.log(
      `Suggestion approved id=${suggestionId} operatorId=${tenant.operatorId}`,
    );

    return updated;
  }

  // ── rejectSuggestion ───────────────────────────────────────────────────────

  /**
   * Transitions a suggestion from PENDING → REJECTED.
   *
   * Stores the operator-supplied rejection reason and the userId who rejected it.
   * Writes an audit log entry within the same transaction.
   *
   * @param tenant         - Authenticated tenant context.
   * @param suggestionId   - The suggestion row to reject.
   * @param reason         - Human-readable rejection reason.
   * @returns The updated Prisma Suggestion row.
   * @throws NotFoundException  if the suggestion is not found for this tenant.
   * @throws ConflictException  if the suggestion is not PENDING.
   */
  public async rejectSuggestion(
    tenant: TenantContextData,
    suggestionId: string,
    reason: string,
  ): Promise<unknown> {
    this.logger.log(
      `Rejecting suggestion id=${suggestionId} operatorId=${tenant.operatorId}`,
    );

    const correlationId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      // ── 1. Load and verify ownership ──────────────────────────────────────
      const suggestion = await (tx as typeof this.prisma).suggestion.findFirst({
        where: { id: suggestionId, operatorId: tenant.operatorId },
      });

      if (!suggestion) {
        throw new NotFoundException(
          `Suggestion ${suggestionId} not found for operator ${tenant.operatorId}`,
        );
      }

      // ── 2. Guard: must be PENDING ──────────────────────────────────────────
      if (suggestion.status !== SUGGESTION_STATUS.PENDING) {
        throw new ConflictException(
          `Suggestion ${suggestionId} cannot be rejected: current status is ${suggestion.status}`,
        );
      }

      const now = new Date();

      // ── 3. Persist state transition ────────────────────────────────────────
      const updated = await (tx as typeof this.prisma).suggestion.update({
        where: { id: suggestionId },
        data: {
          status: SUGGESTION_STATUS.REJECTED,
          rejectionReason: reason,
          resolvedBy: tenant.userId,
          resolvedAt: now,
        },
      });

      // ── 4. Write audit log ─────────────────────────────────────────────────
      await (tx as typeof this.prisma).auditLog.create({
        data: {
          operatorId: tenant.operatorId,
          correlationId,
          service: SERVICE_NAME,
          action: 'suggestion.rejected',
          entityType: 'Suggestion',
          entityId: suggestionId,
          metadata: {
            previousStatus: SUGGESTION_STATUS.PENDING,
            newStatus: SUGGESTION_STATUS.REJECTED,
            rejectionReason: reason,
            resolvedBy: tenant.userId,
          },
        },
      });

      this.logger.log(
        `Suggestion rejected id=${suggestionId} operatorId=${tenant.operatorId}`,
      );

      return updated;
    });
  }

  // ── expireSuggestions ──────────────────────────────────────────────────────

  /**
   * Batch-transitions all PENDING suggestions whose `expiresAt` is in the past
   * to EXPIRED status.
   *
   * This method is invoked by a `@Cron` every 15 minutes. It uses a single
   * `updateMany` call so the operation is atomic and efficient regardless of
   * how many rows qualify. No individual audit log entries are written here
   * to keep the cron lightweight; the updateMany is itself the audit trail.
   *
   * @returns The number of suggestions transitioned to EXPIRED.
   */
  @Cron('0 */15 * * * *')
  public async expireSuggestions(): Promise<number> {
    const now = new Date();

    this.logger.log(`Running expiry cron at ${now.toISOString()}`);

    const result = await this.prisma.suggestion.updateMany({
      where: {
        status: SUGGESTION_STATUS.PENDING,
        expiresAt: { lt: now },
      },
      data: {
        status: SUGGESTION_STATUS.EXPIRED,
      },
    });

    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} suggestion(s) at ${now.toISOString()}`);
    }

    return result.count;
  }

  // ── listSuggestions ────────────────────────────────────────────────────────

  /**
   * Returns a cursor-paginated list of suggestions for the authenticated tenant.
   *
   * Uses keyset (cursor) pagination on the `id` field ordered by `createdAt`
   * descending. Fetches `limit + 1` rows; if the result set has more than
   * `limit` items, `hasNextPage` is true and the last item is stripped from
   * the returned items.
   *
   * @param tenant - Authenticated tenant context (provides operatorId for scoping).
   * @param query  - Pagination and filter parameters.
   * @returns A SuggestionListResult with items, hasNextPage, and nextCursor.
   */
  public async listSuggestions(
    tenant: TenantContextData,
    query: ListSuggestionsQuery,
  ): Promise<SuggestionListResult> {
    const { limit, afterCursor, status, useCaseType } = query;

    const where: Record<string, unknown> = {
      operatorId: tenant.operatorId,
    };

    if (status) where['status'] = status;
    if (useCaseType) where['useCaseType'] = useCaseType;

    const findArgs: Record<string, unknown> = {
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
    };

    if (afterCursor) {
      findArgs['cursor'] = { id: afterCursor };
      findArgs['skip'] = 1;
    }

    const rows = await this.prisma.suggestion.findMany(findArgs as Parameters<typeof this.prisma.suggestion.findMany>[0]);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage && items.length > 0
      ? (items[items.length - 1] as { id: string }).id
      : null;

    return { items, hasNextPage, nextCursor };
  }
}
