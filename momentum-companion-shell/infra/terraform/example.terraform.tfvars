# Copy to terraform.tfvars and fill in. terraform.tfvars is gitignored.

cloudflare_zone_id   = "xxxx"        # dashboard -> domain -> Overview
cloudflare_api_token = "xxxx"        # scoped Zone:DNS:Edit on this zone
app_domain           = "example.com"
vm_public_ip         = "x.x.x.x"

# Optional overrides (defaults in variables.tf):
# host_subdomain      = "lumina"
# companion_subdomain = "companion"
# backend_subdomain   = "api-lumina"
