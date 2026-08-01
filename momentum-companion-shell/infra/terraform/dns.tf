# One record per trust zone. All are single-label subdomains so the Cloudflare
# universal edge certificate covers them, and they fall under the wildcard
# origin certificate already installed on the VM.
#
# Proxied, so traffic reaches the origin from Cloudflare's ranges: the security
# list only admits 80/443 from those. ttl must be 1 for proxied records.

locals {
  records = {
    host      = var.host_subdomain
    companion = var.companion_subdomain
    backend   = var.backend_subdomain
  }
}

resource "cloudflare_record" "zone" {
  for_each = local.records

  zone_id = var.cloudflare_zone_id
  name    = "${each.value}.${var.app_domain}"
  type    = "A"
  content = var.vm_public_ip
  proxied = true
  ttl     = 1
}

output "hostnames" {
  value = { for key, subdomain in local.records : key => "https://${subdomain}.${var.app_domain}" }
}
