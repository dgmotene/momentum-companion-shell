variable "cloudflare_zone_id" {}
variable "cloudflare_api_token" { sensitive = true }

variable "app_domain" {}

# Public IP of the reused VM. Not derived from a resource here, since this
# configuration does not own the instance.
variable "vm_public_ip" {}

variable "host_subdomain" { default = "lumina" }
variable "companion_subdomain" { default = "companion" }
variable "backend_subdomain" { default = "api-lumina" }
