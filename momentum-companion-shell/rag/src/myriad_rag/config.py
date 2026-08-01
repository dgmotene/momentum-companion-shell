"""Configuration.

The chunking and retrieval knobs are deliberately grouped and marked FROZEN.
After the Sprint 0 spike they should not change without a planned re-ingestion,
because changing any of them invalidates every stored embedding.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_prefix="RAG_", extra="ignore"
    )

    # --- service ---------------------------------------------------------
    host: str = "0.0.0.0"
    port: int = 8080
    log_level: str = "INFO"
    # Shared secret the calling system sends as `X-API-Key`. Comma-separated
    # to allow rotation without downtime.
    api_keys: str = ""

    # --- postgres --------------------------------------------------------
    database_url: str = "postgresql://localhost:5432/myriad"
    db_pool_min: int = 1
    db_pool_max: int = 8

    # --- model gateway ---------------------------------------------------
    gateway_kind: Literal["openai", "bedrock"] = "openai"
    # Momentum AI Gateway (Bifrost). Note: no /v1 suffix - the OpenAI-style
    # paths hang directly off /openai.
    gateway_base_url: str = "https://riskbifrostent.momentum.co.za/openai"
    # Team virtual key, sent as x-bf-vk. Starts with sk-bf-
    gateway_virtual_key: str = ""
    # Sent as x-git; identifies the calling app to the gateway.
    gateway_app_id: str = "risk-ai-api"
    # Only used if the gateway also wants a bearer token; usually blank.
    gateway_api_key: str = ""
    gateway_timeout_s: float = 60.0
    gateway_max_retries: int = 5
    # Concurrent in-flight embedding requests during ingest.
    embed_concurrency: int = 4
    # Bifrost returns ONE vector per request regardless of array size, so a
    # batch must stay a single chunk.
    embed_batch_size: int = 1

    aws_region: str = "us-east-1"  # bedrock only

    # --- FROZEN: changing these requires a full re-ingest -----------------
    embed_model: str = "bedrock/amazon.titan-embed-text-v2:0"
    embed_dim: int = 1024
    # Titan v2 supports 256/512/1024, but the gateway may not forward the
    # `dimensions` parameter. Leave False and let the ingest verify what the
    # gateway actually returns.
    embed_send_dimensions: bool = False
    chunk_tokens: int = 400
    chunk_overlap: int = 60
    top_k: int = 6  # spec says 5-8
    # Chunks scoring below this cosine similarity are dropped before the
    # prompt is built. Better an honest "I don't know" than a padded prompt.
    # Titan v2 scores run low: correct hits land ~0.28-0.35, so 0.35 drops them.
    min_similarity: float = 0.25

    # --- generation ------------------------------------------------------
    chat_model: str = "bedrock/anthropic.claude-3-haiku-20240307-v1:0"
    chat_max_tokens: int = 1024
    chat_temperature: float = 0.0

    # --- ingest ----------------------------------------------------------
    # printed page = pdf page - page_offset
    page_offset: int = 1
    # A line must appear on at least this fraction of pages, in the top or
    # bottom band, to be treated as a running header/footer and stripped.
    boilerplate_threshold: float = 0.5

    @property
    def api_key_set(self) -> set[str]:
        return {k.strip() for k in self.api_keys.split(",") if k.strip()}

    def retrieval_fingerprint(self) -> dict:
        """Everything a stored embedding depends on."""
        return {
            "embed_model": self.embed_model,
            "embed_dim": self.embed_dim,
            "chunk_tokens": self.chunk_tokens,
            "chunk_overlap": self.chunk_overlap,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
