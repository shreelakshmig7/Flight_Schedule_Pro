/*
 * main.bicep
 * ----------
 * Agentic Scheduler — FSP Integration — Root Bicep template
 * ---------------------------------------------------------
 * Entry point for all Azure infrastructure provisioning.
 * Orchestrates six modules (App Insights, Service Bus, PostgreSQL,
 * Key Vault, Container Registry, Container Apps) and handles cross-cutting
 * concerns: user-assigned managed identities, Key Vault RBAC role assignments,
 * and AcrPull role assignments.
 * All secrets are accepted as @secure() parameters — never hardcoded.
 *
 * Deployment order (Bicep infers from dependency references):
 *   1. App Insights + Service Bus + PostgreSQL + ACR (parallel, no deps)
 *   2. Managed identities (no deps)
 *   3. Key Vault (depends on postgresql output for DATABASE_URL)
 *   4. KV role assignments + AcrPull role assignments (depends on KV/ACR + identities)
 *   5. Container Apps (depends on KV URI + ACR login server + identities + roles)
 *
 * PR: PR-2 — Azure Infrastructure Provisioning
 */

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

@description('Target environment. Controls SKU selection and resource naming.')
@allowed(['develop', 'staging', 'production'])
param environment string = 'develop'

@description('Azure region. Use a region where your subscription can provision PostgreSQL Flexible Server (e.g. westus2, centralus if eastus/eastus2 are restricted).')
@allowed(['eastus', 'eastus2', 'westus2', 'centralus'])
param location string = 'westus2'

@description('FSP API subscription key — stored in Key Vault only, never logged.')
@secure()
param fspSubscriptionKey string

@description('Anthropic API key for Claude 3.5 Sonnet calls — stored in Key Vault only.')
@secure()
param anthropicApiKey string

@description('PostgreSQL administrator password — stored in Key Vault only.')
@secure()
param dbAdminPassword string

@description('FSP environment identifier string.')
param fspEnvironment string = 'develop'

@description('FSP authentication gateway (Azure APIM) base URL.')
param fspApiBaseUrl string = 'https://development-fsp.azure-api.net'

@description('FSP direct API base URL.')
param fspCoreBaseUrl string = 'https://api-develop.flightschedulepro.com'

@description('FSP curriculum API base URL.')
param fspCurriculumBaseUrl string = 'https://curriculum-api-develop.flightschedulepro.com'

// ---------------------------------------------------------------------------
// Variables — resource naming and tags
// uniqueString(resourceGroup().id) produces an 8-char deterministic suffix
// that ensures globally-unique names are stable across redeploys of the same RG.
// ---------------------------------------------------------------------------

var projectName = 'fsp-scheduler'
var dbAdminUser = 'fspadmin'
var uniqueSuffix = take(uniqueString(resourceGroup().id), 8)

// All resources carry these three tags — PRD requirement
var tags = {
  environment: environment
  project: projectName
  'managed-by': 'bicep'
}

// Resource names
var logAnalyticsName         = 'log-fsp-${environment}-${uniqueSuffix}'
var appInsightsName          = 'appi-fsp-${environment}-${uniqueSuffix}'
var serviceBusNamespaceName  = 'sb-fsp-${environment}-${uniqueSuffix}'
var postgresServerName       = 'psql-fsp-${environment}-${uniqueSuffix}'
var keyVaultName             = 'kv-fsp-${take(environment, 3)}-${uniqueSuffix}'
var containerAppsEnvName     = 'cae-fsp-${environment}-${uniqueSuffix}'
// ACR names must be alphanumeric only, 5-50 chars — no hyphens allowed
var containerRegistryName    = 'acrfsp${take(environment, 3)}${uniqueSuffix}'

// Managed identity names — one per Container App; include location so the same
// Bicep can deploy to a new region (e.g. westus2) without conflicting with
// existing identities in another region (e.g. eastus).
var apiIdentityName    = 'id-ca-api-${environment}-${location}'
var workerIdentityName = 'id-ca-worker-${environment}-${location}'
var webIdentityName    = 'id-ca-web-${environment}-${location}'

// Built-in roles
// https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles
var kvSecretsUserRoleDefinitionId = '4633458b-17de-408a-b874-0445c86b69e6'
var acrPullRoleDefinitionId       = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

// ---------------------------------------------------------------------------
// Step 1a — Application Insights + Log Analytics
// ---------------------------------------------------------------------------
module appInsights 'appinsights.bicep' = {
  name: 'deploy-appinsights'
  params: {
    location: location
    tags: tags
    logAnalyticsName: logAnalyticsName
    appInsightsName: appInsightsName
  }
}

// ---------------------------------------------------------------------------
// Step 1b — Service Bus namespace + queues (parallel with App Insights)
// ---------------------------------------------------------------------------
module serviceBus 'service-bus.bicep' = {
  name: 'deploy-servicebus'
  params: {
    location: location
    tags: tags
    namespaceName: serviceBusNamespaceName
  }
}

// ---------------------------------------------------------------------------
// Step 1c — PostgreSQL Flexible Server (parallel with App Insights + SB)
// ---------------------------------------------------------------------------
module postgresql 'postgresql.bicep' = {
  name: 'deploy-postgresql'
  params: {
    location: location
    tags: tags
    serverName: postgresServerName
    environment: environment
    adminUser: dbAdminUser
    adminPassword: dbAdminPassword
  }
}

// ---------------------------------------------------------------------------
// Step 1d — Azure Container Registry (parallel with App Insights + SB + PG)
// ---------------------------------------------------------------------------
module containerRegistry 'container-registry.bicep' = {
  name: 'deploy-container-registry'
  params: {
    location: location
    tags: tags
    registryName: containerRegistryName
    environment: environment
  }
}

// ---------------------------------------------------------------------------
// Step 2 — User-assigned managed identities (parallel with steps 1a-1d)
// Creating these before Key Vault lets us grant KV access BEFORE the
// Container Apps try to start, avoiding the system-identity chicken-and-egg.
// ---------------------------------------------------------------------------
resource apiManagedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: apiIdentityName
  location: location
  tags: tags
}

resource workerManagedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: workerIdentityName
  location: location
  tags: tags
}

resource webManagedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: webIdentityName
  location: location
  tags: tags
}

// ---------------------------------------------------------------------------
// Step 3 — Key Vault (depends on postgresql output + service bus output)
// DATABASE_URL is constructed here so the full connection string is a single
// secret — never split across multiple env vars.
// ---------------------------------------------------------------------------
var databaseUrl = 'postgresql://${dbAdminUser}:${dbAdminPassword}@${postgresql.outputs.serverFqdn}/fsp_scheduler?sslmode=require'

module keyVault 'keyvault.bicep' = {
  name: 'deploy-keyvault'
  params: {
    location: location
    tags: tags
    keyVaultName: keyVaultName
    fspSubscriptionKey: fspSubscriptionKey
    anthropicApiKey: anthropicApiKey
    dbAdminPassword: dbAdminPassword
    databaseUrl: databaseUrl
    serviceBusConnectionString: serviceBus.outputs.primaryConnectionString
  }
}

// ---------------------------------------------------------------------------
// Step 4 — Key Vault RBAC role assignments
// All three Container App managed identities get Key Vault Secrets User role.
// Role assignments deploy before Container Apps (enforced via dependsOn on
// the container-apps module), so secrets resolve on first container start.
// ---------------------------------------------------------------------------
resource existingKeyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
  dependsOn: [keyVault]
}

resource apiKvRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: existingKeyVault
  name: guid(existingKeyVault.id, apiManagedIdentity.id, kvSecretsUserRoleDefinitionId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleDefinitionId)
    principalId: apiManagedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource workerKvRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: existingKeyVault
  name: guid(existingKeyVault.id, workerManagedIdentity.id, kvSecretsUserRoleDefinitionId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleDefinitionId)
    principalId: workerManagedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource webKvRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: existingKeyVault
  name: guid(existingKeyVault.id, webManagedIdentity.id, kvSecretsUserRoleDefinitionId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleDefinitionId)
    principalId: webManagedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Step 4b — AcrPull role assignments
// All three managed identities get AcrPull on the ACR so Container Apps can
// pull images without storing registry credentials anywhere.
// ---------------------------------------------------------------------------
resource existingContainerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: containerRegistryName
  dependsOn: [containerRegistry]
}

resource apiAcrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: existingContainerRegistry
  name: guid(existingContainerRegistry.id, apiManagedIdentity.id, acrPullRoleDefinitionId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleDefinitionId)
    principalId: apiManagedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource workerAcrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: existingContainerRegistry
  name: guid(existingContainerRegistry.id, workerManagedIdentity.id, acrPullRoleDefinitionId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleDefinitionId)
    principalId: workerManagedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource webAcrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: existingContainerRegistry
  name: guid(existingContainerRegistry.id, webManagedIdentity.id, acrPullRoleDefinitionId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleDefinitionId)
    principalId: webManagedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Step 5 — Container Apps environment + three Container Apps
// dependsOn role assignments ensures all three identities have KV access
// before any Container App tries to resolve its Key Vault secret references.
// ---------------------------------------------------------------------------
module containerApps 'container-apps.bicep' = {
  name: 'deploy-container-apps'
  params: {
    location: location
    tags: tags
    environment: environment
    containerAppsEnvName: containerAppsEnvName
    logAnalyticsCustomerId: appInsights.outputs.logAnalyticsCustomerId
    logAnalyticsSharedKey: appInsights.outputs.logAnalyticsSharedKey
    keyVaultUri: keyVault.outputs.keyVaultUri
    acrLoginServer: containerRegistry.outputs.loginServer
    fspApiBaseUrl: fspApiBaseUrl
    fspCoreBaseUrl: fspCoreBaseUrl
    fspCurriculumBaseUrl: fspCurriculumBaseUrl
    fspEnvironment: fspEnvironment
    appInsightsConnectionString: appInsights.outputs.appInsightsConnectionString
    serviceBusNamespaceFqdn: serviceBus.outputs.serviceBusNamespaceFqdn
    apiManagedIdentityId: apiManagedIdentity.id
    apiManagedIdentityClientId: apiManagedIdentity.properties.clientId
    workerManagedIdentityId: workerManagedIdentity.id
    workerManagedIdentityClientId: workerManagedIdentity.properties.clientId
    webManagedIdentityId: webManagedIdentity.id
    webManagedIdentityClientId: webManagedIdentity.properties.clientId
  }
  dependsOn: [
    apiKvRoleAssignment
    workerKvRoleAssignment
    webKvRoleAssignment
    apiAcrPullRoleAssignment
    workerAcrPullRoleAssignment
    webAcrPullRoleAssignment
  ]
}

// ---------------------------------------------------------------------------
// Outputs — safe to display (no secrets)
// ---------------------------------------------------------------------------

@description('Key Vault name for post-deployment verification.')
output keyVaultName string = keyVaultName

@description('Service Bus namespace name.')
output serviceBusNamespaceName string = serviceBusNamespaceName

@description('PostgreSQL server FQDN.')
output postgresServerFqdn string = postgresql.outputs.serverFqdn

@description('Container Apps environment name.')
output containerAppsEnvName string = containerAppsEnvName

@description('API Container App public FQDN.')
output apiFqdn string = containerApps.outputs.apiFqdn

@description('Web Container App public FQDN.')
output webFqdn string = containerApps.outputs.webFqdn

@description('Application Insights connection string (non-secret — instrumentation key is not a credential).')
output appInsightsConnectionString string = appInsights.outputs.appInsightsConnectionString

@description('Azure Container Registry login server (e.g. acrfspdevXXXXXXXX.azurecr.io).')
output acrLoginServer string = containerRegistry.outputs.loginServer

@description('Azure Container Registry name.')
output acrName string = containerRegistry.outputs.registryName
