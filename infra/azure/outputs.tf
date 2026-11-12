output "resource_group" { value = azurerm_resource_group.main.name }
output "postgres_fqdn" { value = azurerm_postgresql_flexible_server.main.fqdn }
output "documents_account" { value = azurerm_storage_account.documents.name }
output "web_default_hostname" { value = azurerm_container_app.web.latest_revision_fqdn }
output "key_vault_uri" { value = azurerm_key_vault.main.vault_uri }
