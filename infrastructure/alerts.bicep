/*
 * alerts.bicep
 * -----------------
 * Agentic Scheduler — FSP Integration — Azure Monitor alert rules module
 * -----------------------------------------------------------------------
 * Provisions Azure Monitor alert rules for custom metrics and logs emitted
 * from the worker and API services to Application Insights. Alerts notify
 * operations teams when threshold conditions are met.
 *
 * Alert conditions (from PR-23):
 * 1. polling.429_count > 3 per hour — rate limiting issues
 * 2. acceptance_rate < 0.5 over 24 hours — low suggestion acceptance
 * 3. llm.call_latency_ms p95 > 8000ms — LLM performance degradation
 *
 * Key resources: Metric alerts, Action groups, Email notifications
 *
 * PR: PR-23 — Azure Application Insights Integration
 */

@description('Azure region for all resources.')
param location string

@description('Resource tags applied to every resource in this module.')
param tags object

@description('Application Insights resource ID.')
param appInsightsId string

@description('Name for the action group (receives alert notifications).')
param actionGroupName string

@description('Email address to receive alert notifications.')
param alertEmailAddress string

// ---------------------------------------------------------------------------
// Action Group — notification target for all alerts
// ---------------------------------------------------------------------------

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: actionGroupName
  location: 'global' // Action groups must be global
  tags: tags
  properties: {
    groupShortName: 'FSPAlerts'
    enabled: true
    emailReceivers: [
      {
        name: 'AlertEmail'
        emailAddress: alertEmailAddress
        useCommonAlertSchema: true
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Alert 1: High 429 Response Rate (Polling Rate Limiting)
// Triggers if > 3 HTTP 429 responses in 1 hour
// ---------------------------------------------------------------------------

resource polling429Alert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'FSP-Polling-429-HighCount'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when polling dispatcher receives > 3 HTTP 429 (rate limit) responses per hour from FSP API'
    severity: 2 // Warning severity
    enabled: true
    scopes: [
      appInsightsId
    ]
    evaluationFrequency: 'PT15M' // Check every 15 minutes
    windowSize: 'PT1H' // 1-hour window for evaluation
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.MultipleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'Polling 429 Count'
          metricName: 'polling.429_count'
          metricNamespace: 'Azure.ApplicationInsights'
          operator: 'GreaterThan'
          threshold: 3
          timeAggregation: 'Total'
          skipMetricValidation: true
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Alert 2: Low Suggestion Acceptance Rate
// Triggers if acceptance_rate < 0.5 (50%) over a 24-hour window
// ---------------------------------------------------------------------------

resource acceptanceRateAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'FSP-Suggestions-LowAcceptanceRate'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when suggestion acceptance rate drops below 50% over a 24-hour period'
    severity: 1 // Critical severity
    enabled: true
    scopes: [
      appInsightsId
    ]
    evaluationFrequency: 'PT1H' // Check every hour
    windowSize: 'P1D' // 24-hour window for evaluation
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.MultipleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'Acceptance Rate'
          metricName: 'suggestions.acceptance_rate'
          metricNamespace: 'Azure.ApplicationInsights'
          operator: 'LessThan'
          threshold: 0.5
          timeAggregation: 'Average'
          skipMetricValidation: true
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Alert 3: High LLM Call Latency
// Triggers if p95 LLM latency > 8000ms (8 seconds)
// ---------------------------------------------------------------------------

resource llmLatencyAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'FSP-LLM-HighLatency-P95'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when LLM API call latency (p95) exceeds 8 seconds'
    severity: 1 // Critical severity (impacts suggestion generation)
    enabled: true
    scopes: [
      appInsightsId
    ]
    evaluationFrequency: 'PT5M' // Check every 5 minutes (tighter for perf issues)
    windowSize: 'PT30M' // 30-minute window for p95 calculation
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.MultipleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'LLM Latency P95'
          metricName: 'llm.call_latency_ms'
          metricNamespace: 'Azure.ApplicationInsights'
          operator: 'GreaterThan'
          threshold: 8000
          timeAggregation: 'Percentile95'
          skipMetricValidation: true
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

@description('Action group resource ID (used by other alert rules if needed).')
output actionGroupId string = actionGroup.id

@description('Polling 429 alert rule ID.')
output polling429AlertId string = polling429Alert.id

@description('Acceptance rate alert rule ID.')
output acceptanceRateAlertId string = acceptanceRateAlert.id

@description('LLM latency alert rule ID.')
output llmLatencyAlertId string = llmLatencyAlert.id
