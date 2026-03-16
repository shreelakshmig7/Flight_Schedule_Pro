/**
 * PolicyConfig.tsx
 * ----------------
 * Agentic Scheduler — FSP Integration — Scheduling policy configuration UI
 * ------
 * Client component for configuring scheduling policy settings including
 * rescheduleWindowDays, instructor preferences, and discovery settings.
 * Calls PUT /operators/me/policy on save.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-21 — Operator Configuration UI
 */

'use client';

import { useState, useEffect } from 'react';
import { updatePolicy, type SchedulingPolicyConfig } from '@/lib/api-client';

interface PolicyConfigProps {
  initialConfig: SchedulingPolicyConfig;
  onSave?: (config: SchedulingPolicyConfig) => void;
  onError?: (error: string) => void;
}

export function PolicyConfig({
  initialConfig,
  onSave,
  onError,
}: PolicyConfigProps): JSX.Element {
  const [config, setConfig] = useState<SchedulingPolicyConfig>(initialConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setConfig(initialConfig);
  }, [initialConfig]);

  const handleInputChange = (
    field: keyof SchedulingPolicyConfig,
    value: number | boolean | string[] | undefined,
  ) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    // Validate rescheduleWindowDays
    if (config.rescheduleWindowDays <= 0) {
      setSaveMessage('Error: Reschedule window must be greater than 0');
      onError?.('rescheduleWindowDays must be greater than 0');
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const updated = await updatePolicy(config);
      setConfig(updated);
      setSaveMessage('Policy saved successfully');
      onSave?.(updated);

      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to save policy';
      setSaveMessage(`Error: ${errorMsg}`);
      onError?.(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
      <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem', fontWeight: 600 }}>
        Scheduling Policy
      </h3>

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {/* Reschedule Window Days */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Reschedule Window (days)
          </label>
          <input
            type="number"
            min="1"
            value={config.rescheduleWindowDays}
            onChange={(e) => handleInputChange('rescheduleWindowDays', parseInt(e.target.value, 10))}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
            }}
          />
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            How many days ahead the scheduler can look for available slots.
          </span>
        </div>

        {/* Prefer Same Instructor */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={config.preferSameInstructor ?? false}
              onChange={(e) => handleInputChange('preferSameInstructor', e.target.checked)}
            />
            Prefer Same Instructor
          </label>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginLeft: '1.5rem' }}>
            Schedule consecutive flights with the same instructor when possible.
          </span>
        </div>

        {/* Prefer Continuity Instructor */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={config.preferContinuityInstructor ?? false}
              onChange={(e) => handleInputChange('preferContinuityInstructor', e.target.checked)}
            />
            Prefer Continuity Instructor
          </label>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginLeft: '1.5rem' }}>
            Prioritise same instructor for training progression and student familiarity.
          </span>
        </div>

        {/* Discovery Search Window */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Discovery Search Window (days)
          </label>
          <input
            type="number"
            min="0"
            value={config.discoverySearchWindowDays ?? 14}
            onChange={(e) =>
              handleInputChange('discoverySearchWindowDays', parseInt(e.target.value, 10))
            }
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
            }}
          />
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            How far ahead to search for discovery prospects.
          </span>
        </div>

        {/* Discovery Eligible Instructors */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Discovery Eligible Instructors
          </label>
          <textarea
            value={(config.discoveryEligibleInstructorIds ?? []).join('\n')}
            onChange={(e) =>
              handleInputChange(
                'discoveryEligibleInstructorIds',
                e.target.value.trim().split('\n').filter((id) => id.length > 0),
              )
            }
            placeholder="Enter one instructor ID per line"
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '0.5rem',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
            }}
          />
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Leave empty to allow all instructors. List instructor IDs (one per line).
          </span>
        </div>

        {/* Discovery Eligible Aircraft */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Discovery Eligible Aircraft
          </label>
          <textarea
            value={(config.discoveryEligibleAircraftIds ?? []).join('\n')}
            onChange={(e) =>
              handleInputChange(
                'discoveryEligibleAircraftIds',
                e.target.value.trim().split('\n').filter((id) => id.length > 0),
              )
            }
            placeholder="Enter one aircraft ID per line"
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '0.5rem',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
            }}
          />
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Leave empty to allow all aircraft. List aircraft IDs (one per line).
          </span>
        </div>
      </div>

      {/* Save Button and Messages */}
      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            opacity: isSaving ? 0.6 : 1,
            fontWeight: 500,
          }}
        >
          {isSaving ? 'Saving...' : 'Save Policy'}
        </button>

        {saveMessage && (
          <span
            style={{
              fontSize: '0.875rem',
              color: saveMessage.includes('Error') ? 'var(--color-error)' : 'var(--color-success)',
            }}
          >
            {saveMessage}
          </span>
        )}
      </div>
    </div>
  );
}
