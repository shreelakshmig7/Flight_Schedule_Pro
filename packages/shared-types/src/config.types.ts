/**
 * config.types.ts
 * ---------------
 * Agentic Scheduler — FSP Integration — Operator configuration types
 * -------------------------------------------------------------------
 * Defines TypeScript types for scheduling policy, notification configuration,
 * and their respective request/response shapes for PR-21.
 *
 * Key exports: SchedulingPolicyConfig, NotificationTemplateConfig,
 *              UpdatePolicyConfigRequest, UpdateNotificationConfigRequest
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-21 — Operator Configuration UI
 */

/**
 * Scheduling policy configuration stored in operators.policyConfig.
 * Controls scheduling algorithm behavior and discovery settings.
 */
export interface SchedulingPolicyConfig {
  /**
   * Reschedule window in days. Defines how many days ahead the scheduler
   * can look for available slots. Must be > 0.
   */
  rescheduleWindowDays: number;
  /**
   * If true, prefer scheduling consecutive flights with the same instructor.
   */
  preferSameInstructor?: boolean;
  /**
   * If true, prefer scheduling consecutive flights with the same instructor
   * for continuity in student training progression.
   */
  preferContinuityInstructor?: boolean;
  /**
   * Discovery search window in days. How far ahead to search for discovery prospects.
   */
  discoverySearchWindowDays?: number;
  /**
   * List of instructor IDs eligible for discovery scheduling.
   * Empty list means all instructors are eligible.
   */
  discoveryEligibleInstructorIds?: string[];
  /**
   * List of aircraft IDs eligible for discovery scheduling.
   * Empty list means all aircraft are eligible.
   */
  discoveryEligibleAircraftIds?: string[];
}

/**
 * Single email or SMS template for a notification type.
 */
export interface NotificationTemplate {
  /** Subject line for email templates (email only). */
  subject?: string;
  /** Body/content of the template. Supports {{variable}} placeholders. */
  body: string;
}

/**
 * Email template configuration for a specific notification type.
 */
export interface EmailTemplate extends NotificationTemplate {
  subject: string; // Email templates must have subject
}

/**
 * SMS template configuration for a specific notification type.
 * Limited to 160 characters per standard SMS.
 */
export interface SmsTemplate extends NotificationTemplate {
  // No subject for SMS
}

/**
 * Notification configuration stored in operators.notificationConfig.
 * Maps notification types (e.g. 'SUGGESTION_APPROVED') to email and SMS templates.
 */
export interface NotificationConfig {
  /**
   * Email templates keyed by notification type.
   * Example keys: 'SUGGESTION_APPROVED', 'SUGGESTION_REJECTED'
   */
  emailTemplates?: Record<string, EmailTemplate>;
  /**
   * SMS templates keyed by notification type.
   */
  smsTemplates?: Record<string, SmsTemplate>;
}

/**
 * Request body for PUT /operators/me/policy.
 * All fields are optional; missing fields preserve existing values.
 */
export interface UpdatePolicyConfigRequest {
  /** Reschedule window in days (must be > 0). */
  rescheduleWindowDays?: number;
  /** Prefer same instructor for consecutive flights. */
  preferSameInstructor?: boolean;
  /** Prefer same instructor for continuity. */
  preferContinuityInstructor?: boolean;
  /** Discovery search window in days. */
  discoverySearchWindowDays?: number;
  /** Discovery eligible instructor IDs. */
  discoveryEligibleInstructorIds?: string[];
  /** Discovery eligible aircraft IDs. */
  discoveryEligibleAircraftIds?: string[];
}

/**
 * Request body for PUT /operators/me/notification-config.
 * All fields are optional; missing sections preserve existing values.
 */
export interface UpdateNotificationConfigRequest {
  /** Email templates to update or create. */
  emailTemplates?: Record<string, EmailTemplate>;
  /** SMS templates to update or create. */
  smsTemplates?: Record<string, SmsTemplate>;
}
