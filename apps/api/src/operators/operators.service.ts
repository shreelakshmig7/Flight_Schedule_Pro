/**
 * operators.service.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — Operators business logic service
 * ----------------------------------------------------------------------
 * Provides operator bootstrap (idempotent upsert), config retrieval, and
 * priority weight configuration management (PR-11).
 *
 * getPriorityWeights returns the stored weights or DEFAULT_PRIORITY_WEIGHTS
 * when the operator has not yet configured custom weights.
 * updatePriorityWeights validates that all numeric weights are ≥ 0 before
 * persisting; throws BadRequestException otherwise.
 *
 * Key exports: OperatorsService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 * Updated: PR-11 — Priority Weight Engine (added getPriorityWeights, updatePriorityWeights)
 * Updated: PR-21 — Operator Configuration UI (added updatePolicy, updateNotificationConfig)
 */

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@fsp-scheduler/database';
import {
  DEFAULT_PRIORITY_WEIGHTS,
  OPERATOR_DEFAULT_POLLING_TIER,
} from '@fsp-scheduler/shared-types';
import type {
  OperatorBootstrapRequest,
  OperatorConfigResponse,
  PriorityWeightConfig,
  TenantContextData,
  UpdatePriorityWeightsRequest,
  SchedulingPolicyConfig,
  NotificationConfig,
  UpdatePolicyConfigRequest,
  UpdateNotificationConfigRequest,
} from '@fsp-scheduler/shared-types';

/** Logger name for this service. */
const SERVICE_NAME = 'OperatorsService';

/**
 * Service that handles operator lifecycle operations.
 * All database queries include operatorId (or fspOperatorId for bootstrap)
 * to enforce tenant isolation.
 */
@Injectable()
export class OperatorsService {
  private readonly logger = new Logger(SERVICE_NAME);

  /**
   * @param prisma - Global PrismaService for database access.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bootstraps an operator in the local database.
   *
   * Idempotent — if the operator already exists (matched by fspOperatorId),
   * it updates the name and returns the existing record. Safe to call
   * multiple times with the same fspOperatorId.
   *
   * @param req - Bootstrap request containing FSP operator ID and name.
   * @returns The operator config reflecting the created/updated record.
   */
  public async bootstrap(req: OperatorBootstrapRequest): Promise<OperatorConfigResponse> {
    this.logger.log(`Bootstrapping operator fspOperatorId=${req.fspOperatorId}`);

    const operator = await this.prisma.operator.upsert({
      where: { fspOperatorId: req.fspOperatorId },
      update: {
        name: req.operatorName,
        isActive: true,
      },
      create: {
        operatorId: `fsp-${req.fspOperatorId}`,
        fspOperatorId: req.fspOperatorId,
        name: req.operatorName,
        pollingTier: OPERATOR_DEFAULT_POLLING_TIER,
        isActive: true,
      },
    });

    this.logger.log(
      `Operator bootstrapped: id=${operator.operatorId} fspOperatorId=${operator.fspOperatorId}`,
    );

    return this.toConfigResponse(operator);
  }

  /**
   * Returns the operator configuration for the authenticated tenant.
   *
   * @param tenantContext - Authenticated tenant data from TenantContext.
   * @returns The operator config for the current tenant.
   * @throws Will propagate Prisma errors if the operator is not found.
   */
  public async getMyConfig(
    tenantContext: TenantContextData,
  ): Promise<OperatorConfigResponse> {
    this.logger.log(`Fetching config for operatorId=${tenantContext.operatorId}`);

    const operator = await this.prisma.operator.findUniqueOrThrow({
      where: { operatorId: tenantContext.operatorId },
    });

    return this.toConfigResponse(operator);
  }

  /**
   * Returns the priority weight configuration for the authenticated tenant.
   *
   * When the operator has not configured custom weights, returns the built-in
   * DEFAULT_PRIORITY_WEIGHTS so callers always receive a fully-populated config.
   *
   * @param tenantContext - Authenticated tenant data from TenantContext.
   * @returns The current PriorityWeightConfig for this operator.
   */
  public async getPriorityWeights(
    tenantContext: TenantContextData,
  ): Promise<PriorityWeightConfig> {
    this.logger.log(`Fetching priority weights for operatorId=${tenantContext.operatorId}`);

    const operator = await this.prisma.operator.findUniqueOrThrow({
      where: { operatorId: tenantContext.operatorId },
      select: { priorityWeights: true },
    });

    if (!operator.priorityWeights) {
      return this.buildDefaultConfig();
    }

    return this.parsePriorityWeights(operator.priorityWeights);
  }

  /**
   * Updates the priority weight configuration for the authenticated tenant.
   *
   * Performs a partial merge: only the fields present in `req` overwrite the
   * existing configuration. For customSignals, the incoming map is merged with
   * any existing custom signals.
   *
   * @param tenantContext - Authenticated tenant data from TenantContext.
   * @param req           - Partial update request body.
   * @returns The new PriorityWeightConfig after the update.
   * @throws BadRequestException if any numeric weight value is negative.
   */
  public async updatePriorityWeights(
    tenantContext: TenantContextData,
    req: UpdatePriorityWeightsRequest,
  ): Promise<PriorityWeightConfig> {
    this.logger.log(`Updating priority weights for operatorId=${tenantContext.operatorId}`);

    this.validateWeightRequest(req);

    const operator = await this.prisma.operator.findUniqueOrThrow({
      where: { operatorId: tenantContext.operatorId },
      select: { priorityWeights: true },
    });

    const current = operator.priorityWeights
      ? this.parsePriorityWeights(operator.priorityWeights)
      : this.buildDefaultConfig();

    const updated: PriorityWeightConfig = {
      timeSinceLastFlight: req.timeSinceLastFlight ?? current.timeSinceLastFlight,
      timeUntilNextScheduledFlight: req.timeUntilNextScheduledFlight ?? current.timeUntilNextScheduledFlight,
      totalFlightHours: req.totalFlightHours ?? current.totalFlightHours,
      flightHoursHigherIsBetter: req.flightHoursHigherIsBetter ?? current.flightHoursHigherIsBetter,
      customSignals: {
        ...current.customSignals,
        ...(req.customSignals ?? {}),
      },
    };

    await this.prisma.operator.update({
      where: { operatorId: tenantContext.operatorId },
      data: { priorityWeights: updated as object },
    });

    this.logger.log(`Priority weights updated for operatorId=${tenantContext.operatorId}`);
    return updated;
  }

  /**
   * Validates that all numeric fields in the request are non-negative.
   *
   * @param req - The incoming update request.
   * @throws BadRequestException if any numeric weight is < 0.
   */
  private validateWeightRequest(req: UpdatePriorityWeightsRequest): void {
    const numericFields: Array<keyof UpdatePriorityWeightsRequest> = [
      'timeSinceLastFlight',
      'timeUntilNextScheduledFlight',
      'totalFlightHours',
    ];

    for (const field of numericFields) {
      const value = req[field];
      if (typeof value === 'number' && value < 0) {
        throw new BadRequestException(`Weight values must be non-negative numbers: ${field} = ${value}`);
      }
    }

    if (req.customSignals) {
      for (const [key, value] of Object.entries(req.customSignals)) {
        if (value < 0) {
          throw new BadRequestException(`Weight values must be non-negative numbers: customSignals.${key} = ${value}`);
        }
      }
    }
  }

  /**
   * Constructs a PriorityWeightConfig from the built-in defaults.
   */
  private buildDefaultConfig(): PriorityWeightConfig {
    return {
      timeSinceLastFlight: DEFAULT_PRIORITY_WEIGHTS.timeSinceLastFlight,
      timeUntilNextScheduledFlight: DEFAULT_PRIORITY_WEIGHTS.timeUntilNextScheduledFlight,
      totalFlightHours: DEFAULT_PRIORITY_WEIGHTS.totalFlightHours,
      flightHoursHigherIsBetter: DEFAULT_PRIORITY_WEIGHTS.flightHoursHigherIsBetter,
      customSignals: { ...DEFAULT_PRIORITY_WEIGHTS.customSignals },
    };
  }

  /**
   * Safely parses a raw JSON value from the database into a PriorityWeightConfig.
   * Falls back to defaults for any missing fields to guarantee a full config shape.
   *
   * @param raw - Raw JSON value from Prisma (typed as Prisma.JsonValue).
   */
  private parsePriorityWeights(raw: unknown): PriorityWeightConfig {
    const defaults = this.buildDefaultConfig();
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return defaults;
    }
    const obj = raw as Record<string, unknown>;
    return {
      timeSinceLastFlight: typeof obj['timeSinceLastFlight'] === 'number'
        ? obj['timeSinceLastFlight']
        : defaults.timeSinceLastFlight,
      timeUntilNextScheduledFlight: typeof obj['timeUntilNextScheduledFlight'] === 'number'
        ? obj['timeUntilNextScheduledFlight']
        : defaults.timeUntilNextScheduledFlight,
      totalFlightHours: typeof obj['totalFlightHours'] === 'number'
        ? obj['totalFlightHours']
        : defaults.totalFlightHours,
      flightHoursHigherIsBetter: typeof obj['flightHoursHigherIsBetter'] === 'boolean'
        ? obj['flightHoursHigherIsBetter']
        : defaults.flightHoursHigherIsBetter,
      customSignals: (typeof obj['customSignals'] === 'object' && obj['customSignals'] !== null && !Array.isArray(obj['customSignals']))
        ? obj['customSignals'] as Record<string, number>
        : defaults.customSignals,
    };
  }

  /**
   * Updates the scheduling policy configuration for the authenticated tenant.
   *
   * Performs a partial merge: only the fields present in `req` overwrite the
   * existing configuration. Validates that rescheduleWindowDays > 0.
   *
   * @param tenantContext - Authenticated tenant data from TenantContext.
   * @param req           - Partial update request body.
   * @returns The new SchedulingPolicyConfig after the update.
   * @throws BadRequestException if rescheduleWindowDays is defined but <= 0.
   */
  public async updatePolicy(
    tenantContext: TenantContextData,
    req: UpdatePolicyConfigRequest,
  ): Promise<SchedulingPolicyConfig> {
    this.logger.log(`Updating policy for operatorId=${tenantContext.operatorId}`);

    // Validate rescheduleWindowDays if provided
    if (typeof req.rescheduleWindowDays === 'number' && req.rescheduleWindowDays <= 0) {
      throw new BadRequestException('rescheduleWindowDays must be greater than 0');
    }

    const operator = await this.prisma.operator.findUniqueOrThrow({
      where: { operatorId: tenantContext.operatorId },
      select: { policyConfig: true },
    });

    const current = operator.policyConfig
      ? this.parsePolicyConfig(operator.policyConfig)
      : this.buildDefaultPolicyConfig();

    const updated: SchedulingPolicyConfig = {
      rescheduleWindowDays: req.rescheduleWindowDays ?? current.rescheduleWindowDays,
    };
    // Use conditional assignment to satisfy exactOptionalPropertyTypes
    const psi = req.preferSameInstructor ?? current.preferSameInstructor;
    if (psi !== undefined) updated.preferSameInstructor = psi;

    const pci = req.preferContinuityInstructor ?? current.preferContinuityInstructor;
    if (pci !== undefined) updated.preferContinuityInstructor = pci;

    const dswd = req.discoverySearchWindowDays ?? current.discoverySearchWindowDays;
    if (dswd !== undefined) updated.discoverySearchWindowDays = dswd;

    const deii = req.discoveryEligibleInstructorIds ?? current.discoveryEligibleInstructorIds;
    if (deii !== undefined) updated.discoveryEligibleInstructorIds = deii;

    const deai = req.discoveryEligibleAircraftIds ?? current.discoveryEligibleAircraftIds;
    if (deai !== undefined) updated.discoveryEligibleAircraftIds = deai;

    await this.prisma.operator.update({
      where: { operatorId: tenantContext.operatorId },
      data: { policyConfig: updated as object },
    });

    this.logger.log(`Policy updated for operatorId=${tenantContext.operatorId}`);
    return updated;
  }

  /**
   * Updates the notification configuration for the authenticated tenant.
   *
   * Validates that SMS templates do not exceed 160 characters. Performs a partial
   * merge: only supplied sections are updated.
   *
   * @param tenantContext - Authenticated tenant data from TenantContext.
   * @param req           - Partial notification config update body.
   * @returns The new NotificationConfig after the update.
   * @throws BadRequestException if any SMS template exceeds 160 characters.
   */
  public async updateNotificationConfig(
    tenantContext: TenantContextData,
    req: UpdateNotificationConfigRequest,
  ): Promise<NotificationConfig> {
    this.logger.log(`Updating notification config for operatorId=${tenantContext.operatorId}`);

    // Validate SMS template character limits
    if (req.smsTemplates) {
      for (const [key, template] of Object.entries(req.smsTemplates)) {
        if (template.body.length > 160) {
          throw new BadRequestException(
            `SMS template '${key}' exceeds 160 character limit: ${template.body.length} chars`,
          );
        }
      }
    }

    const operator = await this.prisma.operator.findUniqueOrThrow({
      where: { operatorId: tenantContext.operatorId },
      select: { notificationConfig: true },
    });

    const current = operator.notificationConfig
      ? this.parseNotificationConfig(operator.notificationConfig)
      : this.buildDefaultNotificationConfig();

    const updated: NotificationConfig = {
      emailTemplates: {
        ...current.emailTemplates,
        ...(req.emailTemplates ?? {}),
      },
      smsTemplates: {
        ...current.smsTemplates,
        ...(req.smsTemplates ?? {}),
      },
    };

    await this.prisma.operator.update({
      where: { operatorId: tenantContext.operatorId },
      data: { notificationConfig: updated as object },
    });

    this.logger.log(`Notification config updated for operatorId=${tenantContext.operatorId}`);
    return updated;
  }

  /**
   * Constructs a default SchedulingPolicyConfig.
   */
  private buildDefaultPolicyConfig(): SchedulingPolicyConfig {
    return {
      rescheduleWindowDays: 30,
      preferSameInstructor: false,
      preferContinuityInstructor: false,
      discoverySearchWindowDays: 14,
      discoveryEligibleInstructorIds: [],
      discoveryEligibleAircraftIds: [],
    };
  }

  /**
   * Safely parses a raw JSON value from the database into a SchedulingPolicyConfig.
   * Falls back to defaults for any missing fields.
   *
   * @param raw - Raw JSON value from Prisma (typed as Prisma.JsonValue).
   */
  private parsePolicyConfig(raw: unknown): SchedulingPolicyConfig {
    const defaults = this.buildDefaultPolicyConfig();
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return defaults;
    }
    const obj = raw as Record<string, unknown>;
    const result: SchedulingPolicyConfig = {
      rescheduleWindowDays: typeof obj['rescheduleWindowDays'] === 'number'
        ? obj['rescheduleWindowDays']
        : defaults.rescheduleWindowDays,
    };
    const psi = typeof obj['preferSameInstructor'] === 'boolean'
      ? obj['preferSameInstructor']
      : defaults.preferSameInstructor;
    if (psi !== undefined) result.preferSameInstructor = psi;

    const pci = typeof obj['preferContinuityInstructor'] === 'boolean'
      ? obj['preferContinuityInstructor']
      : defaults.preferContinuityInstructor;
    if (pci !== undefined) result.preferContinuityInstructor = pci;

    const dsw = typeof obj['discoverySearchWindowDays'] === 'number'
      ? obj['discoverySearchWindowDays']
      : defaults.discoverySearchWindowDays;
    if (dsw !== undefined) result.discoverySearchWindowDays = dsw;

    const dei = Array.isArray(obj['discoveryEligibleInstructorIds'])
      ? obj['discoveryEligibleInstructorIds'] as string[]
      : defaults.discoveryEligibleInstructorIds;
    if (dei !== undefined) result.discoveryEligibleInstructorIds = dei;

    const dea = Array.isArray(obj['discoveryEligibleAircraftIds'])
      ? obj['discoveryEligibleAircraftIds'] as string[]
      : defaults.discoveryEligibleAircraftIds;
    if (dea !== undefined) result.discoveryEligibleAircraftIds = dea;

    return result;
  }

  /**
   * Constructs a default NotificationConfig.
   */
  private buildDefaultNotificationConfig(): NotificationConfig {
    return {
      emailTemplates: {},
      smsTemplates: {},
    };
  }

  /**
   * Safely parses a raw JSON value from the database into a NotificationConfig.
   * Falls back to defaults for any missing fields.
   *
   * @param raw - Raw JSON value from Prisma (typed as Prisma.JsonValue).
   */
  private parseNotificationConfig(raw: unknown): NotificationConfig {
    const defaults = this.buildDefaultNotificationConfig();
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return defaults;
    }
    const obj = raw as Record<string, unknown>;
    const result: NotificationConfig = {};

    const et = (typeof obj['emailTemplates'] === 'object' && obj['emailTemplates'] !== null && !Array.isArray(obj['emailTemplates']))
      ? obj['emailTemplates'] as unknown as Record<string, import('@fsp-scheduler/shared-types').EmailTemplate>
      : defaults.emailTemplates;
    if (et !== undefined) result.emailTemplates = et;

    const st = (typeof obj['smsTemplates'] === 'object' && obj['smsTemplates'] !== null && !Array.isArray(obj['smsTemplates']))
      ? obj['smsTemplates'] as unknown as Record<string, import('@fsp-scheduler/shared-types').SmsTemplate>
      : defaults.smsTemplates;
    if (st !== undefined) result.smsTemplates = st;

    return result;
  }

  /**
   * Maps a Prisma Operator record to the OperatorConfigResponse shape.
   *
   * @param operator - The Prisma Operator model instance.
   * @returns A serialisable OperatorConfigResponse.
   */
  private toConfigResponse(operator: {
    operatorId: string;
    fspOperatorId: number;
    name: string;
    pollingTier: string;
    isActive: boolean;
    createdAt: Date;
    priorityWeights?: unknown;
  }): OperatorConfigResponse {
    return {
      id: operator.operatorId,
      fspOperatorId: operator.fspOperatorId,
      name: operator.name,
      pollingTier: operator.pollingTier,
      priorityWeights: operator.priorityWeights
        ? this.parsePriorityWeights(operator.priorityWeights)
        : this.buildDefaultConfig(),
      policyConfig: {},
      isActive: operator.isActive,
      createdAt: operator.createdAt.toISOString(),
    };
  }
}
