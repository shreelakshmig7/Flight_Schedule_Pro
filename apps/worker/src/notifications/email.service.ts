/**
 * email.service.ts
 * ----------------
 * Agentic Scheduler — FSP Integration — Email notification dispatch service
 * --------------------------------------------------------------------------
 * Dispatches email notifications after a suggestion is approved and a
 * reservation is created in FSP. Handles three notification types: waitlist
 * offer, rescheduling offer, and discovery flight confirmation. Uses
 * operator-branded templates when configured, otherwise falls back to default
 * templates. Creates a Communication record and AuditLog entry for every
 * email dispatched or failed.
 *
 * IMPORTANT: Failed email dispatch must never block the approval flow.
 * All errors are caught, logged, and recorded as FAILED communications.
 *
 * Key exports: EmailService, EmailNotificationResult
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-17 — Email Notifications
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@fsp-scheduler/database';
import { StudentsService } from '@fsp-scheduler/fsp-client';
import {
  COMMUNICATION_CHANNEL,
  COMMUNICATION_STATUS,
} from '@fsp-scheduler/shared-types';
import { TemplateRenderer } from './template-renderer';
import type { EmailTemplate } from './template-renderer';

/** Logger name for this service. */
const SERVICE_NAME = 'EmailService';

/**
 * Result of an email notification dispatch attempt.
 */
export interface EmailNotificationResult {
  /** Whether the email was dispatched successfully. */
  success: boolean;
  /** Error message if dispatch failed. */
  error?: string;
  /** ID of the Communication record created. */
  communicationId?: string;
}

/**
 * Shape of the candidate payload stored on a Suggestion record.
 * Used to extract template variables for email rendering.
 */
interface CandidatePayload {
  studentId?: string;
  studentName?: string;
  slotDate?: string;
  slotStart?: string;
  slotEnd?: string;
  instructorName?: string;
  aircraftTailNumber?: string;
  locationName?: string;
  [key: string]: unknown;
}

/**
 * Shape of notification config stored in the operator record.
 */
interface NotificationConfig {
  emailTemplates?: Record<string, EmailTemplate>;
}

/**
 * Minimal suggestion shape required by the email service.
 */
interface SuggestionRecord {
  id: string;
  operatorId: string;
  fspOperatorId: number;
  useCaseType: string;
  candidatePayload: CandidatePayload | null;
}

/**
 * NestJS injectable service responsible for dispatching email notifications
 * after a suggestion is approved and a reservation is created in FSP.
 *
 * This service only sends additional notifications not covered by FSP's
 * built-in sendEmailNotification flag — e.g. the initial offer email before
 * the student has accepted, or rescheduling offer emails.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(SERVICE_NAME);

  /**
   * @param prisma          - PrismaService for Communication and AuditLog writes.
   * @param studentsService - FSP StudentsService for fetching student contact info.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentsService: StudentsService,
  ) {}

  /**
   * Sends an email notification for a given suggestion.
   *
   * Fetches the student's email from FSP, resolves the appropriate template
   * (operator-branded or default), renders it with candidate payload data,
   * creates a Communication record, and writes an AuditLog entry.
   *
   * This method NEVER throws — all errors are caught and returned as a
   * failed result so the approval flow is never blocked.
   *
   * @param operatorId    - Operator string ID for tenant scoping.
   * @param suggestion    - The approved suggestion record.
   * @param correlationId - Distributed tracing ID.
   * @returns EmailNotificationResult indicating success or failure.
   */
  public async sendEmailNotification(
    operatorId: string,
    suggestion: SuggestionRecord,
    correlationId: string,
  ): Promise<EmailNotificationResult> {
    try {
      this.logger.log('Dispatching email notification', {
        service: SERVICE_NAME,
        operatorId,
        correlationId,
        suggestionId: suggestion.id,
      });

      const payload = suggestion.candidatePayload ?? ({} as CandidatePayload);
      const studentId = payload.studentId;

      if (!studentId) {
        return this.handleFailure(
          operatorId,
          suggestion.id,
          correlationId,
          'No studentId in candidate payload — cannot fetch contact info',
        );
      }

      // ── 1. Fetch student contact info from FSP ────────────────────────────
      const studentResult = await this.studentsService.getStudentById(
        String(suggestion.fspOperatorId),
        studentId,
      );

      if (!studentResult.success || !studentResult.data) {
        return this.handleFailure(
          operatorId,
          suggestion.id,
          correlationId,
          `Failed to fetch student ${studentId}: ${studentResult.error ?? 'unknown error'}`,
        );
      }

      const student = studentResult.data as { email?: string; firstName?: string; lastName?: string };
      const recipientEmail = student.email;

      if (!recipientEmail) {
        return this.handleFailure(
          operatorId,
          suggestion.id,
          correlationId,
          `Student ${studentId} has no email address on file`,
        );
      }

      // ── 2. Resolve template ───────────────────────────────────────────────
      const notificationType = this.getNotificationType(suggestion.useCaseType);
      const template = await this.resolveTemplate(operatorId, notificationType);

      // ── 3. Build template variables ───────────────────────────────────────
      const variables: Record<string, string> = {
        studentName: payload.studentName ?? `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim(),
        slotDate: payload.slotDate ?? '',
        slotStart: payload.slotStart ?? '',
        slotEnd: payload.slotEnd ?? '',
        instructorName: payload.instructorName ?? '',
        aircraftTailNumber: payload.aircraftTailNumber ?? '',
        locationName: payload.locationName ?? '',
      };

      // ── 4. Render template ────────────────────────────────────────────────
      const renderedSubject = TemplateRenderer.render(template.subject, variables);
      TemplateRenderer.render(template.bodyHtml, variables);
      TemplateRenderer.render(template.bodyText, variables);

      // ── 5. Create Communication record (SENT) ────────────────────────────
      const obfuscatedRecipient = this.obfuscateEmail(recipientEmail);

      const communication = await this.prisma.communication.create({
        data: {
          operatorId,
          suggestionId: suggestion.id,
          channel: COMMUNICATION_CHANNEL.EMAIL,
          recipient: obfuscatedRecipient,
          status: COMMUNICATION_STATUS.SENT,
          sentAt: new Date(),
        },
      });

      // ── 6. Write audit log entry ──────────────────────────────────────────
      await this.prisma.auditLog.create({
        data: {
          operatorId,
          correlationId,
          service: SERVICE_NAME,
          action: 'notification.sent',
          entityType: 'Communication',
          entityId: communication.id,
          metadata: {
            channel: COMMUNICATION_CHANNEL.EMAIL,
            suggestionId: suggestion.id,
            notificationType,
            renderedSubject,
            // NOTE: recipient address and body NOT logged (PII)
          },
        },
      });

      this.logger.log('Email notification dispatched successfully', {
        service: SERVICE_NAME,
        operatorId,
        correlationId,
        communicationId: communication.id,
        channel: COMMUNICATION_CHANNEL.EMAIL,
        status: COMMUNICATION_STATUS.SENT,
        // recipient address and body NOT logged
      });

      return {
        success: true,
        communicationId: communication.id,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Email notification dispatch failed', {
        service: SERVICE_NAME,
        operatorId,
        correlationId,
        suggestionId: suggestion.id,
        error: errorMessage,
      });

      // Attempt to record the failure — but never throw
      try {
        await this.handleFailure(
          operatorId,
          suggestion.id,
          correlationId,
          errorMessage,
        );
      } catch {
        // Even failure recording failed — just log and continue
        this.logger.error('Failed to record email dispatch failure', {
          service: SERVICE_NAME,
          operatorId,
          correlationId,
        });
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Records a failed email notification attempt by creating a FAILED
   * Communication record.
   *
   * @param operatorId    - Operator string ID for tenant scoping.
   * @param suggestionId  - Related suggestion ID.
   * @param correlationId - Distributed tracing ID.
   * @param errorMessage  - Human-readable error description.
   * @returns EmailNotificationResult with success=false.
   */
  private async handleFailure(
    operatorId: string,
    suggestionId: string,
    correlationId: string,
    errorMessage: string,
  ): Promise<EmailNotificationResult> {
    this.logger.warn('Email notification failed — recording failure', {
      service: SERVICE_NAME,
      operatorId,
      correlationId,
      suggestionId,
      error: errorMessage,
    });

    const communication = await this.prisma.communication.create({
      data: {
        operatorId,
        suggestionId,
        channel: COMMUNICATION_CHANNEL.EMAIL,
        recipient: 'unknown',
        status: COMMUNICATION_STATUS.FAILED,
        errorMessage,
      },
    });

    return {
      success: false,
      error: errorMessage,
      communicationId: communication.id,
    };
  }

  /**
   * Maps a suggestion use-case type to a notification template key.
   *
   * @param useCaseType - Use case type from the suggestion record.
   * @returns Template key string for template lookup.
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
      case 'NEXT_LESSON':
        return 'waitlistOffer'; // reuses waitlist template for next-lesson offers
      default:
        return 'waitlistOffer';
    }
  }

  /**
   * Resolves the email template for a notification type by checking operator
   * configuration first, then falling back to the default template.
   *
   * @param operatorId       - Operator string ID for database lookup.
   * @param notificationType - Template key (e.g. waitlistOffer).
   * @returns The resolved EmailTemplate.
   */
  private async resolveTemplate(
    operatorId: string,
    notificationType: string,
  ): Promise<EmailTemplate> {
    const operator = await this.prisma.operator.findFirst({
      where: { operatorId },
    });

    if (operator) {
      const notifConfig = (operator as Record<string, unknown>).notificationConfig as NotificationConfig | null;
      if (notifConfig?.emailTemplates?.[notificationType]) {
        return notifConfig.emailTemplates[notificationType];
      }
    }

    return TemplateRenderer.getDefaultTemplate(notificationType);
  }

  /**
   * Obfuscates an email address for storage in the Communication record.
   * Shows first and last character of the local part plus the domain.
   *
   * @param email - Raw email address.
   * @returns Obfuscated email string (e.g. "j***e@example.com").
   */
  private obfuscateEmail(email: string): string {
    const atIndex = email.indexOf('@');
    if (atIndex <= 1) return '***@' + email.substring(atIndex + 1);
    const local = email.substring(0, atIndex);
    const domain = email.substring(atIndex);
    return `${local[0]}***${local[local.length - 1]}${domain}`;
  }
}
