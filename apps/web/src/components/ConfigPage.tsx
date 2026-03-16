/**
 * ConfigPage.tsx
 * -----------
 * Agentic Scheduler — FSP Integration — Main configuration page component
 * ------
 * Client component that combines PriorityWeightsConfig, PolicyConfig, and
 * NotificationConfig sections. Handles fetching initial config state on load
 * and displaying all configuration forms.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-21 — Operator Configuration UI
 */

'use client';

import { useEffect, useState } from 'react';
import { PriorityWeightsConfig } from './PriorityWeightsConfig';
import { PolicyConfig } from './PolicyConfig';
import { NotificationConfig } from './NotificationConfig';
import type { PriorityWeightConfig, SchedulingPolicyConfig, NotificationConfig as NotificationConfigType } from '@/lib/api-client';

export function ConfigPage(): JSX.Element {
  const [priorityWeights, setPriorityWeights] = useState<PriorityWeightConfig | null>(null);
  const [policyConfig, setPolicyConfig] = useState<SchedulingPolicyConfig | null>(null);
  const [notificationConfig, setNotificationConfig] = useState<NotificationConfigType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        // In a real application, you'd fetch the current config from the API
        // For now, we'll use default values
        setPriorityWeights({
          timeSinceLastFlight: 10,
          timeUntilNextScheduledFlight: 15,
          totalFlightHours: 20,
          flightHoursHigherIsBetter: false,
          customSignals: {},
        });

        setPolicyConfig({
          rescheduleWindowDays: 30,
          preferSameInstructor: false,
          preferContinuityInstructor: false,
          discoverySearchWindowDays: 14,
          discoveryEligibleInstructorIds: [],
          discoveryEligibleAircraftIds: [],
        });

        setNotificationConfig({
          emailTemplates: {},
          smsTemplates: {},
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading configuration...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', color: 'var(--color-error)' }}>
        <p>Error loading configuration: {error}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem', fontWeight: 700 }}>
        Operator Configuration
      </h1>
      <p style={{ margin: '0 0 2rem 0', color: 'var(--color-text-secondary)' }}>
        Configure scheduling policies, priority weights, and notification templates
      </p>

      <div style={{ display: 'grid', gap: '2rem' }}>
        {/* Priority Weights Section */}
        {priorityWeights && (
          <PriorityWeightsConfig
            initialConfig={priorityWeights}
            onSave={setPriorityWeights}
            onError={(msg) => setError(msg)}
          />
        )}

        {/* Policy Section */}
        {policyConfig && (
          <PolicyConfig
            initialConfig={policyConfig}
            onSave={setPolicyConfig}
            onError={(msg) => setError(msg)}
          />
        )}

        {/* Notification Config Section */}
        {notificationConfig && (
          <NotificationConfig
            initialConfig={notificationConfig}
            onSave={setNotificationConfig}
            onError={(msg) => setError(msg)}
          />
        )}
      </div>
    </div>
  );
}
