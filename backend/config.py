import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # LLM Provider: "gemini" (default) or "openrouter"
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "gemini")

    # Google Gemini (default provider — free tier available)
    GEMINI_API_KEY: str = os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

    # OpenRouter LLM (fallback provider)
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL: str = os.getenv(
        "OPENROUTER_MODEL", "meta-llama/llama-3.1-8b-instruct:free"
    )
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    # JWT
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super-secret-change-me-in-production")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24h

    # Embedding model (local sentence-transformers)
    EMBEDDING_MODEL: str = os.getenv(
        "EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
    )
    EMBEDDING_DIM: int = 384

    # RAG settings
    CHUNK_SIZE: int = 256       # tokens per sentence window chunk
    SENTENCE_WINDOW: int = 2    # sentences to expand context on each side
    TOP_K_VECTOR: int = 5       # results to fetch from vector search
    TOP_K_BM25: int = 5         # results to fetch from BM25
    TOP_K_FINAL: int = 4        # results after RRF fusion

    # App
    APP_NAME: str = "DocKnowledge Q&A"
    CORS_ORIGINS: list = [
        x for x in [
            "http://localhost:3000",
            "https://localhost:3000",
            os.getenv("FRONTEND_URL", ""),
        ] if x  # filter out empty strings
    ]


settings = Settings()
