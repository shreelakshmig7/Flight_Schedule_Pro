/*
 * postgresql.bicep
 * ----------------
 * Agentic Scheduler — FSP Integration — PostgreSQL Flexible Server module
 * -----------------------------------------------------------------------
 * Provisions a PostgreSQL 15 Flexible Server with the fsp_scheduler
 * database. SKU is environment-aware: Burstable B1ms for develop/staging,
 * GeneralPurpose D2s_v3 for production. The firewall allows all Azure
 * services so Container Apps (with dynamic outbound IPs) can connect.
 *
 * Key resources: PostgreSQL Flexible Server, fsp_scheduler database,
 *                Azure services firewall rule
 *
 * PR: PR-2 — Azure Infrastructure Provisioning
 */

@description('Azure region for all resources.')
param location string

@description('Resource tags applied to every resource in this module.')
param tags object

@description('Globally unique server name (3-63 chars, lowercase alphanumeric + hyphens).')
param serverName string

@description('Target environment — controls the SKU tier.')
@allowed(['develop', 'staging', 'production'])
param environment string

@description('PostgreSQL administrator login username.')
param adminUser string

@description('PostgreSQL administrator password — stored in Key Vault, never logged.')
@secure()
param adminPassword string

// ---------------------------------------------------------------------------
// SKU selection — Burstable for develop, GeneralPurpose for production
// PRD requirement: GeneralPurpose_Standard_D2s_v3 minimum for production
// ---------------------------------------------------------------------------
var skuName = environment == 'production' ? 'Standard_D2s_v3' : 'Standard_B1ms'
var skuTier = environment == 'production' ? 'GeneralPurpose' : 'Burstable'
var storageSizeGB = environment == 'production' ? 64 : 32

// ---------------------------------------------------------------------------
// PostgreSQL Flexible Server
// ---------------------------------------------------------------------------
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: serverName
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: '15'
    administratorLogin: adminUser
    administratorLoginPassword: adminPassword
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
    storage: {
      storageSizeGB: storageSizeGB
      autoGrow: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    maintenanceWindow: {
      customWindow: 'Disabled'
    }
  }
}

// ---------------------------------------------------------------------------
// Database — fsp_scheduler, UTF-8 collation
// ---------------------------------------------------------------------------
resource fspDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgresServer
  name: 'fsp_scheduler'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// ---------------------------------------------------------------------------
// Firewall — allow all Azure services (0.0.0.0/0.0.0.0 is the Azure magic
// value that enables the "Allow access to Azure services" toggle).
// Container Apps use dynamic outbound IPs so a specific IP range is not viable
// without VNet integration (out of scope for Phase 1 MVP).
// ---------------------------------------------------------------------------
resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgresServer
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

@description('Fully qualified domain name of the PostgreSQL server.')
output serverFqdn string = postgresServer.properties.fullyQualifiedDomainName

@description('Server name (used to construct DATABASE_URL in main.bicep).')
output serverName string = postgresServer.name
