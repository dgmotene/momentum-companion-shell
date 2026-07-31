"""Model gateway client: embeddings + chat, with retry and backoff.

Two adapters behind one interface:
  * OpenAIGateway  - any OpenAI-compatible proxy (LiteLLM, Bedrock Access
                     Gateway, vLLM). Default.
  * BedrockGateway - talks to Bedrock directly via boto3, for when there is
                     no proxy in front.

Swap with RAG_GATEWAY_KIND.
"""

from __future__ import annotations

import asyncio
import logging
import random
from abc import ABC, abstractmethod

import httpx

from .config import Settings

log = logging.getLogger(__name__)

RETRY_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}


class GatewayError(RuntimeError):
    pass


async def _with_backoff(fn, *, max_retries: int, what: str):
    """Exponential backoff with full jitter. Embedding a 454-page guide will
    hit rate limits; this is the only thing standing between us and a
    half-ingested corpus."""
    delay = 0.5
    last: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return await fn()
        except Exception as exc:  # noqa: BLE001 - re-raised below
            retryable = isinstance(exc, (httpx.TimeoutException, httpx.NetworkError))
            if isinstance(exc, httpx.HTTPStatusError):
                retryable = exc.response.status_code in RETRY_STATUS
            if not retryable or attempt == max_retries:
                raise
            last = exc
            sleep = random.uniform(0, min(delay, 20.0))
            log.warning(
                "%s failed (attempt %d/%d): %s - retrying in %.1fs",
                what, attempt + 1, max_retries, exc, sleep,
            )
            await asyncio.sleep(sleep)
            delay *= 2
    raise GatewayError(f"{what} exhausted retries") from last


class Gateway(ABC):
    def __init__(self, settings: Settings):
        self.s = settings

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]: ...

    @abstractmethod
    async def chat(self, system: str, user: str) -> str: ...

    async def aclose(self) -> None:
        return None


class OpenAIGateway(Gateway):
    def __init__(self, settings: Settings):
        super().__init__(settings)
        headers = {"Content-Type": "application/json"}
        # Momentum's gateway authenticates on the virtual key header, not a
        # bearer token. Both are sent when configured so this also works
        # against a stock OpenAI-compatible proxy.
        if settings.gateway_virtual_key:
            headers["x-bf-vk"] = settings.gateway_virtual_key
        if settings.gateway_app_id:
            headers["x-git"] = settings.gateway_app_id
        if settings.gateway_api_key:
            headers["Authorization"] = f"Bearer {settings.gateway_api_key}"
        self._client = httpx.AsyncClient(
            base_url=settings.gateway_base_url.rstrip("/"),
            headers=headers,
            timeout=settings.gateway_timeout_s,
        )

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        payload: dict = {
            "model": self.s.embed_model,
            "input": texts,
            "encoding_format": "float",
        }
        if self.s.embed_send_dimensions:
            payload["dimensions"] = self.s.embed_dim

        async def call():
            r = await self._client.post("/embeddings", json=payload)
            r.raise_for_status()
            return r.json()

        data = await _with_backoff(
            call, max_retries=self.s.gateway_max_retries, what="embed"
        )
        rows = sorted(data["data"], key=lambda d: d.get("index", 0))
        vectors = [row["embedding"] for row in rows]
        if len(vectors) != len(texts):
            raise GatewayError(
                f"embedding count mismatch: sent {len(texts)}, got {len(vectors)}"
            )
        return vectors

    async def chat(self, system: str, user: str) -> str:
        async def call():
            r = await self._client.post(
                "/chat/completions",
                json={
                    "model": self.s.chat_model,
                    "max_tokens": self.s.chat_max_tokens,
                    "temperature": self.s.chat_temperature,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                },
            )
            r.raise_for_status()
            return r.json()

        data = await _with_backoff(
            call, max_retries=self.s.gateway_max_retries, what="chat"
        )
        return data["choices"][0]["message"]["content"].strip()


class BedrockGateway(Gateway):
    """Direct Bedrock. Titan v2 takes one input string per call, so batches
    are fanned out with bounded concurrency rather than sent as an array."""

    def __init__(self, settings: Settings):
        super().__init__(settings)
        import boto3  # imported lazily so boto3 stays an optional dep

        self._rt = boto3.client("bedrock-runtime", region_name=settings.aws_region)
        self._sem = asyncio.Semaphore(settings.embed_concurrency)

    async def _invoke(self, model_id: str, body: dict) -> dict:
        import json

        def sync_call():
            resp = self._rt.invoke_model(modelId=model_id, body=json.dumps(body))
            return json.loads(resp["body"].read())

        async def call():
            return await asyncio.to_thread(sync_call)

        return await _with_backoff(
            call, max_retries=self.s.gateway_max_retries, what=f"bedrock:{model_id}"
        )

    async def embed(self, texts: list[str]) -> list[list[float]]:
        async def one(text: str) -> list[float]:
            async with self._sem:
                data = await self._invoke(
                    self.s.embed_model,
                    {"inputText": text, "dimensions": self.s.embed_dim,
                     "normalize": True},
                )
                return data["embedding"]

        return list(await asyncio.gather(*(one(t) for t in texts)))

    async def chat(self, system: str, user: str) -> str:
        data = await self._invoke(
            self.s.chat_model,
            {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": self.s.chat_max_tokens,
                "temperature": self.s.chat_temperature,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
        )
        return data["content"][0]["text"].strip()


def build_gateway(settings: Settings) -> Gateway:
    if settings.gateway_kind == "bedrock":
        return BedrockGateway(settings)
    return OpenAIGateway(settings)
