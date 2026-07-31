// GET /api/me - who is signed in, for rehydrating the page after a reload.
//
// The session lives in an httpOnly cookie, which client JavaScript cannot
// read. So on a refresh the portal has to ask the server who it is rendering
// for. Without this, a reload would look like a logout.
//
// Returns the claims the portal needs to draw itself. The companion does not
// use this: it gets its claims from the verified token, and the backend
// re-verifies on every request regardless.

import { NextResponse } from "next/server";
import { findUserBySub } from "@/lib/users";
import { readSession } from "@/lib/session";

export async function GET() {
  const sub = await readSession();
  if (!sub) return NextResponse.json({ user: null });

  const user = findUserBySub(sub);
  if (!user) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: {
      sub: user.claims.sub,
      name: user.claims.name,
      role: user.claims.role,
      policy_id: user.claims.policy_id,
      deceased_flag: user.claims.deceased_flag,
      scope: user.claims.scope,
      initials: user.initials,
    },
  });
}
