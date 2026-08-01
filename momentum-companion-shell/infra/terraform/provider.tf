# DNS only. The VM, VCN and security list belong to a separate infrastructure
# repo; this deployment reuses that box rather than provisioning its own, so
# there are no OCI resources here.
terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
