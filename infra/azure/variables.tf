variable "environment" {
  description = "Short environment name, e.g. dev, staging, prod."
  type        = string
  validation {
    condition     = can(regex("^[a-z]{2,8}$", var.environment))
    error_message = "Use 2-8 lowercase letters."
  }
}

variable "location" {
  description = "Primary region. UK South pairs with UK West, so geo-redundant copies stay in the UK."
  type        = string
  default     = "uksouth"
}

variable "api_image" {
  description = "Container image for the API (e.g. <registry>/magistrad-api:<git-sha>)."
  type        = string
}

variable "web_image" {
  description = "Container image for the web app."
  type        = string
}

variable "oidc_issuer" {
  description = "The managed identity provider's issuer URL (https)."
  type        = string
}

variable "public_hostname" {
  description = "The public hostname of the web app, e.g. app.magistrad.example."
  type        = string
}

variable "record_retention_days" {
  description = "Write-once retention for the court-record and audit-checkpoint containers."
  type        = number
  default     = 2555 # about 7 years; confirm against the records-management policy
}

variable "tags" {
  type    = map(string)
  default = {}
}
