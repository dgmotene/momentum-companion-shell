// Root route.
//
// Reads the session server-side and sends the user where they belong, so a
// refresh on "/" does not look like a logout. Signed out, it renders the login
// screen in place rather than redirecting, which keeps "/" a valid landing URL.

import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import LoginPage from "./login/page";

export default async function HomePage() {
  let sub: string | null = null;
  try {
    sub = await readSession();
  } catch {
    // Keys missing (npm run setup not run yet). Fall through to the login
    // screen, which surfaces the real error when someone tries to sign in.
    sub = null;
  }

  if (sub) redirect("/dashboard");
  return <LoginPage />;
}
