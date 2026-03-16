/**
 * operator.types.ts
 * -----------------
 * Agentic Scheduler — FSP Integration — Operator and tenant context types
 * -----------------------------------------------------------------------
 * Defines TypeScript types for the multi-tenant request context, operator
 * bootstrap requests, and operator configuration responses. These types
 * are shared between apps/api and apps/worker.
 *
 * Key exports: TenantContextData, OperatorBootstrapRequest,
 *              OperatorConfigResponse
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import type { PriorityWeightConfig } from './priority-weight.types';

/**
 * Data held by the request-scoped TenantContext provider.
 * Populated by FspAuthGuard after successful token validation.
 */
export interface TenantContextData {
  /** Internal UUID from the operators table (Operator.operatorId). */
  operatorId: string;
  /** FSP integer operatorId used in API calls. */
  fspOperatorId: number;
  /** FSP userId extracted from the validated token response. */
  userId: string;
  /** Raw FSP Bearer token for downstream FSP API calls. */
  bearerToken: string;
}

/**
 * Request body for bootstrapping a new operator tenant in the system.
 * Called once per operator before any other API interactions.
 */
export interface OperatorBootstrapRequest {
  /** FSP integer operatorId for this flight school. */
  fspOperatorId: number;
  /** Human-readable operator name. */
  operatorName: string;
  /** Azure Key Vault reference URL for the FSP subscription key. */
  fspSubscriptionKeyRef: string;
}

/**
 * Operator configuration returned by the operators API.
 * Reflects the stored operator record including scheduling policy settings.
 */
export interface OperatorConfigResponse {
  /** Internal UUID (Operator.operatorId string field). */
  id: string;
  /** FSP integer operatorId. */
  fspOperatorId: number;
  /** Human-readable operator name. */
  name: string;
  /** Polling frequency tier: TIER1 | TIER2 | TIER3. */
  pollingTier: string;
  /** Priority weights for scheduling decisions. */
  priorityWeights: PriorityWeightConfig;
  /** Policy configuration for scheduling rules. */
  policyConfig: Record<string, unknown> | object;
  /** Whether this operator is active and should be polled. */
  isActive: boolean;
  /** ISO 8601 timestamp when this operator record was created. */
  createdAt: string;
}
