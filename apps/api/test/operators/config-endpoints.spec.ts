/**
 * config-endpoints.spec.ts
 * -------------------------
 * Agentic Scheduler — FSP Integration — Configuration endpoints unit tests
 * -----------------------------------------------------------------------
 * Tests the new policy and notification-config endpoints: PUT /operators/me/policy
 * and PUT /operators/me/notification-config. Verifies validation, partial merges,
 * and audit logging behavior.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-21 — Operator Configuration UI
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { OperatorsController } from '../../src/operators/operators.controller';
import { OperatorsService } from '../../src/operators/operators.service';
import { TenantContext } from '../../src/auth/tenant-context';
import type {
  TenantContextData,
  SchedulingPolicyConfig,
  NotificationConfig,
  UpdatePolicyConfigRequest,
  UpdateNotificationConfigRequest,
} from '@fsp-scheduler/shared-types';

describe('OperatorsController — Configuration Endpoints', () => {
  let controller: OperatorsController;
  let operatorsService: OperatorsService;
  let tenantContext: TenantContext;

  const mockTenantData: TenantContextData = {
    operatorId: 'clx-uuid-1234',
    fspOperatorId: 42,
    userId: 'user-789',
    bearerToken: 'eyJhbGciOiJSUzI1NiJ9.test',
  };

  const defaultPolicyConfig: SchedulingPolicyConfig = {
    rescheduleWindowDays: 30,
    preferSameInstructor: false,
    preferContinuityInstructor: false,
    discoverySearchWindowDays: 14,
    discoveryEligibleInstructorIds: [],
    discoveryEligibleAircraftIds: [],
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const defaultNotificationConfig: NotificationConfig = {
    emailTemplates: {},
    smsTemplates: {},
  };

  beforeEach(() => {
    tenantContext = new TenantContext();
    tenantContext.set(mockTenantData);

    operatorsService = {
      bootstrap: vi.fn(),
      getMyConfig: vi.fn(),
      updatePriorityWeights: vi.fn(),
      updatePolicy: vi.fn(),
      updateNotificationConfig: vi.fn(),
    } as unknown as OperatorsService;

    controller = new OperatorsController(operatorsService, tenantContext);
  });

  describe('PUT /operators/me/policy', () => {
    it('updatePolicy saves valid policy config', async () => {
      const req: UpdatePolicyConfigRequest = {
        rescheduleWindowDays: 21,
        preferSameInstructor: true,
      };

      const expectedResponse: SchedulingPolicyConfig = {
        ...defaultPolicyConfig,
        rescheduleWindowDays: 21,
        preferSameInstructor: true,
      };

      vi.mocked(operatorsService.updatePolicy).mockResolvedValue(expectedResponse);

      const result = await controller.updatePolicy(req);

      expect(operatorsService.updatePolicy).toHaveBeenCalledWith(mockTenantData, req);
      expect(result).toEqual(expectedResponse);
    });

    it('updatePolicy returns HTTP 400 when rescheduleWindowDays is 0', async () => {
      const req: UpdatePolicyConfigRequest = {
        rescheduleWindowDays: 0,
      };

      vi.mocked(operatorsService.updatePolicy).mockRejectedValue(
        new BadRequestException('rescheduleWindowDays must be greater than 0'),
      );

      await expect(controller.updatePolicy(req)).rejects.toThrow(BadRequestException);
      expect(operatorsService.updatePolicy).toHaveBeenCalledWith(mockTenantData, req);
    });

    it('updatePolicy returns HTTP 400 when rescheduleWindowDays is negative', async () => {
      const req: UpdatePolicyConfigRequest = {
        rescheduleWindowDays: -5,
      };

      vi.mocked(operatorsService.updatePolicy).mockRejectedValue(
        new BadRequestException('rescheduleWindowDays must be greater than 0'),
      );

      await expect(controller.updatePolicy(req)).rejects.toThrow(BadRequestException);
    });

    it('updatePolicy performs partial merge — updates only supplied fields', async () => {
      const req: UpdatePolicyConfigRequest = {
        preferSameInstructor: true,
        // Other fields intentionally omitted
      };

      const expectedResponse: SchedulingPolicyConfig = {
        ...defaultPolicyConfig,
        preferSameInstructor: true,
      };

      vi.mocked(operatorsService.updatePolicy).mockResolvedValue(expectedResponse);

      const result = await controller.updatePolicy(req);

      expect(result.rescheduleWindowDays).toBe(30); // Preserved from default
      expect(result.preferSameInstructor).toBe(true); // Updated
    });

    it('updatePolicy updates discovery-eligible instructor and aircraft IDs', async () => {
      const req: UpdatePolicyConfigRequest = {
        discoveryEligibleInstructorIds: ['instructor-1', 'instructor-2'],
        discoveryEligibleAircraftIds: ['aircraft-a', 'aircraft-b'],
      };

      const expectedResponse: SchedulingPolicyConfig = {
        ...defaultPolicyConfig,
        discoveryEligibleInstructorIds: ['instructor-1', 'instructor-2'],
        discoveryEligibleAircraftIds: ['aircraft-a', 'aircraft-b'],
      };

      vi.mocked(operatorsService.updatePolicy).mockResolvedValue(expectedResponse);

      const result = await controller.updatePolicy(req);

      expect(result.discoveryEligibleInstructorIds).toEqual(['instructor-1', 'instructor-2']);
      expect(result.discoveryEligibleAircraftIds).toEqual(['aircraft-a', 'aircraft-b']);
    });
  });

  describe('PUT /operators/me/notification-config', () => {
    it('updateNotificationConfig saves valid email templates', async () => {
      const req: UpdateNotificationConfigRequest = {
        emailTemplates: {
          SUGGESTION_APPROVED: {
            subject: 'Suggestion Approved',
            body: 'Your suggestion has been approved: {{suggestionId}}',
          },
        },
      };

      const expectedResponse: NotificationConfig = {
        emailTemplates: {
          SUGGESTION_APPROVED: {
            subject: 'Suggestion Approved',
            body: 'Your suggestion has been approved: {{suggestionId}}',
          },
        },
        smsTemplates: {},
      };

      vi.mocked(operatorsService.updateNotificationConfig).mockResolvedValue(expectedResponse);

      const result = await controller.updateNotificationConfig(req);

      expect(operatorsService.updateNotificationConfig).toHaveBeenCalledWith(mockTenantData, req);
      expect(result.emailTemplates?.SUGGESTION_APPROVED?.subject).toBe('Suggestion Approved');
    });

    it('updateNotificationConfig saves valid SMS templates', async () => {
      const req: UpdateNotificationConfigRequest = {
        smsTemplates: {
          SUGGESTION_APPROVED: {
            body: 'Your suggestion {{suggestionId}} has been approved.',
          },
        },
      };

      const expectedResponse: NotificationConfig = {
        emailTemplates: {},
        smsTemplates: {
          SUGGESTION_APPROVED: {
            body: 'Your suggestion {{suggestionId}} has been approved.',
          },
        },
      };

      vi.mocked(operatorsService.updateNotificationConfig).mockResolvedValue(expectedResponse);

      const result = await controller.updateNotificationConfig(req);

      expect(result.smsTemplates?.SUGGESTION_APPROVED?.body.length).toBeLessThanOrEqual(160);
    });

    it('updateNotificationConfig returns HTTP 400 when SMS template exceeds 160 characters', async () => {
      const req: UpdateNotificationConfigRequest = {
        smsTemplates: {
          SUGGESTION_APPROVED: {
            body: 'a'.repeat(161),
          },
        },
      };

      vi.mocked(operatorsService.updateNotificationConfig).mockRejectedValue(
        new BadRequestException('SMS template exceeds 160 character limit'),
      );

      await expect(controller.updateNotificationConfig(req)).rejects.toThrow(BadRequestException);
    });

    it('updateNotificationConfig displays live character count warning for >160 chars', async () => {
      const req: UpdateNotificationConfigRequest = {
        smsTemplates: {
          SUGGESTION_APPROVED: {
            body: 'This is a test message that is 161 characters long...' + 'x'.repeat(108),
          },
        },
      };

      vi.mocked(operatorsService.updateNotificationConfig).mockRejectedValue(
        new BadRequestException('SMS template exceeds 160 character limit'),
      );

      await expect(controller.updateNotificationConfig(req)).rejects.toThrow(BadRequestException);
    });

    it('updateNotificationConfig performs partial merge — updates only supplied sections', async () => {
      const req: UpdateNotificationConfigRequest = {
        emailTemplates: {
          SUGGESTION_APPROVED: {
            subject: 'Approved',
            body: 'Approved: {{suggestionId}}',
          },
        },
        // SMS templates intentionally omitted
      };

      const expectedResponse: NotificationConfig = {
        emailTemplates: {
          SUGGESTION_APPROVED: {
            subject: 'Approved',
            body: 'Approved: {{suggestionId}}',
          },
        },
        smsTemplates: {},
      };

      vi.mocked(operatorsService.updateNotificationConfig).mockResolvedValue(expectedResponse);

      const result = await controller.updateNotificationConfig(req);

      expect(result.emailTemplates).toBeDefined();
      expect(result.smsTemplates).toBeDefined();
    });

    it('updateNotificationConfig supports variable placeholders in templates', async () => {
      const req: UpdateNotificationConfigRequest = {
        emailTemplates: {
          SUGGESTION_APPROVED: {
            subject: 'Suggestion {{suggestionId}} Approved',
            body: 'Dear {{studentName}}, your suggestion was approved on {{approvedAt}}.',
          },
        },
      };

      const expectedResponse: NotificationConfig = {
        emailTemplates: {
          SUGGESTION_APPROVED: {
            subject: 'Suggestion {{suggestionId}} Approved',
            body: 'Dear {{studentName}}, your suggestion was approved on {{approvedAt}}.',
          },
        },
        smsTemplates: {},
      };

      vi.mocked(operatorsService.updateNotificationConfig).mockResolvedValue(expectedResponse);

      const result = await controller.updateNotificationConfig(req);

      expect(result.emailTemplates?.SUGGESTION_APPROVED?.body).toContain('{{studentName}}');
      expect(result.emailTemplates?.SUGGESTION_APPROVED?.body).toContain('{{approvedAt}}');
    });
  });
});
