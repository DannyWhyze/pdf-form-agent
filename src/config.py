from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DATA_DIR = PROJECT_ROOT / "data" / "session_docs"
DATA_DIR.mkdir(parents=True, exist_ok=True)
SESSIONS_DIR = DATA_DIR / "sessions"
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
CONVERSATION_HISTORY_DIR = PROJECT_ROOT / "data" / "conversation_history"
CONVERSATION_HISTORY_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseSettings):
    PROJECT_NAME: str = "PDF Form Agent"
    API_V1_STR: str = "/api/v1"

    # Model setting (Ollama)
    MODEL_NAME: str = "gemma4:e4b"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    NUM_CTX: int = 16384  # Context window size in tokens (16k)

    # Summarization Middleware settings (LangChain 1.4+)
    ENABLE_SUMMARIZATION: bool = True
    SUMMARIZATION_TRIGGER_TOKENS: int = 8000
    SUMMARIZATION_TRIGGER_MESSAGES: int = 20
    SUMMARIZATION_KEEP_MESSAGES: int = 6
    SUMMARIZATION_TRIM_TOKENS: int = 4000
    SUMMARIZATION_OFFLOAD_TO_FILE: bool = False

    # STT Microservice setting
    STT_HOST: str = "127.0.0.1"
    STT_PORT: int = 8002

    # TTS Microservice setting (Qwen3-TTS WebSocket Server)
    TTS_HOST: str = "127.0.0.1"
    TTS_PORT: int = 8005

    # CORS Whitelist (protection against localhost cross-origin drive-by attacks)
    CORS_ORIGINS: list[str] = [
        "http://localhost:8001",
        "http://127.0.0.1:8001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
        extra="ignore",
    )

settings = Settings()
