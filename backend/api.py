"""
Smart Document Q&A System — FastAPI Backend
============================================
Full-stack RAG application with:
- JWT authentication (email/password)
- Per-user document isolation (Supabase Row Level Security)
- Sentence-Window + Hybrid BM25/pgvector RAG pipeline
- OpenRouter free LLM for generation
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional, List

import uvicorn
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from schemas import (
    RegisterRequest, LoginRequest, TokenResponse, UserResponse,
    DocumentResponse, DocumentListResponse,
    QuestionRequest, AnswerResponse, SourceCitation, UploadResponse,
)
from auth import create_access_token, verify_password, get_current_user
import database as db
import rag_engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {"pdf", "txt", "text"}
MAX_FILE_SIZE_MB = 20  # 20 MB limit


# ── App lifespan ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm up embedding model at startup."""
    logger.info("Warming up embedding model...")
    try:
        rag_engine.get_embedding_model()
        logger.info("Embedding model loaded successfully.")
    except Exception as e:
        logger.error(f"Failed to load embedding model: {e}")
    yield
    logger.info("Shutting down.")


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="DocKnowledge Q&A API",
    description="Smart Document Q&A System with RAG",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.APP_NAME}


# ── Auth endpoints ────────────────────────────────────────────────────────────

@app.post("/auth/register", response_model=TokenResponse, status_code=201)
async def register(payload: RegisterRequest):
    """Register a new user with email/password."""
    if len(payload.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    try:
        user = db.create_user(payload.email, payload.password, payload.name)
    except ValueError as e:
        raise HTTPException(409, str(e))
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(500, "Registration failed. Please try again.")

    token = create_access_token({"sub": user["id"], "email": user["email"]})
    return TokenResponse(
        access_token=token,
        user_id=user["id"],
        email=user["email"],
        name=user.get("name"),
    )


@app.post("/auth/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    """Authenticate and return a JWT token."""
    user = db.get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    token = create_access_token({"sub": user["id"], "email": user["email"]})
    return TokenResponse(
        access_token=token,
        user_id=user["id"],
        email=user["email"],
        name=user.get("name"),
    )


@app.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Return the current authenticated user's info."""
    user = db.get_user_by_id(current_user["sub"])
    if not user:
        raise HTTPException(404, "User not found")
    return UserResponse(**user)


# ── Document endpoints ────────────────────────────────────────────────────────

@app.post("/documents/upload", response_model=UploadResponse, status_code=202)
async def upload_document(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload a PDF or text document.
    Processing (chunking + embedding) happens asynchronously.
    """
    # Validate file type
    filename = file.filename or "document"
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type '.{ext}'. Allowed: pdf, txt")

    # Read file bytes
    file_bytes = await file.read()
    file_size = len(file_bytes)

    if file_size == 0:
        raise HTTPException(400, "File is empty")
    if file_size > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large. Max size: {MAX_FILE_SIZE_MB}MB")

    # Create DB record (status=processing)
    user_id = current_user["sub"]
    doc = db.create_document(user_id, filename, file_size)
    doc_id = doc["id"]

    # Process asynchronously (fire and forget)
    asyncio.create_task(process_document_background(file_bytes, filename, doc_id, user_id))

    return UploadResponse(
        document_id=doc_id,
        filename=filename,
        status="processing",
        message="Document uploaded. Processing will complete in a few seconds.",
    )


async def process_document_background(
    file_bytes: bytes, filename: str, doc_id: str, user_id: str
):
    """Background task: ingest document and update status."""
    try:
        chunk_count = await rag_engine.ingest_document(file_bytes, filename, doc_id, user_id)
        db.update_document_status(doc_id, "ready")
        logger.info(f"Document {doc_id} ready with {chunk_count} chunks.")
    except Exception as e:
        logger.error(f"Document processing failed for {doc_id}: {e}")
        db.update_document_status(doc_id, "error")


@app.get("/documents/", response_model=DocumentListResponse)
async def list_documents(current_user: dict = Depends(get_current_user)):
    """List all documents belonging to the current user."""
    user_id = current_user["sub"]
    docs = db.get_documents_by_user(user_id)
    return DocumentListResponse(
        documents=[DocumentResponse(**d) for d in docs],
        total=len(docs),
    )


@app.get("/documents/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single document's details (including processing status)."""
    user_id = current_user["sub"]
    doc = db.get_document(doc_id, user_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    return DocumentResponse(**doc)


@app.delete("/documents/{doc_id}", status_code=204)
async def delete_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a document and all its chunks. Only the owner can delete."""
    user_id = current_user["sub"]
    success = db.delete_document(doc_id, user_id)
    if not success:
        raise HTTPException(404, "Document not found")


# ── Q&A endpoints ─────────────────────────────────────────────────────────────

@app.post("/ask", response_model=AnswerResponse)
async def ask_question(
    payload: QuestionRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Ask a question against the user's documents.
    Optionally filter to specific document_ids.
    Uses hybrid BM25 + vector search with sentence-window context.
    """
    user_id = current_user["sub"]

    if not payload.question.strip():
        raise HTTPException(400, "Question cannot be empty")

    # Validate document_ids belong to this user
    if payload.document_ids:
        for doc_id in payload.document_ids:
            doc = db.get_document(doc_id, user_id)
            if not doc:
                raise HTTPException(404, f"Document {doc_id} not found")
            if doc["status"] != "ready":
                raise HTTPException(422, f"Document '{doc['filename']}' is still processing. Please wait.")

    try:
        result = rag_engine.answer_question(
            user_id=user_id,
            question=payload.question,
            document_ids=payload.document_ids,
        )
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    except Exception as e:
        logger.error(f"Q&A error: {e}")
        raise HTTPException(500, "Failed to process question")

    return AnswerResponse(
        answer=result["answer"],
        sources=[SourceCitation(**s) for s in result["sources"]],
        status=result["status"],
    )


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("api:app", host="0.0.0.0", port=port, reload=False)
