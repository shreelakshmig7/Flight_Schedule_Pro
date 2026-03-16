/**
 * sms.service.ts
 * --------------
 * Agentic Scheduler — FSP Integration — SMS notification dispatch service
 * ------------------------------------------------------------------------
 * Dispatches SMS notifications after a suggestion is approved. Uses the
 * ISmsProvider abstraction with two concrete implementations: Azure
 * Communication Services and Twilio. The active provider is selected via
 * the SMS_PROVIDER environment variable.
 *
 * SMS is only sent if the student has opted in. Messages are truncated to
 * 160 characters. Phone numbers are validated and normalised to E.164
 * format before sending.
 *
 * Key exports: SmsService, SmsNotificationResult
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-18 — SMS Notifications
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@fsp-scheduler/database';
import { StudentsService } from '@fsp-scheduler/fsp-client';
import {
  COMMUNICATION_CHANNEL,
  COMMUNICATION_STATUS,
} from '@fsp-scheduler/shared-types';
import type { ISmsProvider } from './sms-provider.interface';
import { TemplateRenderer } from './template-renderer';
import { PhoneUtils } from './phone-utils';

/** Logger name for this service. */
const SERVICE_NAME = 'SmsService';

/** Injection token for the SMS provider (set in NotificationsModule). */
export const SMS_PROVIDER_TOKEN = 'ISmsProvider';

/** Maximum SMS body length per the PRD. */
const SMS_MAX_LENGTH_CHARS = 160;

/** Truncation point — leaves room for '...' suffix. */
const SMS_TRUNCATE_LENGTH_CHARS = 157;

/**
 * Result of an SMS notification dispatch attempt.
 */
export interface SmsNotificationResult {
  /** Whether the SMS was dispatched successfully. */
  success: boolean;
  /** Error message if dispatch failed. */
  error?: string;
  /** ID of the Communication record created. */
  communicationId?: string;
}

/**
 * Shape of the candidate payload stored on a Suggestion record.
 */
interface CandidatePayload {
  studentId?: string;
  studentName?: string;
  slotDate?: string;
  slotStart?: string;
  slotEnd?: string;
  instructorName?: string;
  aircraftTailNumber?: string;
  [key: string]: unknown;
}

/**
 * Minimal suggestion shape required by the SMS service.
 */
interface SuggestionRecord {
  id: string;
  operatorId: string;
  fspOperatorId: number;
  useCaseType: string;
  candidatePayload: CandidatePayload | null;
}

/**
 * NestJS injectable service responsible for dispatching SMS notifications
 * after a suggestion is approved. Checks opt-in status before sending,
 * normalises phone numbers to E.164, and truncates messages to 160 chars.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SERVICE_NAME);

  constructor(
    private readonly prisma: PrismaService,
    private readonly studentsService: StudentsService,
    @Inject(SMS_PROVIDER_TOKEN) private readonly smsProvider: ISmsProvider,
  ) {}

  /**
   * Sends an SMS notification for a given suggestion.
   *
   * Checks opt-in status, normalises phone number to E.164, resolves the
   * template, truncates to 160 chars, sends via provider, and records the
   * result. This method NEVER throws.
   *
   * @param operatorId    - Operator string ID for tenant scoping.
   * @param suggestion    - The approved suggestion record.
   * @param correlationId - Distributed tracing ID.
   * @returns SmsNotificationResult indicating success or failure.
   */
  public async sendSmsNotification(
    operatorId: string,
    suggestion: SuggestionRecord,
    correlationId: string,
  ): Promise<SmsNotificationResult> {
    try {
      this.logger.log('Dispatching SMS notification', {
        service: SERVICE_NAME,
        operatorId,
        correlationId,
        suggestionId: suggestion.id,
      });

      const payload = suggestion.candidatePayload ?? ({} as CandidatePayload);
      const studentId = payload.studentId;

      if (!studentId) {
        return this.recordFailure(operatorId, suggestion.id, correlationId, 'No studentId in candidate payload');
      }

      // ── 1. Fetch student and check opt-in ─────────────────────────────────
      const studentResult = await this.studentsService.getStudentById(
        String(suggestion.fspOperatorId),
        studentId,
      );

      if (!studentResult.success || !studentResult.data) {
        return this.recordFailure(
          operatorId, suggestion.id, correlationId,
          `Failed to fetch student ${studentId}: ${studentResult.error ?? 'unknown error'}`,
        );
      }

      const student = studentResult.data as {
        phone?: string;
        firstName?: string;
        lastName?: string;
        smsOptIn?: boolean;
      };

      // Opt-in check: SMS only sent if student has opted in
      if (!student.smsOptIn) {
        this.logger.log('Student has not opted in to SMS — skipping', {
          service: SERVICE_NAME,
          operatorId,
          correlationId,
        });
        return {
          success: false,
          error: `Student ${studentId} has not opted in to SMS notifications`,
        };
      }

      if (!student.phone) {
        return this.recordFailure(
          operatorId, suggestion.id, correlationId,
          `Student ${studentId} has no phone number on file`,
        );
      }

      // ── 2. Normalise phone to E.164 ──────────────────────────────────────
      const normalised = PhoneUtils.normaliseToE164(student.phone);
      if (!normalised) {
        this.logger.warn('Phone number cannot be normalised to E.164 — skipping SMS', {
          service: SERVICE_NAME,
          operatorId,
          correlationId,
        });
        return this.recordFailure(
          operatorId, suggestion.id, correlationId,
          'Phone number cannot be normalised to E.164 format',
        );
      }

      // ── 3. Resolve SMS template ──────────────────────────────────────────
      const notificationType = this.getNotificationType(suggestion.useCaseType);
      const template = await this.resolveSmsTemplate(operatorId, notificationType);

      // ── 4. Render and truncate ───────────────────────────────────────────
      const variables: Record<string, string> = {
        studentName: payload.studentName ?? `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim(),
        slotDate: payload.slotDate ?? '',
        slotStart: payload.slotStart ?? '',
        slotEnd: payload.slotEnd ?? '',
        instructorName: payload.instructorName ?? '',
        aircraftTailNumber: payload.aircraftTailNumber ?? '',
      };

      let body = TemplateRenderer.render(template, variables);

      // Truncate to 160 characters
      if (body.length > SMS_MAX_LENGTH_CHARS) {
        body = body.substring(0, SMS_TRUNCATE_LENGTH_CHARS) + '...';
      }

      // ── 5. Send via provider ─────────────────────────────────────────────
      const sendResult = await this.smsProvider.sendSms(normalised, body, operatorId);

      if (sendResult.status !== 'SENT') {
        return this.recordFailure(
          operatorId, suggestion.id, correlationId,
          `SMS provider returned status: ${sendResult.status}`,
        );
      }

      // ── 6. Record success ────────────────────────────────────────────────
      const obfuscatedRecipient = this.obfuscatePhone(normalised);

      const communication = await this.prisma.communication.create({
        data: {
          operatorId,
          suggestionId: suggestion.id,
          channel: COMMUNICATION_CHANNEL.SMS,
          recipient: obfuscatedRecipient,
          status: COMMUNICATION_STATUS.SENT,
          sentAt: new Date(),
        },
      });

      await this.prisma.auditLog.create({
        data: {
          operatorId,
          correlationId,
          service: SERVICE_NAME,
          action: 'notification.sent',
          entityType: 'Communication',
          entityId: communication.id,
          metadata: {
            channel: COMMUNICATION_CHANNEL.SMS,
            suggestionId: suggestion.id,
            notificationType,
            providerMessageId: sendResult.messageId,
            // Phone number and body NOT logged — PII
          },
        },
      });

      this.logger.log('SMS notification dispatched successfully', {
        service: SERVICE_NAME,
        operatorId,
        correlationId,
        communicationId: communication.id,
        channel: COMMUNICATION_CHANNEL.SMS,
        status: COMMUNICATION_STATUS.SENT,
      });

      return { success: true, communicationId: communication.id };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('SMS notification dispatch failed', {
        service: SERVICE_NAME,
        operatorId,
        correlationId,
        suggestionId: suggestion.id,
        error: errorMessage,
      });

      try {
        return await this.recordFailure(operatorId, suggestion.id, correlationId, errorMessage);
      } catch {
        return { success: false, error: errorMessage };
      }
    }
  }

  /**
   * Records a failed SMS notification attempt.
   *
   * @param operatorId    - Operator string ID.
   * @param suggestionId  - Related suggestion ID.
   * @param correlationId - Tracing ID.
   * @param errorMessage  - Error description.
   * @returns SmsNotificationResult with success=false.
   */
  private async recordFailure(
    operatorId: string,
    suggestionId: string,
    correlationId: string,
    errorMessage: string,
  ): Promise<SmsNotificationResult> {
    const communication = await this.prisma.communication.create({
      data: {
        operatorId,
        suggestionId,
        channel: COMMUNICATION_CHANNEL.SMS,
        recipient: 'unknown',
        status: COMMUNICATION_STATUS.FAILED,
        errorMessage,
      },
    });

    return { success: false, error: errorMessage, communicationId: communication.id };
  }

  /**
   * Maps a use-case type to a SMS template key.
   *
   * @param useCaseType - Use case type from the suggestion.
   * @returns Template key string.
   */
  private getNotificationType(useCaseType: string): string {
    switch (useCaseType) {
      case 'WAITLIST_FILL':
      case 'NEW_OPENING':
      case 'CANCELLATION_FILL':
        return 'waitlistOffer';
      case 'RESCHEDULE':
        return 'rescheduleOffer';
      case 'DISCOVERY':
        return 'discoveryConfirmation';
      default:
        return 'waitlistOffer';
    }
  }

  /**
   * Resolves the SMS template for a notification type from operator config
   * or falls back to a default.
   *
   * @param operatorId       - Operator string ID.
   * @param notificationType - Template key.
   * @returns SMS template string.
   */
  private async resolveSmsTemplate(
    operatorId: string,
    notificationType: string,
  ): Promise<string> {
    const operator = await this.prisma.operator.findFirst({
      where: { operatorId },
    });

    if (operator) {
      const notifConfig = (operator as Record<string, unknown>).notificationConfig as {
        smsTemplates?: Record<string, string>;
      } | null;

      if (notifConfig?.smsTemplates?.[notificationType]) {
        return notifConfig.smsTemplates[notificationType];
      }
    }

    return this.getDefaultSmsTemplate(notificationType);
  }

  /**
   * Returns a default SMS template for a notification type.
   *
   * @param notificationType - Template key.
   * @returns Default SMS template string.
   */
  private getDefaultSmsTemplate(notificationType: string): string {
    switch (notificationType) {
      case 'waitlistOffer':
        return 'Hi {{studentName}}, a flight slot is available on {{slotDate}}. Contact your school to confirm.';
      case 'rescheduleOffer':
        return 'Hi {{studentName}}, reschedule options are available for {{slotDate}}. Contact your school.';
      case 'discoveryConfirmation':
        return 'Hi {{studentName}}, your discovery flight is confirmed for {{slotDate}}. See you there!';
      default:
        return 'Hi {{studentName}}, you have a scheduling update for {{slotDate}}. Contact your school.';
    }
  }

  /**
   * Obfuscates a phone number for storage in the Communication record.
   *
   * @param phone - E.164 phone number.
   * @returns Obfuscated phone string (e.g. "+1***4567").
   */
  private obfuscatePhone(phone: string): string {
    if (phone.length <= 4) return '***';
    return phone.substring(0, 2) + '***' + phone.substring(phone.length - 4);
  }
}
