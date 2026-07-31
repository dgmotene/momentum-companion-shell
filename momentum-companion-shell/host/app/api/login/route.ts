// POST /api/login  { email, password }
//
// The portal's front door. On success it sets the httpOnly session cookie and
// returns only what the UI needs to render a header. It does NOT return an
// identity token: the companion's token is minted separately, from the
// session, by /api/token.
//
// Note what is absent from the response: the role's capabilities, the policy
// number, anything the browser could use to grant itself something. The
// browser learns who it is looking at, and nothing about what that person may
// do. Those decisions belong to the backend.

import { NextResponse } from "next/server";
import { authenticate } from "@/lib/users";
import { KeyMissingError, startSession } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const user = authenticate(body?.email, body?.password);

  if (!user) {
    // One message for both an unknown email and a wrong password. Saying which
    // one was wrong would hand out a list of valid accounts.
    return NextResponse.json(
      { error: "That email and password combination doesn't match an account." },
      { status: 401 }
    );
  }

  try {
    await startSession(user.claims.sub);
  } catch (error) {
    if (error instanceof KeyMissingError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    throw error;
  }

  return NextResponse.json({
    user: {
      name: user.claims.name,
      role: user.claims.role,
      initials: user.initials,
    },
  });
}
