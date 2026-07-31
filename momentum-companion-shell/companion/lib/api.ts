"use client";

// The companion's only outbound path.
//
// Every call carries the raw identity token and goes to the companion backend.
// The frontend never calls the AI Gateway: a credential in the browser can be
// read by anyone who opens dev tools, and a direct line to the model would
// bypass the role checks that only the backend enforces.
//
// Mock fallback: while the orchestrator is still being built, /api/chat
// answers with a `stub` marker. Rather than showing a broken UI, we detect
// that and answer from fixtures, flagged clearly as fixtures so nobody
// mistakes a demo reply for a grounded one. The moment the real route starts
// returning a ChatResponse, this file stops falling back with no change
// anywhere else.

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

function looksLikeStub(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { stub?: unknown }).stub === true
  );
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

    if (isChatResponse(body)) {
      return { response: body, mocked: false };
    }

    // Not implemented yet, or an error shape we do not recognise.
    if (looksLikeStub(body) || !res.ok) {
      return { response: mockChat(request, claims), mocked: true };
    }

    return { response: mockChat(request, claims), mocked: true };
  } catch {
    return { response: mockChat(request, claims), mocked: true };
  }
}
