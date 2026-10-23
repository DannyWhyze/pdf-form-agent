import logging
from typing import Any

import httpx
from langchain_ollama import ChatOllama

from src.config import settings

logger = logging.getLogger(__name__)

# Known embedding model families and keyword patterns to filter out from chat model selection
_EMBEDDING_FAMILIES = {
    "nomic-bert",
    "bert",
    "clip",
    "colbert",
}

_EMBEDDING_KEYWORDS = (
    "embed",
    "embedding",
    "bge-",
    "bge_",
    "gte-",
    "gte_",
    "minilm",
)


def is_embedding_model(model_data: dict[str, Any]) -> bool:
    """
    Determines whether an Ollama model object is an embedding-only model.
    Checks model name keywords and architecture family.
    """
    name = str(model_data.get("name", "")).lower()
    details = model_data.get("details") or {}
    family = str(details.get("family", "")).lower()
    families = [str(f).lower() for f in (details.get("families") or [])]

    if any(keyword in name for keyword in _EMBEDDING_KEYWORDS):
        return True

    if family in _EMBEDDING_FAMILIES:
        return True

    if any(f in _EMBEDDING_FAMILIES for f in families):
        return True

    return False


async def fetch_ollama_chat_models(base_url: str | None = None) -> list[dict[str, Any]]:
    """
    Queries local Ollama /api/tags endpoint and returns filtered chat/generation models.
    Excludes embedding models (e.g. nomic-embed-text, bge, bert family).
    Returns fallback with settings.MODEL_NAME if Ollama is unreachable.
    """
    url = f"{(base_url or settings.OLLAMA_BASE_URL).rstrip('/')}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(url)
            if response.status_code == 200:
                data = response.json()
                raw_models = data.get("models", [])
                chat_models = []
                for m in raw_models:
                    if is_embedding_model(m):
                        continue
                    name = m.get("name", "")
                    details = m.get("details") or {}
                    chat_models.append(
                        {
                            "name": name,
                            "display_name": name,
                            "size": m.get("size", 0),
                            "parameter_size": str(details.get("parameter_size", "")),
                            "family": str(details.get("family", "")),
                            "is_current": name == settings.MODEL_NAME,
                        }
                    )
                if chat_models:
                    return chat_models
    except Exception as e:
        logger.warning(f"Failed to fetch models from Ollama at {url}: {e}")

    # Fallback to configured default model
    return [
        {
            "name": settings.MODEL_NAME,
            "display_name": settings.MODEL_NAME,
            "size": 0,
            "parameter_size": "",
            "family": "default",
            "is_current": True,
        }
    ]


def create_chat_model(
    model_name: str | None = None,
    temperature: float = 0.0,
    num_ctx: int | None = None,
    think_enabled: bool = False,
    **kwargs: Any,
) -> ChatOllama:
    """
    Central factory creating the appropriate LangChain ChatOllama instance for local execution.
    """
    target_model = (
        model_name if model_name and model_name != "default" else settings.MODEL_NAME
    )
    target_num_ctx = num_ctx if num_ctx is not None else settings.NUM_CTX
    logger.info(
        f"Instantiating ChatOllama for model: {target_model} (num_ctx={target_num_ctx})"
    )
    return ChatOllama(
        model=target_model,
        reasoning=think_enabled,
        num_ctx=target_num_ctx,
        temperature=temperature,
    )
