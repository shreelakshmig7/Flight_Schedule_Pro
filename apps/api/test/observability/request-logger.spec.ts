/**
 * request-logger.spec.ts
 * -----------
 * Agentic Scheduler — FSP Integration — RequestLoggerInterceptor unit tests
 * --------------------------------------------------------------------------
 * Tests the structured request logging interceptor. Verifies that:
 * - Requests and responses are logged with correct structure
 * - operatorId and correlationId are extracted from headers
 * - Response time is calculated correctly
 * - HTTP status codes determine log levels (ERROR/WARN/INFO)
 * - Errors are captured and logged with details
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-23 — Azure Application Insights Integration
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { RequestLoggerInterceptor } from '../../src/observability/request-logger.interceptor';

/**
 * Helper to build a mock ExecutionContext for testing.
 */
function buildMockContext(
  method: string = 'GET',
  url: string = '/api/suggestions',
  headers: Record<string, string> = {},
  statusCode: number = 200,
): ExecutionContext {
  const request = { method, url, headers };
  const response = { statusCode };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('RequestLoggerInterceptor', () => {
  let interceptor: RequestLoggerInterceptor;
  let loggerLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    interceptor = new RequestLoggerInterceptor();
    loggerLogSpy = vi.spyOn(Logger.prototype, 'log');
  });

  // =========================================================================
  // Request Logging
  // =========================================================================

  describe('request logging', () => {
    it('should log incoming request with method and path', () => {
      const context = buildMockContext('GET', '/api/suggestions', {
        'x-operator-id': 'op-123',
        'x-correlation-id': 'trace-456',
      });

      const next = { handle: () => of({}) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(() => {
          const requestLog = loggerLogSpy.mock.calls.find(
            (call) =>
              call[0].type === 'REQUEST',
          );

          expect(requestLog).toBeDefined();
          expect(requestLog?.[0]).toMatchObject({
            type: 'REQUEST',
            method: 'GET',
            path: '/api/suggestions',
            operatorId: 'op-123',
            correlationId: 'trace-456',
            service: 'api',
            message: expect.stringContaining('GET /api/suggestions'),
          });
          resolve(undefined);
        });
      });
    });

    it('should extract operator ID from x-operator-id header', () => {
      const context = buildMockContext('POST', '/api/operators', {
        'x-operator-id': 'op-xyz-789',
      });

      const next = { handle: () => of({}) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(() => {
          const requestLog = loggerLogSpy.mock.calls.find(
            (call) => call[0].type === 'REQUEST',
          );

          expect(requestLog?.[0].operatorId).toBe('op-xyz-789');
          resolve(undefined);
        });
      });
    });

    it('should use unknown as operator ID if header is missing', () => {
      const context = buildMockContext('GET', '/health');

      const next = { handle: () => of({}) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(() => {
          const requestLog = loggerLogSpy.mock.calls.find(
            (call) => call[0].type === 'REQUEST',
          );

          expect(requestLog?.[0].operatorId).toBe('unknown');
          resolve(undefined);
        });
      });
    });
  });

  // =========================================================================
  // Correlation ID Extraction
  // =========================================================================

  describe('correlation ID extraction', () => {
    it('should extract trace ID from W3C traceparent header', () => {
      const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      const context = buildMockContext('GET', '/api/suggestions', {
        traceparent,
      });

      const next = { handle: () => of({}) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(() => {
          const requestLog = loggerLogSpy.mock.calls.find(
            (call) => call[0].type === 'REQUEST',
          );

          expect(requestLog?.[0].correlationId).toBe('0af7651916cd43dd8448eb211c80319c');
          resolve(undefined);
        });
      });
    });

    it('should fall back to x-correlation-id header if traceparent missing', () => {
      const context = buildMockContext('GET', '/api/suggestions', {
        'x-correlation-id': 'my-correlation-id',
      });

      const next = { handle: () => of({}) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(() => {
          const requestLog = loggerLogSpy.mock.calls.find(
            (call) => call[0].type === 'REQUEST',
          );

          expect(requestLog?.[0].correlationId).toBe('my-correlation-id');
          resolve(undefined);
        });
      });
    });

    it('should generate correlation ID if both headers missing', () => {
      const context = buildMockContext('GET', '/api/suggestions');

      const next = { handle: () => of({}) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(() => {
          const requestLog = loggerLogSpy.mock.calls.find(
            (call) => call[0].type === 'REQUEST',
          );

          expect(requestLog?.[0].correlationId).toBeDefined();
          expect(typeof requestLog?.[0].correlationId).toBe('string');
          expect(requestLog?.[0].correlationId.length).toBeGreaterThan(0);
          resolve(undefined);
        });
      });
    });
  });

  // =========================================================================
  // Response Logging
  // =========================================================================

  describe('response logging', () => {
    it('should log successful response with status code and duration', () => {
      const context = buildMockContext('POST', '/api/suggestions', {}, 201);

      const next = { handle: () => of({ id: '123' }) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(() => {
          const responseLog = loggerLogSpy.mock.calls.find(
            (call) => call[0].type === 'RESPONSE',
          );

          expect(responseLog).toBeDefined();
          expect(responseLog?.[0]).toMatchObject({
            type: 'RESPONSE',
            method: 'POST',
            path: '/api/suggestions',
            statusCode: 201,
            durationMs: expect.any(Number),
            message: expect.stringContaining('POST /api/suggestions 201'),
          });
          resolve(undefined);
        });
      });
    });

    it('should set INFO log level for 2xx responses', () => {
      const context = buildMockContext('GET', '/api/suggestions', {}, 200);

      const next = { handle: () => of({}) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(() => {
          const responseLog = loggerLogSpy.mock.calls.find(
            (call) => call[0].type === 'RESPONSE',
          );

          expect(responseLog?.[0].level).toBe('INFO');
          resolve(undefined);
        });
      });
    });

    it('should set WARN log level for 4xx responses', () => {
      const context = buildMockContext('GET', '/api/unknown', {}, 404);

      const next = { handle: () => of({}) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(() => {
          const responseLog = loggerLogSpy.mock.calls.find(
            (call) => call[0].type === 'RESPONSE',
          );

          expect(responseLog?.[0].level).toBe('WARN');
          resolve(undefined);
        });
      });
    });

    it('should set ERROR log level for 5xx responses', () => {
      const context = buildMockContext('POST', '/api/suggestions', {}, 500);

      const next = { handle: () => of({}) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(() => {
          const responseLog = loggerLogSpy.mock.calls.find(
            (call) => call[0].type === 'RESPONSE',
          );

          expect(responseLog?.[0].level).toBe('ERROR');
          resolve(undefined);
        });
      });
    });

    it('should measure and include response time in milliseconds', () => {
      const context = buildMockContext('GET', '/api/suggestions');

      const next = { handle: () => of({}) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(() => {
          const responseLog = loggerLogSpy.mock.calls.find(
            (call) => call[0].type === 'RESPONSE',
          );

          expect(responseLog?.[0].durationMs).toBeDefined();
          expect(typeof responseLog?.[0].durationMs).toBe('number');
          expect(responseLog?.[0].durationMs).toBeGreaterThanOrEqual(0);
          resolve(undefined);
        });
      });
    });
  });

  // =========================================================================
  // Error Handling
  // =========================================================================

  describe('error handling', () => {
    it('should log error responses with error details', () => {
      const context = buildMockContext('POST', '/api/suggestions', {}, 400);

      const error = new Error('Validation failed');
      (error as any).status = 400;

      const next = { handle: () => throwError(() => error) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe({
          error: () => {
            const errorLog = loggerLogSpy.mock.calls.find(
              (call) =>
                call[0].type === 'RESPONSE' && call[0].error,
            );

            expect(errorLog).toBeDefined();
            expect(errorLog?.[0]).toMatchObject({
              type: 'RESPONSE',
              statusCode: 400,
              error: {
                name: 'Error',
                message: 'Validation failed',
                status: 400,
              },
            });
            resolve(undefined);
          },
        });
      });
    });

    it('should default to 500 status if error has no status property', () => {
      const context = buildMockContext('POST', '/api/suggestions');

      const error = new Error('Unexpected error');

      const next = { handle: () => throwError(() => error) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe({
          error: () => {
            const errorLog = loggerLogSpy.mock.calls.find(
              (call) => call[0].type === 'RESPONSE',
            );

            expect(errorLog?.[0].statusCode).toBe(500);
            resolve(undefined);
          },
        });
      });
    });
  });

  // =========================================================================
  // Structured Logging
  // =========================================================================

  describe('structured logging format', () => {
    it('should include service identifier', () => {
      const context = buildMockContext();

      const next = { handle: () => of({}) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(() => {
          const logs = loggerLogSpy.mock.calls;
          logs.forEach((call) => {
            expect(call[0].service).toBe('api');
          });
          resolve(undefined);
        });
      });
    });

    it('should include app version', () => {
      const context = buildMockContext();

      const next = { handle: () => of({}) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(() => {
          const logs = loggerLogSpy.mock.calls;
          logs.forEach((call) => {
            expect(call[0].version).toBeDefined();
            expect(typeof call[0].version).toBe('string');
          });
          resolve(undefined);
        });
      });
    });

    it('should include ISO 8601 timestamp', () => {
      const context = buildMockContext();

      const next = { handle: () => of({}) };

      return new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(() => {
          const logs = loggerLogSpy.mock.calls;
          logs.forEach((call) => {
            expect(call[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
          });
          resolve(undefined);
        });
      });
    });
  });
});
