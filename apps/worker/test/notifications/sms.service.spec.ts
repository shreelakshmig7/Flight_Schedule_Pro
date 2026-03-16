/**
 * sms.service.spec.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — SMS notification service tests
 * ---------------------------------------------------------------------
 * TDD test suite for the SmsService, ISmsProvider implementations,
 * SmsProviderFactory, E.164 normalisation, 160-character truncation,
 * and opt-in checking.
 *
 * Key exports: (test file — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-18 — SMS Notifications
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmsService } from '../../src/notifications/sms.service';
import { SmsProviderFactory } from '../../src/notifications/sms-provider.factory';
import { AzureCommunicationSmsProvider } from '../../src/notifications/azure-sms.provider';
import { TwilioSmsProvider } from '../../src/notifications/twilio-sms.provider';
import { PhoneUtils } from '../../src/notifications/phone-utils';
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

interface MockSmsProvider {
  sendSms: ReturnType<typeof vi.fn>;
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_OPERATOR_ID = 'op-sms-001';
const MOCK_FSP_OPERATOR_ID = 12345;
const MOCK_SUGGESTION_ID = 'sug-sms-001';
const MOCK_CORRELATION_ID = 'corr-sms-001';

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
  },
};

const MOCK_STUDENT_OPTED_IN = {
  studentId: 'student-001',
  firstName: 'Jane',
  lastName: 'Doe',
  phone: '+15551234567',
  smsOptIn: true,
};

const MOCK_STUDENT_NOT_OPTED_IN = {
  studentId: 'student-001',
  firstName: 'Jane',
  lastName: 'Doe',
  phone: '+15551234567',
  smsOptIn: false,
};

const MOCK_OPERATOR = {
  operatorId: MOCK_OPERATOR_ID,
  notificationConfig: {
    smsTemplates: {
      waitlistOffer: 'Hi {{studentName}}, a flight slot opened on {{slotDate}}. Contact us to confirm.',
    },
  },
};

// ── SmsService tests ────────────────────────────────────────────────────────

describe('SmsService', () => {
  let smsService: SmsService;
  let mockPrisma: MockPrismaService;
  let mockStudentsService: MockStudentsService;
  let mockSmsProvider: MockSmsProvider;

  beforeEach(() => {
    mockPrisma = {
      communication: { create: vi.fn().mockResolvedValue({ id: 'comm-sms-001' }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-sms-001' }) },
      operator: { findFirst: vi.fn().mockResolvedValue(MOCK_OPERATOR) },
    };

    mockStudentsService = {
      getStudentById: vi.fn().mockResolvedValue({
        success: true,
        data: MOCK_STUDENT_OPTED_IN,
      }),
    };

    mockSmsProvider = {
      sendSms: vi.fn().mockResolvedValue({ messageId: 'msg-001', status: 'SENT' }),
    };

    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    smsService = new SmsService(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      mockPrisma as any,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      mockStudentsService as any,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      mockSmsProvider as any,
    );
  });

  describe('sendSmsNotification', () => {
    it('should send SMS and create a SENT communication record when student has opted in', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = await smsService.sendSmsNotification(
        MOCK_OPERATOR_ID,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        MOCK_SUGGESTION as unknown as any,
        MOCK_CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      expect(mockSmsProvider.sendSms).toHaveBeenCalledTimes(1);
      expect(mockPrisma.communication.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operatorId: MOCK_OPERATOR_ID,
          suggestionId: MOCK_SUGGESTION_ID,
          channel: COMMUNICATION_CHANNEL.SMS,
          status: COMMUNICATION_STATUS.SENT,
        }),
      });
    });

    it('should NOT send SMS when student has not opted in', async () => {
      mockStudentsService.getStudentById.mockResolvedValue({
        success: true,
        data: MOCK_STUDENT_NOT_OPTED_IN,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = await smsService.sendSmsNotification(
        MOCK_OPERATOR_ID,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        MOCK_SUGGESTION as unknown as any,
        MOCK_CORRELATION_ID,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not opted in');
      expect(mockSmsProvider.sendSms).not.toHaveBeenCalled();
    });

    it('should truncate SMS body to 157 characters + ... when exceeding 160 chars', async () => {
      const longTemplate = 'A'.repeat(200);
      mockPrisma.operator.findFirst.mockResolvedValue({
        operatorId: MOCK_OPERATOR_ID,
        notificationConfig: {
          smsTemplates: { waitlistOffer: longTemplate },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await smsService.sendSmsNotification(
        MOCK_OPERATOR_ID,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        MOCK_SUGGESTION as unknown as any,
        MOCK_CORRELATION_ID,
      );

      const sentBody = mockSmsProvider.sendSms.mock.calls[0][1];
      expect(sentBody.length).toBeLessThanOrEqual(160);
      expect(sentBody.endsWith('...')).toBe(true);
    });

    it('should write an audit log entry with NOTIFICATION_SENT action', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await smsService.sendSmsNotification(
        MOCK_OPERATOR_ID,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        MOCK_SUGGESTION as unknown as any,
        MOCK_CORRELATION_ID,
      );

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operatorId: MOCK_OPERATOR_ID,
          correlationId: MOCK_CORRELATION_ID,
          service: 'SmsService',
          action: 'notification.sent',
        }),
      });
    });

    it('should create a communication record even when SMS dispatch fails', async () => {
      mockSmsProvider.sendSms.mockResolvedValue({ messageId: null, status: 'FAILED' });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = await smsService.sendSmsNotification(
        MOCK_OPERATOR_ID,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        MOCK_SUGGESTION as unknown as any,
        MOCK_CORRELATION_ID,
      );

      expect(result.success).toBe(false);
      expect(mockPrisma.communication.create).toHaveBeenCalled();
    });

    it('should not throw when an unexpected error occurs', async () => {
      mockStudentsService.getStudentById.mockRejectedValue(new Error('boom'));

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = await smsService.sendSmsNotification(
        MOCK_OPERATOR_ID,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        MOCK_SUGGESTION as unknown as any,
        MOCK_CORRELATION_ID,
      );

      expect(result.success).toBe(false);
    });
  });
});

// ── SmsProviderFactory tests ────────────────────────────────────────────────

describe('SmsProviderFactory', () => {
  it('should return TwilioSmsProvider when SMS_PROVIDER=twilio', () => {
    const provider = SmsProviderFactory.create('twilio');
    expect(provider).toBeInstanceOf(TwilioSmsProvider);
  });

  it('should return AzureCommunicationSmsProvider when SMS_PROVIDER=azure', () => {
    const provider = SmsProviderFactory.create('azure');
    expect(provider).toBeInstanceOf(AzureCommunicationSmsProvider);
  });

  it('should default to AzureCommunicationSmsProvider for unknown providers', () => {
    const provider = SmsProviderFactory.create('unknown');
    expect(provider).toBeInstanceOf(AzureCommunicationSmsProvider);
  });
});

// ── PhoneUtils tests ────────────────────────────────────────────────────────

describe('PhoneUtils', () => {
  describe('normaliseToE164', () => {
    it('should pass through a valid E.164 number unchanged', () => {
      const result = PhoneUtils.normaliseToE164('+15551234567');
      expect(result).toBe('+15551234567');
    });

    it('should add +1 prefix to a 10-digit US number', () => {
      const result = PhoneUtils.normaliseToE164('5551234567');
      expect(result).toBe('+15551234567');
    });

    it('should strip non-numeric characters and normalise', () => {
      const result = PhoneUtils.normaliseToE164('(555) 123-4567');
      expect(result).toBe('+15551234567');
    });

    it('should handle number with leading 1 (11 digits)', () => {
      const result = PhoneUtils.normaliseToE164('15551234567');
      expect(result).toBe('+15551234567');
    });

    it('should return null for numbers that cannot be normalised', () => {
      const result = PhoneUtils.normaliseToE164('123');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = PhoneUtils.normaliseToE164('');
      expect(result).toBeNull();
    });
  });

  describe('isE164', () => {
    it('should return true for valid E.164 format', () => {
      expect(PhoneUtils.isE164('+15551234567')).toBe(true);
    });

    it('should return false for non-E.164 format', () => {
      expect(PhoneUtils.isE164('5551234567')).toBe(false);
    });
  });
});
