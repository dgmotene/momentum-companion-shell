// List of origins we trust to send us the identity token.
// Set NEXT_PUBLIC_HOST_ORIGIN in .env to change this without editing code.
export const ALLOWED_PARENT_ORIGINS: readonly string[] = [
  process.env.NEXT_PUBLIC_HOST_ORIGIN ?? "http://localhost:3000",
];
