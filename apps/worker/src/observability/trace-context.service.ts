/**
 * trace-context.service.ts
 * -----------
 * Agentic Scheduler — FSP Integration — Distributed tracing context service
 * --------------------------------------------------------------------------
 * Manages distributed trace context (trace ID, span ID, correlation ID) for
 * propagating telemetry across service boundaries. Implements W3C Trace
 * Context standard for interoperability with Application Insights.
 *
 * Provides utilities for:
 * - Generating and propagating trace IDs and span IDs
 * - Extracting trace context from incoming requests
 * - Injecting trace context into outgoing requests
 *
 * Key exports: TraceContextService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-23 — Azure Application Insights Integration
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { TraceContext } from '@fsp-scheduler/shared-types';

/**
 * Service for managing distributed trace context.
 * Stores trace context in async local storage for correlation across async calls.
 */
@Injectable()
export class TraceContextService {
  private readonly logger = new Logger(TraceContextService.name);

  // AsyncLocalStorage would be used in production for async context propagation
  // For now, we use a simple Map-based approach (not async-safe)
  private readonly contextStore = new Map<string, TraceContext>();

  /**
   * Generate a new trace context with a unique trace ID and initial span ID.
   * Call this when a new trace begins (e.g., on initial request).
   */
  generateTraceContext(): TraceContext {
    return {
      traceId: this.generateTraceId(),
      spanId: this.generateSpanId(),
    };
  }

  /**
   * Create a child span context from an existing parent.
   * Used when propagating context to child services or async operations.
   */
  createChildSpan(parentContext: TraceContext): TraceContext {
    const context: TraceContext = {
      traceId: parentContext.traceId,
      spanId: this.generateSpanId(),
      parentSpanId: parentContext.spanId,
    };
    if (parentContext.traceState !== undefined) context.traceState = parentContext.traceState;
    return context;
  }

  /**
   * Parse trace context from W3C traceparent header format.
   * Format: `traceparent: 00-<trace-id>-<span-id>-<trace-flags>`
   * Example: `00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01`
   */
  parseTraceParent(traceparent: string): TraceContext | null {
    try {
      const parts = traceparent.split('-');
      if (parts.length !== 4) {
        return null;
      }
      const version = parts[0] ?? '';
      const traceId = parts[1] ?? '';
      const spanId = parts[2] ?? '';
      if (version !== '00') {
        return null; // Only version 00 supported
      }
      return { traceId, spanId };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to parse traceparent: ${errMsg}`);
      return null;
    }
  }

  /**
   * Format trace context to W3C traceparent header.
   */
  formatTraceParent(context: TraceContext): string {
    const traceFlags = '01'; // Always sampled in our case
    return `00-${context.traceId}-${context.spanId}-${traceFlags}`;
  }

  /**
   * Store trace context for later retrieval in async operations.
   * In production, use AsyncLocalStorage to avoid Map collisions.
   */
  setContext(context: TraceContext): void {
    const key = `${context.traceId}-${context.spanId}`;
    this.contextStore.set(key, context);
  }

  /**
   * Retrieve stored trace context.
   */
  getContext(traceId: string, spanId: string): TraceContext | undefined {
    const key = `${traceId}-${spanId}`;
    return this.contextStore.get(key);
  }

  /**
   * Clear context from storage (cleanup after trace completes).
   */
  clearContext(traceId: string, spanId: string): void {
    const key = `${traceId}-${spanId}`;
    this.contextStore.delete(key);
  }

  /**
   * Generate a valid W3C trace ID (32 hex characters).
   */
  private generateTraceId(): string {
    return randomUUID().replace(/-/g, '');
  }

  /**
   * Generate a valid W3C span ID (16 hex characters).
   */
  private generateSpanId(): string {
    // Use first 16 characters of a UUID (8 bytes in hex = 16 chars)
    return randomUUID().replace(/-/g, '').substring(0, 16);
  }
}
