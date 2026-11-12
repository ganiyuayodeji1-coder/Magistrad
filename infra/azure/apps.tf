# ── Container Apps: web (public ingress) and API (internal only) ───────
resource "azurerm_container_app_environment" "main" {
  name                           = "cae-${local.name}"
  location                       = azurerm_resource_group.main.location
  resource_group_name            = azurerm_resource_group.main.name
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.main.id
  infrastructure_subnet_id       = azurerm_subnet.apps.id
  internal_load_balancer_enabled = false
  tags                           = local.tags
}

resource "azurerm_container_app" "api" {
  name                         = "ca-${local.name}-api"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api.id]
  }
  ingress {
    external_enabled = false # reachable only from inside the environment (the web app)
    target_port      = 4000
    transport        = "http"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
  secret {
    name                = "database-url"
    key_vault_secret_id = azurerm_key_vault_secret.database_url_placeholder.versionless_id
    identity            = azurerm_user_assigned_identity.api.id
  }
  secret {
    name                = "oidc-client-secret"
    key_vault_secret_id = "${azurerm_key_vault.main.vault_uri}secrets/oidc-client-secret"
    identity            = azurerm_user_assigned_identity.api.id
  }
  template {
    min_replicas = 2
    max_replicas = 6
    container {
      name   = "api"
      image  = var.api_image
      cpu    = 0.5
      memory = "1Gi"
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name  = "API_PUBLIC_URL"
        value = "https://${var.public_hostname}/api"
      }
      env {
        name  = "WEB_ORIGIN"
        value = "https://${var.public_hostname}"
      }
      env {
        name  = "OIDC_ISSUER"
        value = var.oidc_issuer
      }
      env {
        name  = "OIDC_CLIENT_ID"
        value = "magistrad-${var.environment}"
      }
      env {
        name        = "OIDC_CLIENT_SECRET"
        secret_name = "oidc-client-secret"
      }
      env {
        name  = "TRUST_PROXY_HOPS"
        value = "2"
      }
      liveness_probe {
        transport = "HTTP"
        port      = 4000
        path      = "/health"
      }
    }
  }
  tags = local.tags
}

# The application connection string (magistrad_app role) is written by the deployment
# pipeline after `pnpm db:bootstrap`; this placeholder only reserves the secret name.
resource "azurerm_key_vault_secret" "database_url_placeholder" {
  name         = "database-url"
  value        = "set-by-deployment-pipeline"
  key_vault_id = azurerm_key_vault.main.id
  lifecycle { ignore_changes = [value] }
}

resource "azurerm_container_app" "web" {
  name                         = "ca-${local.name}-web"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  ingress {
    external_enabled = true
    target_port      = 3000
    transport        = "http"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
  template {
    min_replicas = 2
    max_replicas = 6
    container {
      name   = "web"
      image  = var.web_image
      cpu    = 0.5
      memory = "1Gi"
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "API_INTERNAL_URL"
        value = "http://${azurerm_container_app.api.name}"
      }
      env {
        name  = "WEB_ORIGIN"
        value = "https://${var.public_hostname}"
      }
    }
  }
  tags = local.tags
}
