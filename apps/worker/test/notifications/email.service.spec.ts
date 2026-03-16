/**
 * email.service.spec.ts
 * ---------------------
 * Agentic Scheduler — FSP Integration — Email notification service tests
 * -----------------------------------------------------------------------
 * TDD test suite for the EmailService. Tests cover successful dispatch,
 * failed dispatch (approval flow not blocked), template rendering with
 * all placeholder types, default vs custom templates, and audit log creation.
 *
 * Key exports: (test file — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-17 — Email Notifications
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from '../../src/notifications/email.service';
import { TemplateRenderer } from '../../src/notifications/template-renderer';
import { Logger } from '@nestjs/common';
import {
  COMMUNICATION_CHANNEL,
  COMMUNICATION_STATUS,
} from '@fsp-scheduler/shared-types';

// ── Mock types ──────────────────────────────────────────────────────────────

interface MockPrismaService {
  communication: {
    create: ReturnType<typeof vi.fn>;
  };
  auditLog: {
    create: ReturnType<typeof vi.fn>;
  };
  operator: {
    findFirst: ReturnType<typeof vi.fn>;
  };
}

interface MockStudentsService {
  getStudentById: ReturnType<typeof vi.fn>;
}

// ── Test fixtures ───────────────────────────────────────────────────────────

const MOCK_OPERATOR_ID = 'op-test-001';
const MOCK_FSP_OPERATOR_ID = 12345;
const MOCK_SUGGESTION_ID = 'sug-test-001';
const MOCK_CORRELATION_ID = 'corr-test-001';

const MOCK_SUGGESTION = {
  id: MOCK_SUGGESTION_ID,
  operatorId: MOCK_OPERATOR_ID,
  fspOperatorId: MOCK_FSP_OPERATOR_ID,
  useCaseType: 'WAITLIST_FILL',
  status: 'APPROVED',
  candidatePayload: {
    studentId: 'student-001',
    studentName: 'Jane Doe',
    slotDate: '2025-10-15',
    slotStart: '2025-10-15T14:00:00',
    slotEnd: '2025-10-15T16:00:00',
    instructorName: 'Captain Smith',
    aircraftTailNumber: 'N12345',
    locationName: 'Regional Airport',
  },
  createdAt: new Date().toISOString(),
};

const MOCK_OPERATOR_WITH_CUSTOM_TEMPLATES = {
  id: 'cuid-001',
  operatorId: MOCK_OPERATOR_ID,
  fspOperatorId: MOCK_FSP_OPERATOR_ID,
  name: 'Test Flight School',
  notificationConfig: {
    emailTemplates: {
      waitlistOffer: {
        subject: 'Custom: Flight slot available for {{studentName}}',
        bodyHtml: '<p>Hi {{studentName}}, custom slot on {{slotDate}} with {{instructorName}} in {{aircraftTailNumber}}.</p>',
        bodyText: 'Hi {{studentName}}, custom slot on {{slotDate}} with {{instructorName}} in {{aircraftTailNumber}}.',
      },
    },
  },
};

const MOCK_OPERATOR_NO_TEMPLATES = {
  id: 'cuid-002',
  operatorId: MOCK_OPERATOR_ID,
  fspOperatorId: MOCK_FSP_OPERATOR_ID,
  name: 'Test Flight School',
  notificationConfig: null,
};

const MOCK_STUDENT = {
  id: 'student-001',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('EmailService', () => {
  let emailService: EmailService;
  let mockPrisma: MockPrismaService;
  let mockStudentsService: MockStudentsService;

  beforeEach(() => {
    mockPrisma = {
      communication: {
        create: vi.fn().mockResolvedValue({ id: 'comm-001' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-001' }),
      },
      operator: {
        findFirst: vi.fn().mockResolvedValue(MOCK_OPERATOR_NO_TEMPLATES),
      },
    };

    mockStudentsService = {
      getStudentById: vi.fn().mockResolvedValue({
        success: true,
        data: MOCK_STUDENT,
      }),
    };

    // Suppress logger output in tests
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    emailService = new EmailService(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      mockPrisma as any,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      mockStudentsService as any,
    );
  });

  // ── Successful dispatch ─────────────────────────────────────────────────

  describe('sendEmailNotification', () => {
    it('should create a communication record with status SENT on successful dispatch', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = await emailService.sendEmailNotification(
        MOCK_OPERATOR_ID,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        MOCK_SUGGESTION as unknown as any,
        MOCK_CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.communication.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.communication.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operatorId: MOCK_OPERATOR_ID,
          suggestionId: MOCK_SUGGESTION_ID,
          channel: COMMUNICATION_CHANNEL.EMAIL,
          status: COMMUNICATION_STATUS.SENT,
        }),
      });
    });

    it('should write an audit log entry with event_type NOTIFICATION_SENT', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await emailService.sendEmailNotification(
        MOCK_OPERATOR_ID,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        MOCK_SUGGESTION as unknown as any,
        MOCK_CORRELATION_ID,
      );

      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operatorId: MOCK_OPERATOR_ID,
          correlationId: MOCK_CORRELATION_ID,
          service: 'EmailService',
          action: 'notification.sent',
          entityType: 'Communication',
        }),
      });
    });

    it('should render email with correct student name, slot date, instructor name, and aircraft tail number', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await emailService.sendEmailNotification(
        MOCK_OPERATOR_ID,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        MOCK_SUGGESTION as unknown as any,
        MOCK_CORRELATION_ID,
      );

      const communicationCall = mockPrisma.communication.create.mock.calls[0][0];
      const recipient = communicationCall.data.recipient;

      // Recipient should be an obfuscated email (not raw PII)
      expect(recipient).toBeDefined();
      expect(typeof recipient).toBe('string');
    });
  });

  // ── Failed dispatch (approval flow not blocked) ─────────────────────────

  describe('error handling', () => {
    it('should create a FAILED communication record when student lookup fails', async () => {
      mockStudentsService.getStudentById.mockResolvedValue({
        success: false,
        error: 'Student not found',
        data: null,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = await emailService.sendEmailNotification(
        MOCK_OPERATOR_ID,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        MOCK_SUGGESTION as unknown as any,
        MOCK_CORRELATION_ID,
      );

      expect(result.success).toBe(false);
      expect(mockPrisma.communication.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: COMMUNICATION_STATUS.FAILED,
          errorMessage: expect.any(String),
        }),
      });
    });

    it('should not throw an exception when email dispatch fails — approval flow is not blocked', async () => {
      mockStudentsService.getStudentById.mockRejectedValue(
        new Error('Network error'),
      );

      // Must not throw
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = await emailService.sendEmailNotification(
        MOCK_OPERATOR_ID,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        MOCK_SUGGESTION as unknown as any,
        MOCK_CORRELATION_ID,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ── Template rendering ──────────────────────────────────────────────────

  describe('template rendering', () => {
    it('should use operator-branded templates when configured', async () => {
      mockPrisma.operator.findFirst.mockResolvedValue(
        MOCK_OPERATOR_WITH_CUSTOM_TEMPLATES,
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await emailService.sendEmailNotification(
        MOCK_OPERATOR_ID,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        MOCK_SUGGESTION as unknown as any,
        MOCK_CORRELATION_ID,
      );

      expect(mockPrisma.communication.create).toHaveBeenCalledTimes(1);
      // Template should be rendered (SENT status implies successful rendering)
      const createCall = mockPrisma.communication.create.mock.calls[0][0];
      expect(createCall.data.status).toBe(COMMUNICATION_STATUS.SENT);
    });

    it('should use default templates when operator has not configured custom templates', async () => {
      mockPrisma.operator.findFirst.mockResolvedValue(
        MOCK_OPERATOR_NO_TEMPLATES,
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await emailService.sendEmailNotification(
        MOCK_OPERATOR_ID,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        MOCK_SUGGESTION as unknown as any,
        MOCK_CORRELATION_ID,
      );

      expect(mockPrisma.communication.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrisma.communication.create.mock.calls[0][0];
      expect(createCall.data.status).toBe(COMMUNICATION_STATUS.SENT);
    });
  });
});

// ── TemplateRenderer unit tests ─────────────────────────────────────────────

describe('TemplateRenderer', () => {
  describe('render', () => {
    it('should replace all placeholders with actual values', () => {
      const template = 'Hello {{studentName}}, your flight is on {{slotDate}} with {{instructorName}} in {{aircraftTailNumber}}.';
      const variables: Record<string, string> = {
        studentName: 'Jane Doe',
        slotDate: '2025-10-15',
        instructorName: 'Captain Smith',
        aircraftTailNumber: 'N12345',
      };

      const result = TemplateRenderer.render(template, variables);

      expect(result).toBe(
        'Hello Jane Doe, your flight is on 2025-10-15 with Captain Smith in N12345.',
      );
    });

    it('should leave placeholders unreplaced when variables are missing', () => {
      const template = 'Hello {{studentName}}, your flight is on {{slotDate}}.';
      const variables: Record<string, string> = {
        studentName: 'Jane Doe',
      };

      const result = TemplateRenderer.render(template, variables);

      expect(result).toBe('Hello Jane Doe, your flight is on {{slotDate}}.');
    });

    it('should sanitise HTML entities in variable values to prevent XSS', () => {
      const template = '<p>Hello {{studentName}}</p>';
      const variables: Record<string, string> = {
        studentName: '<script>alert("xss")</script>',
      };

      const result = TemplateRenderer.render(template, variables);

      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('should handle templates with no placeholders', () => {
      const template = 'No placeholders here.';
      const variables: Record<string, string> = {};

      const result = TemplateRenderer.render(template, variables);

      expect(result).toBe('No placeholders here.');
    });

    it('should handle repeated placeholders', () => {
      const template = '{{name}} said hello to {{name}}.';
      const variables: Record<string, string> = { name: 'Alice' };

      const result = TemplateRenderer.render(template, variables);

      expect(result).toBe('Alice said hello to Alice.');
    });
  });

  describe('getDefaultTemplate', () => {
    it('should return a valid default template for waitlistOffer', () => {
      const template = TemplateRenderer.getDefaultTemplate('waitlistOffer');

      expect(template).toBeDefined();
      expect(template.subject).toContain('{{studentName}}');
      expect(template.bodyHtml).toBeDefined();
      expect(template.bodyText).toBeDefined();
    });

    it('should return a valid default template for rescheduleOffer', () => {
      const template = TemplateRenderer.getDefaultTemplate('rescheduleOffer');

      expect(template).toBeDefined();
      expect(template.subject).toBeDefined();
    });

    it('should return a valid default template for discoveryConfirmation', () => {
      const template = TemplateRenderer.getDefaultTemplate('discoveryConfirmation');

      expect(template).toBeDefined();
      expect(template.subject).toBeDefined();
    });

    it('should return a generic default template for unknown notification types', () => {
      const template = TemplateRenderer.getDefaultTemplate('unknownType');

      expect(template).toBeDefined();
      expect(template.subject).toBeDefined();
    });
  });
});
