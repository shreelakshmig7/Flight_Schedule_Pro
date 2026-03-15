/**
 * token-store.spec.ts
 * -------------------
 * Agentic Scheduler — FSP Integration — TokenStore unit tests
 * ----------------------------------------------------------
 * Tests the in-memory token store: setToken, getToken, and
 * isExpiringSoon (true when < TOKEN_REFRESH_BUFFER_MINUTES remaining).
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TokenStore } from '../src/auth/token-store';
import { TOKEN_REFRESH_BUFFER_MINUTES } from '@fsp-scheduler/shared-types';

describe('TokenStore', () => {
  let store: TokenStore;

  beforeEach(() => {
    store = new TokenStore();
  });

  describe('setToken / getToken', () => {
    it('returns null for an unknown operatorId', () => {
      expect(store.getToken(999)).toBeNull();
    });

    it('stores and retrieves a token', () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      store.setToken(42, 'my-bearer-token', expiresAt);
      expect(store.getToken(42)).toBe('my-bearer-token');
    });

    it('overwrites existing token for same operatorId', () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      store.setToken(42, 'token-v1', expiresAt);
      store.setToken(42, 'token-v2', expiresAt);
      expect(store.getToken(42)).toBe('token-v2');
    });

    it('returns null after token has expired', () => {
      const expiresAt = new Date(Date.now() - 1000); // already expired
      store.setToken(42, 'expired-token', expiresAt);
      expect(store.getToken(42)).toBeNull();
    });
  });

  describe('isExpiringSoon', () => {
    it('returns false for unknown operatorId', () => {
      expect(store.isExpiringSoon(999)).toBe(false);
    });

    it('returns false when token expires well in the future', () => {
      // Expires in 30 minutes — well beyond the 5-minute buffer
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      store.setToken(42, 'fresh-token', expiresAt);
      expect(store.isExpiringSoon(42)).toBe(false);
    });

    it(`returns true when token expires in less than ${TOKEN_REFRESH_BUFFER_MINUTES} minutes`, () => {
      // Expires in TOKEN_REFRESH_BUFFER_MINUTES - 1 minute
      const expiresAt = new Date(
        Date.now() + (TOKEN_REFRESH_BUFFER_MINUTES - 1) * 60 * 1000,
      );
      store.setToken(42, 'expiring-soon-token', expiresAt);
      expect(store.isExpiringSoon(42)).toBe(true);
    });

    it('returns true when token is already expired', () => {
      const expiresAt = new Date(Date.now() - 1000);
      store.setToken(42, 'expired-token', expiresAt);
      expect(store.isExpiringSoon(42)).toBe(true);
    });

    it('returns true when exactly at the buffer boundary', () => {
      // Expires in exactly TOKEN_REFRESH_BUFFER_MINUTES — should trigger refresh
      const expiresAt = new Date(
        Date.now() + TOKEN_REFRESH_BUFFER_MINUTES * 60 * 1000,
      );
      store.setToken(42, 'boundary-token', expiresAt);
      expect(store.isExpiringSoon(42)).toBe(true);
    });
  });

  describe('getAllOperatorIds', () => {
    it('returns empty array when no tokens stored', () => {
      expect(store.getAllOperatorIds()).toEqual([]);
    });

    it('returns all stored operator IDs', () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      store.setToken(1, 'token-1', expiresAt);
      store.setToken(2, 'token-2', expiresAt);
      store.setToken(3, 'token-3', expiresAt);
      const ids = store.getAllOperatorIds();
      expect(ids).toContain(1);
      expect(ids).toContain(2);
      expect(ids).toContain(3);
      expect(ids).toHaveLength(3);
    });
  });
});
