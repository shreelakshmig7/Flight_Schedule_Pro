/**
 * PriorityWeightsConfig.tsx
 * -------------------------
 * Agentic Scheduler — FSP Integration — Priority weights configuration UI
 * --------
 * Client component that displays sliders for adjusting priority weights
 * (timeSinceLastFlight, timeUntilNextScheduledFlight, totalFlightHours, etc.)
 * with live preview and a save button that calls PUT /operators/me/priority-weights.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-21 — Operator Configuration UI
 */

'use client';

import { useState, useEffect } from 'react';
import { updatePriorityWeights, type PriorityWeightConfig } from '@/lib/api-client';

interface PriorityWeightsConfigProps {
  initialConfig: PriorityWeightConfig;
  onSave?: (config: PriorityWeightConfig) => void;
  onError?: (error: string) => void;
}

export function PriorityWeightsConfig({
  initialConfig,
  onSave,
  onError,
}: PriorityWeightsConfigProps): JSX.Element {
  const [config, setConfig] = useState<PriorityWeightConfig>(initialConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setConfig(initialConfig);
  }, [initialConfig]);

  const handleSliderChange = (field: keyof Omit<PriorityWeightConfig, 'customSignals' | 'flightHoursHigherIsBetter'>, value: number) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleToggleChange = (field: 'flightHoursHigherIsBetter') => {
    setConfig((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const updated = await updatePriorityWeights(config);
      setConfig(updated);
      setSaveMessage('Priority weights saved successfully');
      onSave?.(updated);

      // Clear success message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to save priority weights';
      setSaveMessage(`Error: ${errorMsg}`);
      onError?.(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
      <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem', fontWeight: 600 }}>
        Priority Weights
      </h3>

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {/* Time Since Last Flight */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Time Since Last Flight: {config.timeSinceLastFlight}
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={config.timeSinceLastFlight}
            onChange={(e) => handleSliderChange('timeSinceLastFlight', parseInt(e.target.value, 10))}
            style={{ width: '100%' }}
          />
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Higher value makes recency of last flight more influential in scheduling priority.
          </span>
        </div>

        {/* Time Until Next Scheduled Flight */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Time Until Next Scheduled Flight: {config.timeUntilNextScheduledFlight}
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={config.timeUntilNextScheduledFlight}
            onChange={(e) =>
              handleSliderChange('timeUntilNextScheduledFlight', parseInt(e.target.value, 10))
            }
            style={{ width: '100%' }}
          />
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Higher value prioritises students whose next scheduled flight is further away.
          </span>
        </div>

        {/* Total Flight Hours */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Total Flight Hours: {config.totalFlightHours}
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={config.totalFlightHours}
            onChange={(e) => handleSliderChange('totalFlightHours', parseInt(e.target.value, 10))}
            style={{ width: '100%' }}
          />
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Weight applied to total flight hours in scheduling decisions.
          </span>
        </div>

        {/* Flight Hours Direction Toggle */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={config.flightHoursHigherIsBetter}
              onChange={() => handleToggleChange('flightHoursHigherIsBetter')}
            />
            Flight Hours: Higher Is Better
          </label>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginLeft: '1.5rem' }}>
            {config.flightHoursHigherIsBetter
              ? 'More flight hours → higher scheduling priority (closer to checkride)'
              : 'Fewer flight hours → higher scheduling priority (needs more training)'}
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
          {isSaving ? 'Saving...' : 'Save Weights'}
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
