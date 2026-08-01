"use client";

// The companion's only outbound path.
//
// Every call carries the raw identity token and goes to the companion backend.
// The frontend never calls the AI Gateway: a credential in the browser can be
// read by anyone who opens dev tools, and a direct line to the model would
// bypass the role checks that only the backend enforces.
//
// Fixtures are opt-in and off by default. They exist for demoing the UI with
// no backend, and they must never stand in for a real failure: an expired
// token answered from fixtures would show invented policy content at exactly
// the moment the product should say "your session ended". A refusal replaced
// by a helpful-looking answer is the one failure that would discredit
// everything else here, so a failure is reported as a failure.

import {
  API,
  type ChatRequest,
  type ChatResponse,
  type IdentityClaims,
} from "@shared/contract";
import { mockChat } from "./mock-journeys";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_COMPANION_BACKEND_URL ?? "http://localhost:4000";

export interface VerifyResult {
  verified: boolean;
  /** Claims as the BACKEND read them, after checking the signature. */
  claims?: Record<string, unknown>;
  error?: string;
  /** True when the backend could not be reached at all. */
  offline?: boolean;
}

/**
 * Ask the backend to verify the token.
 *
 * The companion already decoded the token locally to decide what to draw, but
 * that decode proves nothing. This call is what establishes that the token is
 * genuinely signed by the host, unexpired, and addressed to this backend.
 */
export async function verifyToken(token: string): Promise<VerifyResult> {
  try {
    const res = await fetch(`${BACKEND_URL}${API.VERIFY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = (await res.json()) as VerifyResult;
    if (!res.ok) {
      return { verified: false, error: body?.error ?? `HTTP ${res.status}` };
    }
    return body;
  } catch {
    return {
      verified: false,
      offline: true,
      error: `Could not reach the companion backend at ${BACKEND_URL}.`,
    };
  }
}

export interface ChatResult {
  response: ChatResponse;
  /** True when the reply came from fixtures rather than the real backend. */
  mocked: boolean;
}

/** Fixtures only when someone deliberately asked for them. */
const USE_FIXTURES = process.env.NEXT_PUBLIC_COMPANION_FIXTURES === "true";

function failure(text: string, sessionId: string | null): ChatResponse {
  return {
    session_id: sessionId ?? "",
    outcome: "error",
    blocks: [{ kind: "text", text }],
    citations: [],
  };
}

function isChatResponse(body: unknown): body is ChatResponse {
  return (
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as ChatResponse).blocks) &&
    typeof (body as ChatResponse).outcome === "string"
  );
}

export async function sendChat(
  token: string,
  request: ChatRequest,
  claims: IdentityClaims
): Promise<ChatResult> {
  try {
    const res = await fetch(`${BACKEND_URL}${API.CHAT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The token travels as a bearer credential, so the backend re-verifies
        // it on this request and not just at handshake. Authorization is never
        // inherited from an earlier call.
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });

    const body: unknown = await res.json().catch(() => null);

    // The backend answers refusals in this shape too, so a refusal reaches the
    // user as a refusal.
    if (isChatResponse(body)) {
      return { response: body, mocked: false };
    }

    if (USE_FIXTURES) {
      return { response: mockChat(request, claims), mocked: true };
    }

    const sessionId = request.session_id ?? null;
    if (res.status === 401) {
      return {
        response: failure(
          "Your session with the portal has ended. Refresh the page to sign in again and I'll pick up where we left off.",
          sessionId
        ),
        mocked: false,
      };
    }
    const detail =
      typeof (body as { message?: unknown })?.message === "string"
        ? (body as { message: string }).message
        : "Something went wrong on our side. Please try again, or ask me to connect you with a person.";
    return { response: failure(detail, sessionId), mocked: false };
  } catch {
    if (USE_FIXTURES) {
      return { response: mockChat(request, claims), mocked: true };
    }
    return {
      response: failure(
        "I can't reach Momentum's systems from here at the moment. Please try again in a moment.",
        request.session_id ?? null
      ),
      mocked: false,
    };
  }
}
