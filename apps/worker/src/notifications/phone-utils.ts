/**
 * phone-utils.ts
 * --------------
 * Agentic Scheduler — FSP Integration — Phone number utilities
 * -------------------------------------------------------------
 * Provides E.164 phone number validation and normalisation. All phone numbers
 * must be in E.164 format before being passed to any SMS provider.
 *
 * Key exports: PhoneUtils
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-18 — SMS Notifications
 */

/**
 * Regex matching E.164 format: + followed by 7-15 digits.
 */
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Static utility class for phone number validation and normalisation.
 */
export class PhoneUtils {
  /**
   * Checks whether a phone number is in valid E.164 format.
   *
   * @param phone - Phone number string to validate.
   * @returns True if the number matches E.164 format.
   */
  static isE164(phone: string): boolean {
    return E164_REGEX.test(phone);
  }

  /**
   * Attempts to normalise a phone number to E.164 format.
   * Strips non-numeric characters, adds country code if missing (assumes US +1).
   *
   * @param phone - Raw phone number string.
   * @returns Normalised E.164 string, or null if normalisation is not possible.
   */
  static normaliseToE164(phone: string): string | null {
    if (!phone || phone.trim().length === 0) {
      return null;
    }

    // If already E.164, return as-is
    if (PhoneUtils.isE164(phone)) {
      return phone;
    }

    // Strip all non-numeric characters except leading +
    const stripped = phone.replace(/[^\d+]/g, '');
    const digitsOnly = stripped.replace(/\+/g, '');

    if (digitsOnly.length === 0) {
      return null;
    }

    // 10 digits → assume US, add +1
    if (digitsOnly.length === 10) {
      const candidate = `+1${digitsOnly}`;
      return E164_REGEX.test(candidate) ? candidate : null;
    }

    // 11 digits starting with 1 → assume US, add +
    if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
      const candidate = `+${digitsOnly}`;
      return E164_REGEX.test(candidate) ? candidate : null;
    }

    // Try adding + prefix for international numbers
    if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
      const candidate = `+${digitsOnly}`;
      return E164_REGEX.test(candidate) ? candidate : null;
    }

    return null;
  }
}
