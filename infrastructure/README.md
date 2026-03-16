# Infrastructure — Agentic Scheduler for Flight Schedule Pro

Azure Bicep IaC for all cloud resources. Deploys to three environments:
`develop` · `staging` · `production`

---

## Resources provisioned

| Resource | Type | Notes |
|---|---|---|
| Log Analytics workspace | `Microsoft.OperationalInsights/workspaces` | Backing store for App Insights |
| Application Insights | `Microsoft.Insights/components` | Telemetry for all three apps |
| Service Bus namespace | `Microsoft.ServiceBus/namespaces` | Standard tier |
| poll-jobs queue | `Microsoft.ServiceBus/namespaces/queues` | DLQ enabled, maxDeliveryCount=5 |
| change-events queue | `Microsoft.ServiceBus/namespaces/queues` | DLQ enabled, maxDeliveryCount=5 |
| suggestion-results queue | `Microsoft.ServiceBus/namespaces/queues` | DLQ enabled, maxDeliveryCount=5 |
| PostgreSQL Flexible Server | `Microsoft.DBforPostgreSQL/flexibleServers` | v15, fsp_scheduler DB |
| Key Vault | `Microsoft.KeyVault/vaults` | Soft-delete + purge protection |
| User-assigned managed identities (×3) | `Microsoft.ManagedIdentity/userAssignedIdentities` | One per Container App |
| Container Apps environment | `Microsoft.App/managedEnvironments` | Consumption plan |
| ca-api Container App | `Microsoft.App/containerApps` | NestJS API, external ingress :3000 |
| ca-worker Container App | `Microsoft.App/containerApps` | NestJS worker, no ingress |
| ca-web Container App | `Microsoft.App/containerApps` | Next.js console, external ingress :3000 |

---

## Prerequisites

```bash
# 1. Install Azure CLI
brew install azure-cli

# 2. Log in
az login

# 3. Set your subscription
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"

# 4. Create the resource group (one-time per environment; use same region as in parameters/develop.json, e.g. westus2)
az group create \
  --name rg-fsp-scheduler-develop \
  --location westus2 \
  --tags environment=develop project=fsp-scheduler managed-by=bicep

# 5. Register required providers (one-time per subscription)
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.DBforPostgreSQL
az provider register --namespace Microsoft.ServiceBus
az provider register --namespace Microsoft.KeyVault
az provider register --namespace Microsoft.Insights
az provider register --namespace Microsoft.OperationalInsights
az provider register --namespace Microsoft.ManagedIdentity
```

---

## Region restrictions

Some subscriptions cannot provision certain resources (e.g. PostgreSQL Flexible Server) in `eastus` or `eastus2`. If you see **LocationIsOfferRestricted**, use a region where your subscription has quota. The template allows `eastus`, `eastus2`, `westus2`, and `centralus`. Develop defaults to `westus2` in `parameters/develop.json`; override with `--parameters location=centralus` (or another allowed region) if needed.

---

## Deploying

Secrets are **never** stored in parameter files. Pass them at deploy time via `--parameters`.

### develop

```bash
az deployment group create \
  --resource-group rg-fsp-scheduler-develop \
  --template-file infrastructure/main.bicep \
  --parameters @infrastructure/parameters/develop.json \
  --parameters fspSubscriptionKey="<YOUR_FSP_KEY>" \
  --parameters anthropicApiKey="<YOUR_ANTHROPIC_KEY>" \
  --parameters dbAdminPassword="<YOUR_DB_PASSWORD>" \
  --confirm-with-what-if
```

### staging

```bash
az group create \
  --name rg-fsp-scheduler-staging \
  --location eastus \
  --tags environment=staging project=fsp-scheduler managed-by=bicep

az deployment group create \
  --resource-group rg-fsp-scheduler-staging \
  --template-file infrastructure/main.bicep \
  --parameters environment=staging \
  --parameters fspSubscriptionKey="<YOUR_FSP_KEY>" \
  --parameters anthropicApiKey="<YOUR_ANTHROPIC_KEY>" \
  --parameters dbAdminPassword="<YOUR_DB_PASSWORD>" \
  --confirm-with-what-if
```

### production

```bash
az group create \
  --name rg-fsp-scheduler-production \
  --location eastus \
  --tags environment=production project=fsp-scheduler managed-by=bicep

az deployment group create \
  --resource-group rg-fsp-scheduler-production \
  --template-file infrastructure/main.bicep \
  --parameters environment=production \
  --parameters fspApiBaseUrl="https://production-fsp.azure-api.net" \
  --parameters fspCoreBaseUrl="https://api.flightschedulepro.com" \
  --parameters fspCurriculumBaseUrl="https://curriculum-api.flightschedulepro.com" \
  --parameters fspEnvironment="production" \
  --parameters fspSubscriptionKey="<YOUR_FSP_KEY>" \
  --parameters anthropicApiKey="<YOUR_ANTHROPIC_KEY>" \
  --parameters dbAdminPassword="<YOUR_DB_PASSWORD>" \
  --confirm-with-what-if
```

---

## Verifying deployment

```bash
# Check all queues exist with DLQ
az servicebus queue list \
  --resource-group rg-fsp-scheduler-develop \
  --namespace-name $(az servicebus namespace list -g rg-fsp-scheduler-develop --query '[0].name' -o tsv) \
  --query '[].{name:name, dlq:properties.deadLetteringOnMessageExpiration, maxDelivery:properties.maxDeliveryCount}' \
  --output table

# Verify Key Vault has soft-delete and purge protection
az keyvault show \
  --resource-group rg-fsp-scheduler-develop \
  --name $(az keyvault list -g rg-fsp-scheduler-develop --query '[0].name' -o tsv) \
  --query '{softDelete:properties.enableSoftDelete, purgeProtection:properties.enablePurgeProtection}' \
  --output table

# Check Container Apps are running
az containerapp list \
  --resource-group rg-fsp-scheduler-develop \
  --query '[].{name:name, fqdn:properties.configuration.ingress.fqdn, replicas:properties.template.scale.minReplicas}' \
  --output table

# Check managed identity role assignments on Key Vault
az role assignment list \
  --resource-group rg-fsp-scheduler-develop \
  --query '[?roleDefinitionName==`Key Vault Secrets User`].{principal:principalName, role:roleDefinitionName}' \
  --output table
```

---

## Secrets security policy

- **No secrets in templates** — all `@secure()` parameters must be passed at CLI time
- **No secrets in parameter files** — `parameters/develop.json` contains only non-sensitive values
- **Rotate secrets** by updating the Key Vault secret value; Container Apps pick up the new value on next revision
- **Key Vault purge protection** is enabled — deleted vaults cannot be purged for 90 days

---

## Module structure

```
infrastructure/
├── main.bicep                  ← Entry point, orchestrates all modules
├── appinsights.bicep           ← Log Analytics + Application Insights
├── service-bus.bicep           ← Service Bus namespace + 3 queues
├── postgresql.bicep            ← PostgreSQL Flexible Server + database
├── keyvault.bicep              ← Key Vault + all application secrets
├── container-apps.bicep        ← Container Apps environment + 3 apps
└── parameters/
    └── develop.json            ← Non-secret parameters for develop env
```
