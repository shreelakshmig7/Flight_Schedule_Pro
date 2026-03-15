/**
 * setup.ts
 * --------
 * Agentic Scheduler — FSP Integration — Vitest global test setup (api)
 * --------------------------------------------------------------------
 * Imports reflect-metadata once for the entire test suite so NestJS
 * dependency injection metadata (emitted by TypeScript decorators) is
 * available in all test files that instantiate NestJS modules.
 *
 * Key exports: (setup file — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import 'reflect-metadata';
