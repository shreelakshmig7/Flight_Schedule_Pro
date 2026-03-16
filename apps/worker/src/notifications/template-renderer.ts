/**
 * template-renderer.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — Email and SMS template renderer
 * ----------------------------------------------------------------------
 * Provides a static utility for rendering notification templates by replacing
 * placeholder variables (e.g. {{studentName}}) with actual values. All variable
 * values are HTML-sanitised before insertion to prevent XSS. Also provides
 * default templates for each notification type when the operator has not
 * configured custom templates.
 *
 * Key exports: TemplateRenderer, EmailTemplate
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-17 — Email Notifications
 */

/**
 * Shape of an email template with subject, HTML body, and plain-text body.
 */
export interface EmailTemplate {
  /** Email subject line with optional {{placeholder}} variables. */
  subject: string;
  /** HTML email body with optional {{placeholder}} variables. */
  bodyHtml: string;
  /** Plain-text fallback body with optional {{placeholder}} variables. */
  bodyText: string;
}

/**
 * Static utility class for rendering notification templates.
 * Replaces {{placeholder}} tokens with sanitised variable values.
 */
export class TemplateRenderer {
  /**
   * Renders a template string by replacing all {{key}} placeholders with the
   * corresponding value from the variables map. Values are HTML-entity-escaped
   * to prevent XSS when rendered in HTML email bodies.
   *
   * @param template  - Template string containing {{key}} placeholders.
   * @param variables - Map of placeholder key → replacement value.
   * @returns The rendered string with all matched placeholders replaced.
   */
  static render(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match: string, key: string): string => {
      if (key in variables) {
        return TemplateRenderer.sanitiseHtml(variables[key] ?? '');
      }
      return match; // leave unreplaced if variable not provided
    });
  }

  /**
   * Returns the default email template for a given notification type.
   * Used when the operator has not configured custom templates in their
   * notification_config.
   *
   * @param notificationType - One of: waitlistOffer, rescheduleOffer, discoveryConfirmation
   * @returns An EmailTemplate with default subject, bodyHtml, and bodyText.
   */
  static getDefaultTemplate(notificationType: string): EmailTemplate {
    switch (notificationType) {
      case 'waitlistOffer':
        return {
          subject: 'Flight slot available — {{studentName}}',
          bodyHtml: [
            '<p>Hello {{studentName}},</p>',
            '<p>A flight slot has opened up for you:</p>',
            '<ul>',
            '<li><strong>Date:</strong> {{slotDate}}</li>',
            '<li><strong>Time:</strong> {{slotStart}} — {{slotEnd}}</li>',
            '<li><strong>Instructor:</strong> {{instructorName}}</li>',
            '<li><strong>Aircraft:</strong> {{aircraftTailNumber}}</li>',
            '<li><strong>Location:</strong> {{locationName}}</li>',
            '</ul>',
            '<p>Please contact us to confirm your booking.</p>',
          ].join('\n'),
          bodyText: [
            'Hello {{studentName}},',
            '',
            'A flight slot has opened up for you:',
            'Date: {{slotDate}}',
            'Time: {{slotStart}} — {{slotEnd}}',
            'Instructor: {{instructorName}}',
            'Aircraft: {{aircraftTailNumber}}',
            'Location: {{locationName}}',
            '',
            'Please contact us to confirm your booking.',
          ].join('\n'),
        };

      case 'rescheduleOffer':
        return {
          subject: 'Reschedule options available — {{studentName}}',
          bodyHtml: [
            '<p>Hello {{studentName}},</p>',
            '<p>Your previous flight was cancelled. We have found alternative options for you:</p>',
            '<ul>',
            '<li><strong>Date:</strong> {{slotDate}}</li>',
            '<li><strong>Time:</strong> {{slotStart}} — {{slotEnd}}</li>',
            '<li><strong>Instructor:</strong> {{instructorName}}</li>',
            '<li><strong>Aircraft:</strong> {{aircraftTailNumber}}</li>',
            '</ul>',
            '<p>Please contact us to confirm your rescheduled booking.</p>',
          ].join('\n'),
          bodyText: [
            'Hello {{studentName}},',
            '',
            'Your previous flight was cancelled. We have found alternative options:',
            'Date: {{slotDate}}',
            'Time: {{slotStart}} — {{slotEnd}}',
            'Instructor: {{instructorName}}',
            'Aircraft: {{aircraftTailNumber}}',
            '',
            'Please contact us to confirm your rescheduled booking.',
          ].join('\n'),
        };

      case 'discoveryConfirmation':
        return {
          subject: 'Discovery flight confirmation — {{studentName}}',
          bodyHtml: [
            '<p>Hello {{studentName}},</p>',
            '<p>Your discovery flight has been scheduled:</p>',
            '<ul>',
            '<li><strong>Date:</strong> {{slotDate}}</li>',
            '<li><strong>Time:</strong> {{slotStart}} — {{slotEnd}}</li>',
            '<li><strong>Instructor:</strong> {{instructorName}}</li>',
            '<li><strong>Aircraft:</strong> {{aircraftTailNumber}}</li>',
            '<li><strong>Location:</strong> {{locationName}}</li>',
            '</ul>',
            '<p>We look forward to flying with you!</p>',
          ].join('\n'),
          bodyText: [
            'Hello {{studentName}},',
            '',
            'Your discovery flight has been scheduled:',
            'Date: {{slotDate}}',
            'Time: {{slotStart}} — {{slotEnd}}',
            'Instructor: {{instructorName}}',
            'Aircraft: {{aircraftTailNumber}}',
            'Location: {{locationName}}',
            '',
            'We look forward to flying with you!',
          ].join('\n'),
        };

      default:
        return {
          subject: 'Scheduling update — {{studentName}}',
          bodyHtml: [
            '<p>Hello {{studentName}},</p>',
            '<p>There is a scheduling update regarding your flight on {{slotDate}}.</p>',
            '<p>Please contact your flight school for details.</p>',
          ].join('\n'),
          bodyText: [
            'Hello {{studentName}},',
            '',
            'There is a scheduling update regarding your flight on {{slotDate}}.',
            'Please contact your flight school for details.',
          ].join('\n'),
        };
    }
  }

  /**
   * Escapes HTML-sensitive characters in a string to prevent XSS injection.
   *
   * @param input - Raw string that may contain HTML-unsafe characters.
   * @returns The input with &, <, >, ", and ' replaced by HTML entities.
   */
  private static sanitiseHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}
