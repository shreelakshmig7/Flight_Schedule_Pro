/**
 * setup.ts
 * --------
 * Agentic Scheduler — FSP Integration — Vitest global test setup
 * --------------------------------------------------------------
 * Imports reflect-metadata once for the entire test suite so NestJS
 * dependency injection metadata (emitted by TypeScript decorators) is
 * available in all test files that instantiate NestJS modules.
 *
 * Key exports: (setup file — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 */

import 'reflect-metadata';
