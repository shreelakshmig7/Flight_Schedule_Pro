/*
 * appinsights.bicep
 * -----------------
 * Agentic Scheduler — FSP Integration — Application Insights module
 * -----------------------------------------------------------------
 * Provisions a Log Analytics workspace and an Application Insights
 * component linked to it. All Container Apps ship logs and telemetry
 * here. The shared key is a @secure() output — never logged.
 *
 * Key resources: Log Analytics workspace, Application Insights component
 *
 * PR: PR-2 — Azure Infrastructure Provisioning
 */

@description('Azure region for all resources.')
param location string

@description('Resource tags applied to every resource in this module.')
param tags object

@description('Name for the Log Analytics workspace.')
param logAnalyticsName string

@description('Name for the Application Insights component.')
param appInsightsName string

// ---------------------------------------------------------------------------
// Log Analytics workspace — backing store for Container Apps logs and traces
// ---------------------------------------------------------------------------
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ---------------------------------------------------------------------------
// Application Insights — linked to the Log Analytics workspace above
// ---------------------------------------------------------------------------
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

@description('Full Application Insights connection string for SDK initialisation.')
output appInsightsConnectionString string = appInsights.properties.ConnectionString

@description('Application Insights instrumentation key (legacy — prefer connection string).')
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey

@description('Log Analytics workspace resource ID.')
output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id

@description('Log Analytics workspace GUID, required by Container Apps environment appLogsConfiguration.')
output logAnalyticsCustomerId string = logAnalyticsWorkspace.properties.customerId

@description('Log Analytics primary shared key — passed to Container Apps environment. Marked @secure() to suppress from deployment outputs.')
@secure()
output logAnalyticsSharedKey string = logAnalyticsWorkspace.listKeys().primarySharedKey
