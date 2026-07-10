/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Serve the JWKS at the standard OIDC discovery path.
    return [{ source: "/.well-known/jwks.json", destination: "/api/jwks" }];
  },
};
export default nextConfig;
