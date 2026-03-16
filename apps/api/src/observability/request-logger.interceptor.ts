/**
 * request-logger.interceptor.ts
 * -----------
 * Agentic Scheduler — FSP Integration — Structured request logging interceptor
 * ------------------------------------------------------------------------------
 * NestJS interceptor that logs all HTTP requests and responses with structured
 * format. Includes:
 * - Request metadata: method, path, headers, query params
 * - Response metadata: status code, response time
 * - Structured fields: operatorId, correlationId, service, version
 *
 * Logs to Application Insights in JSON format for easy querying and correlation.
 *
 * Key exports: RequestLoggerInterceptor
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-23 — Azure Application Insights Integration
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  Logger,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { StructuredLogEntry } from '@fsp-scheduler/shared-types';

/** Minimal request shape used by the interceptor. */
interface HttpRequest {
  method: string;
  url: string;
  headers?: Record<string, string | string[] | undefined>;
}

/** Minimal response shape used by the interceptor. */
interface HttpResponse {
  statusCode: number;
}

/**
 * Interceptor for structured logging of all HTTP requests and responses.
 * Applied globally to all routes in the API application.
 */
@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggerInterceptor.name);
  private readonly appVersion = process.env.APP_VERSION || '0.1.0';

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const request = context.switchToHttp().getRequest<HttpRequest>();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const response = context.switchToHttp().getResponse<HttpResponse>();

    // Extract request metadata
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const method: string = request.method;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const path: string = request.url;
    const startTime = Date.now();

    // Extract operator ID and correlation ID from headers or context
    const operatorId = this.extractOperatorId(request);
    const correlationId = this.extractCorrelationId(request);

    // Log request
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.logRequest(method, path, operatorId, correlationId);

    // Hook into response to log after completion
    return next.handle().pipe(
      tap(
        () => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const statusCode: number = response.statusCode;
          const duration = Date.now() - startTime;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          this.logResponse(
            method,
            path,
            statusCode,
            duration,
            operatorId,
            correlationId,
          );
        },
        (error: unknown) => {
          const duration = Date.now() - startTime;
          const statusCode = (error && typeof error === 'object' && 'status' in error && typeof (error as Record<string, unknown>).status === 'number')
            ? (error as Record<string, unknown>).status as number
            : 500;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          this.logResponse(
            method,
            path,
            statusCode,
            duration,
            operatorId,
            correlationId,
            error,
          );
        },
      ),
    );
  }

  /**
   * Extract operator ID from request.
   * Comes from x-operator-id header (set by FspAuthGuard).
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  private extractOperatorId(request: HttpRequest): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const operatorId = request.headers?.['x-operator-id'];
    return typeof operatorId === 'string' ? operatorId : 'unknown';
  }

  /**
   * Extract or generate correlation ID for distributed tracing.
   * Prioritize traceparent header (W3C), fall back to x-correlation-id.
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  private extractCorrelationId(request: HttpRequest): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const traceparent = request.headers?.['traceparent'];
    if (typeof traceparent === 'string') {
      // Extract trace ID from traceparent: 00-<trace-id>-<span-id>-<flags>
      const parts = traceparent.split('-');
      if (parts.length >= 3) {
        return parts[1] ?? ''; // trace-id is at index 1
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const correlationId = request.headers?.['x-correlation-id'];
    if (typeof correlationId === 'string') {
      return correlationId;
    }

    // Generate new correlation ID if not present
    return this.generateCorrelationId();
  }

  /**
   * Generate a new correlation ID (simple UUID).
   */
  private generateCorrelationId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Log incoming request.
   */
  private logRequest(
    method: string,
    path: string,
    operatorId: string,
    correlationId: string,
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const logEntry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: `${method} ${path}`,
      operatorId,
      correlationId,
      service: 'api',
      version: this.appVersion,
      type: 'REQUEST',
      method,
      path,
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.logger.log(logEntry);
  }

  /**
   * Log response with status and duration.
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  private logResponse(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    operatorId: string,
    correlationId: string,
    error?: unknown,
  ): void {
    const level = this.getLogLevel(statusCode);
    const message = error
      ? `${method} ${path} ${statusCode} (${duration}ms) - Error`
      : `${method} ${path} ${statusCode} (${duration}ms)`;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const logEntry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      operatorId,
      correlationId,
      service: 'api',
      version: this.appVersion,
      type: 'RESPONSE',
      method,
      path,
      statusCode,
      durationMs: duration,
    };

    if (error && typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      logEntry.error = {
        name: String(errorObj.name),
        message: String(errorObj.message),
        status: typeof errorObj.status === 'number' ? errorObj.status : 500,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.logger.log(logEntry);
  }

  /**
   * Determine log level based on HTTP status code.
   */
  private getLogLevel(
    statusCode: number,
  ): StructuredLogEntry['level'] {
    if (statusCode >= 500) {
      return 'ERROR';
    }
    if (statusCode >= 400) {
      return 'WARN';
    }
    return 'INFO';
  }
}
