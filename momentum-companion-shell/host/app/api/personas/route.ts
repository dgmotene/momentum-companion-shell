// GET /api/personas - the login options for the mock host, so the login
// screen can render every seeded role without hardcoding buttons.
import { NextResponse } from "next/server";
import { PERSONAS } from "../../../lib/personas";

export async function GET() {
  const personas = Object.entries(PERSONAS).map(([key, persona]) => ({
    key,
    label: persona.label,
    role: persona.role,
  }));
  return NextResponse.json({ personas });
}
