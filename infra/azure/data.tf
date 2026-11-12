# ── PostgreSQL: private only, 35-day point-in-time recovery, backups copied to UK West ──
resource "random_password" "postgres_admin" {
  length  = 40
  special = false
}

resource "azurerm_key_vault_secret" "postgres_admin" {
  name         = "postgres-admin-password"
  value        = random_password.postgres_admin.result
  key_vault_id = azurerm_key_vault.main.id
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                          = "psql-${local.name}"
  location                      = azurerm_resource_group.main.location
  resource_group_name           = azurerm_resource_group.main.name
  version                       = "16"
  sku_name                      = "GP_Standard_D2ds_v5"
  storage_mb                    = 131072
  backup_retention_days         = 35
  geo_redundant_backup_enabled  = true
  delegated_subnet_id           = azurerm_subnet.postgres.id
  private_dns_zone_id           = azurerm_private_dns_zone.postgres.id
  public_network_access_enabled = false
  administrator_login           = "magistrad_admin"
  administrator_password        = random_password.postgres_admin.result
  zone                          = "1"
  high_availability {
    mode                      = "ZoneRedundant"
    standby_availability_zone = "2"
  }
  tags       = local.tags
  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres]
}

resource "azurerm_postgresql_flexible_server_configuration" "extensions" {
  name      = "azure.extensions"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "PGCRYPTO"
}

resource "azurerm_postgresql_flexible_server_configuration" "tls" {
  name      = "ssl_min_protocol_version"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "TLSv1.2"
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = "magistrad"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_GB.utf8"
}

# ── Document storage: private, geo-redundant to UK West, encrypted with our key ──
resource "azurerm_storage_account" "documents" {
  name                              = "st${local.compact}docs"
  location                          = azurerm_resource_group.main.location
  resource_group_name               = azurerm_resource_group.main.name
  account_tier                      = "Standard"
  account_replication_type          = "GRS"
  account_kind                      = "StorageV2"
  min_tls_version                   = "TLS1_2"
  https_traffic_only_enabled        = true
  shared_access_key_enabled         = false # identity-based access only
  allow_nested_items_to_be_public   = false
  public_network_access_enabled     = false
  infrastructure_encryption_enabled = true
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api.id]
  }
  customer_managed_key {
    key_vault_key_id          = azurerm_key_vault_key.storage.versionless_id
    user_assigned_identity_id = azurerm_user_assigned_identity.api.id
  }
  blob_properties {
    versioning_enabled  = true
    change_feed_enabled = true
    delete_retention_policy { days = 30 }
    container_delete_retention_policy { days = 30 }
  }
  tags       = local.tags
  depends_on = [azurerm_role_assignment.api_key_crypto]
}

# One container per space kind (ARCHITECTURE: storage mirrors the separation).
locals {
  containers = {
    quarantine        = { immutable = false } # uploads land here until the malware scan passes
    private           = { immutable = false } # each side's private workspace, keyed by case and space
    shared            = { immutable = false } # served documents
    record            = { immutable = true }  # court record mirror: write-once
    audit-checkpoints = { immutable = true }  # anchors for the audit chain
  }
}

resource "azurerm_storage_container" "spaces" {
  for_each              = local.containers
  name                  = each.key
  storage_account_id    = azurerm_storage_account.documents.id
  container_access_type = "private"
}

resource "azurerm_storage_container_immutability_policy" "worm" {
  for_each                              = { for k, v in local.containers : k => v if v.immutable }
  storage_container_resource_manager_id = azurerm_storage_container.spaces[each.key].id
  immutability_period_in_days           = var.record_retention_days
  protected_append_writes_all_enabled   = false
  # Left unlocked until the retention period is approved; locking is irreversible.
  locked = false
}

resource "azurerm_private_endpoint" "blob" {
  name                = "pe-${local.name}-blob"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.endpoints.id
  private_service_connection {
    name                           = "blob"
    private_connection_resource_id = azurerm_storage_account.documents.id
    subresource_names              = ["blob"]
    is_manual_connection           = false
  }
  private_dns_zone_group {
    name                 = "blob"
    private_dns_zone_ids = [azurerm_private_dns_zone.blob.id]
  }
  tags = local.tags
}

resource "azurerm_role_assignment" "api_key_crypto" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Crypto Service Encryption User"
  principal_id         = azurerm_user_assigned_identity.api.principal_id
}

resource "azurerm_role_assignment" "api_blob" {
  scope                = azurerm_storage_account.documents.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.api.principal_id
}

resource "azurerm_role_assignment" "api_secrets" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.api.principal_id
}
