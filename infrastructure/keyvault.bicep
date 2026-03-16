/*
 * keyvault.bicep
 * --------------
 * Agentic Scheduler — FSP Integration — Azure Key Vault module
 * ------------------------------------------------------------
 * Provisions a Key Vault with soft-delete and purge protection enabled
 * and stores all application secrets: FSP subscription key, Anthropic
 * API key, database URL, and Service Bus connection string. Access is
 * controlled via Azure RBAC — Container App managed identities are
 * granted the Key Vault Secrets User role in main.bicep.
 *
 * Key resources: Key Vault, fsp-subscription-key secret,
 *                anthropic-api-key secret, database-url secret,
 *                service-bus-connection-string secret
 *
 * PR: PR-2 — Azure Infrastructure Provisioning
 */

@description('Azure region for all resources.')
param location string

@description('Resource tags applied to every resource in this module.')
param tags object

@description('Globally unique Key Vault name (3-24 alphanumeric chars + hyphens).')
param keyVaultName string

@description('FSP API subscription key — never stored in plaintext outside Key Vault.')
@secure()
param fspSubscriptionKey string

@description('Anthropic API key — never stored in plaintext outside Key Vault.')
@secure()
param anthropicApiKey string

@description('PostgreSQL administrator password — stored for reference; DATABASE_URL is the primary secret.')
@secure()
param dbAdminPassword string

@description('Full PostgreSQL connection string (postgresql://user:pass@host/db?sslmode=require).')
@secure()
param databaseUrl string

@description('Azure Service Bus primary connection string.')
@secure()
param serviceBusConnectionString string

// ---------------------------------------------------------------------------
// Key Vault — RBAC-enabled, soft-delete + purge protection mandatory
// ---------------------------------------------------------------------------
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    // RBAC authorization — Container App managed identities get Key Vault Secrets User role
    enableRbacAuthorization: true
    // Soft-delete and purge protection — PRD requirement and Azure best practice
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// ---------------------------------------------------------------------------
// Secrets — all application secrets stored here; no plaintext in templates
// ---------------------------------------------------------------------------

resource fspSubscriptionKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'fsp-subscription-key'
  properties: {
    value: fspSubscriptionKey
    attributes: {
      enabled: true
    }
  }
}

resource anthropicApiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'anthropic-api-key'
  properties: {
    value: anthropicApiKey
    attributes: {
      enabled: true
    }
  }
}

resource dbAdminPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'db-admin-password'
  properties: {
    value: dbAdminPassword
    attributes: {
      enabled: true
    }
  }
}

resource databaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'database-url'
  properties: {
    value: databaseUrl
    attributes: {
      enabled: true
    }
  }
}

resource serviceBusConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'service-bus-connection-string'
  properties: {
    value: serviceBusConnectionString
    attributes: {
      enabled: true
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

@description('Key Vault name — used in main.bicep for existing resource reference.')
output keyVaultName string = keyVault.name

@description('Key Vault URI (e.g. https://kv-name.vault.azure.net/) — used in Container Apps secret references.')
output keyVaultUri string = keyVault.properties.vaultUri

@description('Key Vault resource ID.')
output keyVaultId string = keyVault.id
