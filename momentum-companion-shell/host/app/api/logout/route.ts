// POST /api/logout - clears the portal session.
//
// After this, /api/token refuses, so the companion cannot renew. Any identity
// token already in the companion's memory keeps working until it expires,
// which is at most 15 minutes and is exactly why that life is short. The
// browser side also clears its copy immediately on sign-out.

import { NextResponse } from "next/server";
import { endSession } from "@/lib/session";

export async function POST() {
  endSession();
  return NextResponse.json({ ok: true });
}
