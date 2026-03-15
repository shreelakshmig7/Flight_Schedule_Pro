/*
 * container-apps.bicep
 * --------------------
 * Agentic Scheduler — FSP Integration — Container Apps module
 * -----------------------------------------------------------
 * Provisions the Container Apps environment and three Container Apps:
 * api (NestJS REST + WebSocket), worker (NestJS background processor),
 * and web (Next.js scheduler console). Each app has a user-assigned
 * managed identity that is pre-granted Key Vault Secrets User access
 * in main.bicep before this module runs, ensuring secrets resolve on
 * first start.
 *
 * Key resources: Container Apps environment, ca-api, ca-worker, ca-web
 *                User-assigned managed identities for each app
 *
 * PR: PR-2 — Azure Infrastructure Provisioning
 */

@description('Azure region for all resources.')
param location string

@description('Resource tags applied to every resource in this module.')
param tags object

@description('Target environment identifier (develop | staging | production).')
@allowed(['develop', 'staging', 'production'])
param environment string

@description('Name for the Container Apps managed environment.')
param containerAppsEnvName string

@description('Log Analytics workspace GUID for appLogsConfiguration.')
param logAnalyticsCustomerId string

@description('Log Analytics primary shared key for appLogsConfiguration.')
@secure()
param logAnalyticsSharedKey string

@description('Key Vault URI (e.g. https://kv-name.vault.azure.net/) for secret references.')
param keyVaultUri string

@description('ACR login server (e.g. acrfspdevXXXXXXXX.azurecr.io) — used for registry pull configuration.')
param acrLoginServer string

@description('FSP authentication gateway base URL.')
param fspApiBaseUrl string

@description('FSP direct API base URL.')
param fspCoreBaseUrl string

@description('FSP curriculum API base URL.')
param fspCurriculumBaseUrl string

@description('FSP environment identifier string (e.g. develop).')
param fspEnvironment string

@description('Application Insights connection string for telemetry.')
param appInsightsConnectionString string

@description('Service Bus namespace FQDN (e.g. sb-name.servicebus.windows.net).')
#disable-next-line no-unused-params
param serviceBusNamespaceFqdn string

// ---------------------------------------------------------------------------
// User-assigned managed identities — created in main.bicep, passed in by ID.
// Using user-assigned (vs system-assigned) avoids the chicken-and-egg problem
// where KV roles can't be assigned until after the Container App exists.
// ---------------------------------------------------------------------------

@description('Resource ID of the api app user-assigned managed identity.')
param apiManagedIdentityId string

@description('Client ID of the api app user-assigned managed identity (for KV secret identity field).')
#disable-next-line no-unused-params
param apiManagedIdentityClientId string

@description('Resource ID of the worker app user-assigned managed identity.')
param workerManagedIdentityId string

@description('Client ID of the worker app user-assigned managed identity.')
#disable-next-line no-unused-params
param workerManagedIdentityClientId string

@description('Resource ID of the web app user-assigned managed identity.')
param webManagedIdentityId string

@description('Client ID of the web app user-assigned managed identity.')
#disable-next-line no-unused-params
param webManagedIdentityClientId string

// ---------------------------------------------------------------------------
// Placeholder image used until PR-3 builds and pushes real images.
// ---------------------------------------------------------------------------
var placeholderImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// ---------------------------------------------------------------------------
// Container Apps environment — consumption plan, logs to Log Analytics
// ---------------------------------------------------------------------------
resource containerAppsEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerAppsEnvName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
  }
}

// ---------------------------------------------------------------------------
// API Container App — NestJS Fastify, external ingress on port 3000
// Secrets sourced from Key Vault via user-assigned managed identity
// ---------------------------------------------------------------------------
resource apiContainerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'ca-api-${environment}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${apiManagedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      // ACR pull via managed identity — no stored credentials
      registries: [
        {
          server: acrLoginServer
          identity: apiManagedIdentityId
        }
      ]
      // Secrets reference Key Vault using the user-assigned managed identity
      secrets: [
        {
          name: 'fsp-subscription-key'
          keyVaultUrl: '${keyVaultUri}secrets/fsp-subscription-key'
          identity: apiManagedIdentityId
        }
        {
          name: 'anthropic-api-key'
          keyVaultUrl: '${keyVaultUri}secrets/anthropic-api-key'
          identity: apiManagedIdentityId
        }
        {
          name: 'database-url'
          keyVaultUrl: '${keyVaultUri}secrets/database-url'
          identity: apiManagedIdentityId
        }
        {
          name: 'service-bus-connection-string'
          keyVaultUrl: '${keyVaultUri}secrets/service-bus-connection-string'
          identity: apiManagedIdentityId
        }
      ]
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      activeRevisionsMode: 'Single'
    }
    template: {
      containers: [
        {
          name: 'api'
          image: placeholderImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3000' }
            { name: 'FSP_API_BASE_URL', value: fspApiBaseUrl }
            { name: 'FSP_CORE_BASE_URL', value: fspCoreBaseUrl }
            { name: 'FSP_CURRICULUM_BASE_URL', value: fspCurriculumBaseUrl }
            { name: 'FSP_ENVIRONMENT', value: fspEnvironment }
            { name: 'AZURE_SERVICE_BUS_POLL_QUEUE', value: 'poll-jobs' }
            { name: 'AZURE_SERVICE_BUS_CHANGE_EVENTS_QUEUE', value: 'change-events' }
            { name: 'AZURE_SERVICE_BUS_SUGGESTION_RESULTS_QUEUE', value: 'suggestion-results' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            // Secrets resolved from Key Vault at runtime
            { name: 'FSP_SUBSCRIPTION_KEY', secretRef: 'fsp-subscription-key' }
            { name: 'ANTHROPIC_API_KEY', secretRef: 'anthropic-api-key' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'AZURE_SERVICE_BUS_CONNECTION_STRING', secretRef: 'service-bus-connection-string' }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 10
        rules: [
          {
            name: 'cpu-scaling'
            custom: {
              type: 'cpu'
              metadata: {
                type: 'Utilization'
                value: '70'
              }
            }
          }
        ]
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Worker Container App — NestJS background processor, no ingress
// ---------------------------------------------------------------------------
resource workerContainerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'ca-worker-${environment}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${workerManagedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      registries: [
        {
          server: acrLoginServer
          identity: workerManagedIdentityId
        }
      ]
      secrets: [
        {
          name: 'fsp-subscription-key'
          keyVaultUrl: '${keyVaultUri}secrets/fsp-subscription-key'
          identity: workerManagedIdentityId
        }
        {
          name: 'anthropic-api-key'
          keyVaultUrl: '${keyVaultUri}secrets/anthropic-api-key'
          identity: workerManagedIdentityId
        }
        {
          name: 'database-url'
          keyVaultUrl: '${keyVaultUri}secrets/database-url'
          identity: workerManagedIdentityId
        }
        {
          name: 'service-bus-connection-string'
          keyVaultUrl: '${keyVaultUri}secrets/service-bus-connection-string'
          identity: workerManagedIdentityId
        }
      ]
      // No ingress — worker processes queue messages internally
      activeRevisionsMode: 'Single'
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: placeholderImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3001' }
            { name: 'FSP_API_BASE_URL', value: fspApiBaseUrl }
            { name: 'FSP_CORE_BASE_URL', value: fspCoreBaseUrl }
            { name: 'FSP_CURRICULUM_BASE_URL', value: fspCurriculumBaseUrl }
            { name: 'FSP_ENVIRONMENT', value: fspEnvironment }
            { name: 'AZURE_SERVICE_BUS_POLL_QUEUE', value: 'poll-jobs' }
            { name: 'AZURE_SERVICE_BUS_CHANGE_EVENTS_QUEUE', value: 'change-events' }
            { name: 'AZURE_SERVICE_BUS_SUGGESTION_RESULTS_QUEUE', value: 'suggestion-results' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            { name: 'FSP_SUBSCRIPTION_KEY', secretRef: 'fsp-subscription-key' }
            { name: 'ANTHROPIC_API_KEY', secretRef: 'anthropic-api-key' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'AZURE_SERVICE_BUS_CONNECTION_STRING', secretRef: 'service-bus-connection-string' }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 10
        rules: [
          {
            name: 'cpu-scaling'
            custom: {
              type: 'cpu'
              metadata: {
                type: 'Utilization'
                value: '70'
              }
            }
          }
        ]
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Web Container App — Next.js scheduler console, external ingress port 3000
// ---------------------------------------------------------------------------
resource webContainerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'ca-web-${environment}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${webManagedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      registries: [
        {
          server: acrLoginServer
          identity: webManagedIdentityId
        }
      ]
      secrets: [
        {
          name: 'nextauth-secret'
          keyVaultUrl: '${keyVaultUri}secrets/fsp-subscription-key'
          identity: webManagedIdentityId
        }
      ]
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      activeRevisionsMode: 'Single'
    }
    template: {
      containers: [
        {
          name: 'web'
          image: placeholderImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3000' }
            { name: 'NEXT_PUBLIC_API_URL', value: 'https://${apiContainerApp.properties.configuration.ingress.fqdn}' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 10
        rules: [
          {
            name: 'cpu-scaling'
            custom: {
              type: 'cpu'
              metadata: {
                type: 'Utilization'
                value: '70'
              }
            }
          }
        ]
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs — used by main.bicep for role assignments and display
// ---------------------------------------------------------------------------

@description('Container Apps environment resource ID.')
output containerAppsEnvId string = containerAppsEnv.id

@description('API Container App FQDN.')
output apiFqdn string = apiContainerApp.properties.configuration.ingress.fqdn

@description('Web Container App FQDN.')
output webFqdn string = webContainerApp.properties.configuration.ingress.fqdn
