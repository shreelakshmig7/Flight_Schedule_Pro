/*
 * service-bus.bicep
 * -----------------
 * Agentic Scheduler — FSP Integration — Azure Service Bus module
 * --------------------------------------------------------------
 * Provisions a Standard-tier Service Bus namespace and the three
 * queues used by the scheduler: poll-jobs, change-events, and
 * suggestion-results. Every queue has dead-letter queuing enabled
 * with maxDeliveryCount=5 (matches DEAD_LETTER_MAX_DELIVERY_COUNT
 * constant in shared-types).
 *
 * Key resources: Service Bus namespace, poll-jobs queue,
 *                change-events queue, suggestion-results queue
 *
 * PR: PR-2 — Azure Infrastructure Provisioning
 */

@description('Azure region for all resources.')
param location string

@description('Resource tags applied to every resource in this module.')
param tags object

@description('Globally unique name for the Service Bus namespace.')
param namespaceName string

// ---------------------------------------------------------------------------
// Service Bus namespace — Standard tier required for scheduled messages
// ---------------------------------------------------------------------------
resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: namespaceName
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

// ---------------------------------------------------------------------------
// Queues — three queues, all with DLQ and maxDeliveryCount = 5
// poll-jobs         → triggers a polling cycle for one operator
// change-events     → carries detected FSP state changes
// suggestion-results → carries approved/rejected suggestion outcomes
// ---------------------------------------------------------------------------
resource pollJobsQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'poll-jobs'
  properties: {
    deadLetteringOnMessageExpiration: true
    maxDeliveryCount: 5
    lockDuration: 'PT1M'
    defaultMessageTimeToLive: 'P14D'
    enablePartitioning: false
    requiresDuplicateDetection: false
    requiresSession: false
  }
}

resource changeEventsQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'change-events'
  properties: {
    deadLetteringOnMessageExpiration: true
    maxDeliveryCount: 5
    lockDuration: 'PT1M'
    defaultMessageTimeToLive: 'P14D'
    enablePartitioning: false
    requiresDuplicateDetection: false
    requiresSession: false
  }
}

resource suggestionResultsQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'suggestion-results'
  properties: {
    deadLetteringOnMessageExpiration: true
    maxDeliveryCount: 5
    lockDuration: 'PT1M'
    defaultMessageTimeToLive: 'P14D'
    enablePartitioning: false
    requiresDuplicateDetection: false
    requiresSession: false
  }
}

// ---------------------------------------------------------------------------
// Shared access policy — used to derive the connection string stored in KV
// ---------------------------------------------------------------------------
resource rootAuthRule 'Microsoft.ServiceBus/namespaces/authorizationRules@2022-10-01-preview' existing = {
  parent: serviceBusNamespace
  name: 'RootManageSharedAccessKey'
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

@description('Service Bus namespace name.')
output serviceBusNamespaceName string = serviceBusNamespace.name

@description('Service Bus namespace FQDN (e.g. sb-name.servicebus.windows.net).')
output serviceBusNamespaceFqdn string = '${serviceBusNamespace.name}.servicebus.windows.net'

@description('Primary connection string — stored in Key Vault by main.bicep. Marked @secure() to suppress from deployment outputs.')
@secure()
output primaryConnectionString string = rootAuthRule.listKeys().primaryConnectionString
