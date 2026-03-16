/**
 * public.decorator.ts
 * -------------------
 * Agentic Scheduler — FSP Integration — @Public() route decorator
 * ---------------------------------------------------------------
 * Marks a controller handler or controller class as publicly accessible,
 * bypassing FspAuthGuard authentication. Used for endpoints like
 * POST /operators/bootstrap and GET /health.
 *
 * Key exports: Public (decorator factory)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import { SetMetadata } from '@nestjs/common';

/** Metadata key used by FspAuthGuard to detect public routes. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route or controller as publicly accessible.
 * When applied, FspAuthGuard will skip authentication for that route.
 *
 * @example
 * ```typescript
 * @Public()
 * @Post('bootstrap')
 * async bootstrap() { ... }
 * ```
 *
 * @returns A NestJS method/class decorator that sets isPublic metadata.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
