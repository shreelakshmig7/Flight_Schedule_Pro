/**
 * NotificationConfig.tsx
 * ----------------------
 * Agentic Scheduler — FSP Integration — Notification template configuration UI
 * -----
 * Client component for managing email and SMS notification templates per
 * notification type. Includes SMS character counter (max 160) and variable
 * placeholder guide. Calls PUT /operators/me/notification-config on save.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-21 — Operator Configuration UI
 */

'use client';

import { useState, useEffect } from 'react';
import { updateNotificationConfig, type NotificationConfig, type EmailTemplate, type SmsTemplate } from '@/lib/api-client';

interface NotificationConfigProps {
  initialConfig: NotificationConfig;
  onSave?: (config: NotificationConfig) => void;
  onError?: (error: string) => void;
}

const VARIABLE_PLACEHOLDERS = [
  '{{suggestionId}}',
  '{{studentName}}',
  '{{instructorName}}',
  '{{approvedAt}}',
  '{{rejectedAt}}',
  '{{reason}}',
];

const NOTIFICATION_TYPES = ['SUGGESTION_APPROVED', 'SUGGESTION_REJECTED', 'SUGGESTION_EXPIRED'];

export function NotificationConfig({
  initialConfig,
  onSave,
  onError,
}: NotificationConfigProps): JSX.Element {
  const [config, setConfig] = useState<NotificationConfig>(initialConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'email' | 'sms'>('email');

  useEffect(() => {
    setConfig(initialConfig);
  }, [initialConfig]);

  const handleEmailTemplateChange = (
    notificationType: string,
    field: 'subject' | 'body',
    value: string,
  ) => {
    setConfig((prev) => ({
      ...prev,
      emailTemplates: {
        ...prev.emailTemplates,
        [notificationType]: {
          ...(prev.emailTemplates?.[notificationType] ?? {}),
          [field]: value,
        } as EmailTemplate,
      },
    }));
  };

  const handleSmsTemplateChange = (notificationType: string, body: string) => {
    setConfig((prev) => ({
      ...prev,
      smsTemplates: {
        ...prev.smsTemplates,
        [notificationType]: {
          body,
        } as SmsTemplate,
      },
    }));
  };

  const handleSave = async () => {
    // Validate SMS templates
    const smsTemplates = config.smsTemplates ?? {};
    for (const [key, template] of Object.entries(smsTemplates)) {
      if (template.body.length > 160) {
        setSaveMessage(`Error: SMS template '${key}' exceeds 160 characters (${template.body.length})`);
        onError?.('SMS template exceeds 160 character limit');
        return;
      }
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const updated = await updateNotificationConfig(config);
      setConfig(updated);
      setSaveMessage('Notification config saved successfully');
      onSave?.(updated);

      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to save notification config';
      setSaveMessage(`Error: ${errorMsg}`);
      onError?.(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
      <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem', fontWeight: 600 }}>
        Notification Templates
      </h3>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
        <button
          onClick={() => setActiveTab('email')}
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: activeTab === 'email' ? 'var(--color-bg-secondary)' : 'transparent',
            border: activeTab === 'email' ? '1px solid var(--color-border)' : 'none',
            borderBottom: activeTab === 'email' ? 'none' : '1px solid var(--color-border)',
            borderRadius: activeTab === 'email' ? '4px 4px 0 0' : '0',
            cursor: 'pointer',
            fontWeight: activeTab === 'email' ? 600 : 500,
          }}
        >
          Email Templates
        </button>
        <button
          onClick={() => setActiveTab('sms')}
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: activeTab === 'sms' ? 'var(--color-bg-secondary)' : 'transparent',
            border: activeTab === 'sms' ? '1px solid var(--color-border)' : 'none',
            borderBottom: activeTab === 'sms' ? 'none' : '1px solid var(--color-border)',
            borderRadius: activeTab === 'sms' ? '4px 4px 0 0' : '0',
            cursor: 'pointer',
            fontWeight: activeTab === 'sms' ? 600 : 500,
          }}
        >
          SMS Templates
        </button>
      </div>

      {/* Email Templates */}
      {activeTab === 'email' && (
        <div style={{ display: 'grid', gap: '2rem' }}>
          {NOTIFICATION_TYPES.map((notificationType) => (
            <div
              key={notificationType}
              style={{
                padding: '1rem',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: '4px',
              }}
            >
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', fontWeight: 600 }}>
                {notificationType}
              </h4>

              {/* Subject */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={config.emailTemplates?.[notificationType]?.subject ?? ''}
                  onChange={(e) => handleEmailTemplateChange(notificationType, 'subject', e.target.value)}
                  placeholder={`Subject for ${notificationType}`}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                  }}
                />
              </div>

              {/* Body */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
                  Body
                </label>
                <textarea
                  value={config.emailTemplates?.[notificationType]?.body ?? ''}
                  onChange={(e) => handleEmailTemplateChange(notificationType, 'body', e.target.value)}
                  placeholder={`Email body for ${notificationType}`}
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '0.5rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SMS Templates */}
      {activeTab === 'sms' && (
        <div style={{ display: 'grid', gap: '2rem' }}>
          {NOTIFICATION_TYPES.map((notificationType) => {
            const smsBody = config.smsTemplates?.[notificationType]?.body ?? '';
            const charCount = smsBody.length;
            const isOverLimit = charCount > 160;

            return (
              <div
                key={notificationType}
                style={{
                  padding: '1rem',
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderRadius: '4px',
                }}
              >
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', fontWeight: 600 }}>
                  {notificationType}
                </h4>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Message</label>
                    <span
                      style={{
                        fontSize: '0.875rem',
                        color: isOverLimit ? 'var(--color-error)' : 'var(--color-text-secondary)',
                        fontWeight: isOverLimit ? 600 : 400,
                      }}
                    >
                      {charCount}/160 chars
                    </span>
                  </div>

                  <textarea
                    value={smsBody}
                    onChange={(e) => handleSmsTemplateChange(notificationType, e.target.value)}
                    placeholder={`SMS message for ${notificationType}`}
                    style={{
                      width: '100%',
                      minHeight: '80px',
                      padding: '0.5rem',
                      border: isOverLimit ? '2px solid var(--color-error)' : '1px solid var(--color-border)',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                    }}
                  />

                  {isOverLimit && (
                    <div style={{ color: 'var(--color-error)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                      Warning: SMS exceeds 160 characters ({charCount - 160} chars over limit)
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Variable Placeholders Guide */}
      <div
        style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: 'var(--color-bg-secondary)',
          borderRadius: '4px',
          fontSize: '0.875rem',
        }}
      >
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 600 }}>
          Available Variables
        </h4>
        <p style={{ margin: '0.5rem 0', color: 'var(--color-text-secondary)' }}>
          Use these placeholders in templates — they will be replaced at send time:
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.5rem',
            marginTop: '0.5rem',
          }}
        >
          {VARIABLE_PLACEHOLDERS.map((placeholder) => (
            <code
              key={placeholder}
              style={{
                padding: '0.25rem 0.5rem',
                backgroundColor: 'var(--color-bg-primary)',
                borderRadius: '3px',
                fontFamily: 'monospace',
                color: 'var(--color-text-secondary)',
              }}
            >
              {placeholder}
            </code>
          ))}
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
          {isSaving ? 'Saving...' : 'Save Templates'}
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
