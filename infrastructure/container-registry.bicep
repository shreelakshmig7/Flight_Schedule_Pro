/*
 * container-registry.bicep
 * ------------------------
 * Agentic Scheduler — FSP Integration — Azure Container Registry module
 * ----------------------------------------------------------------------
 * Provisions a Premium-tier ACR (only SKU available on this subscription).
 * Admin account is DISABLED — all pulls use managed identity + AcrPull RBAC,
 * which is the secure, credential-free approach for Container Apps.
 *
 * PR: PR-2 — Azure Infrastructure Provisioning
 */

@description('Azure region for the registry.')
param location string

@description('Resource tags applied to every resource in this module.')
param tags object

@description('Name for the Container Registry (alphanumeric, 5-50 chars).')
param registryName string

@description('Target environment — controls SKU selection.')
@allowed(['develop', 'staging', 'production'])
param environment string

// ---------------------------------------------------------------------------
// SKU — Premium (Basic and Standard blocked on this subscription)
// ---------------------------------------------------------------------------
var registrySku = 'Premium'

// ---------------------------------------------------------------------------
// Azure Container Registry
// Admin account disabled — managed identity AcrPull role used instead
// ---------------------------------------------------------------------------
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: registrySku
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: 'Disabled'
    policies: {
      retentionPolicy: {
        days: environment == 'production' ? 30 : 7
        status: 'enabled'
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

@description('ACR login server (e.g. acrfspdevXXXXXXXX.azurecr.io).')
output loginServer string = containerRegistry.properties.loginServer

@description('ACR resource ID — used for AcrPull role assignment scoping.')
output registryId string = containerRegistry.id

@description('ACR name.')
output registryName string = containerRegistry.name
