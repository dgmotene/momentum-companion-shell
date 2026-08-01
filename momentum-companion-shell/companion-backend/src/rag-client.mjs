// Server-only client for the standalone Python RAG service. The browser never
// receives RAG_SERVICE_API_KEY; it talks only to this authenticated backend.

import dotenv from "dotenv";

dotenv.config({ path: new URL("../../.env", import.meta.url) });

export class RagServiceError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function askGuide(question) {
  const serviceUrl = (process.env.RAG_SERVICE_URL ?? "http://localhost:8080").replace(
    /\/$/,
    ""
  );
  const apiKey = process.env.RAG_SERVICE_API_KEY;
  const timeoutMs = Number(process.env.RAG_TIMEOUT_MS ?? 30_000);

  if (!apiKey) {
    throw new RagServiceError("RAG service is not configured", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${serviceUrl}/v1/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ question }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new RagServiceError(
        payload?.detail ?? payload?.error ?? `RAG service returned HTTP ${response.status}`,
        response.status >= 500 ? 503 : 502
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof RagServiceError) throw error;
    const message = error.name === "AbortError" ? "RAG service timed out" : "RAG service is unavailable";
    throw new RagServiceError(message, 503);
  } finally {
    clearTimeout(timeout);
  }
}
