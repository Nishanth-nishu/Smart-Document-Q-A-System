from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    name: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    created_at: Optional[str] = None


# ── Documents ─────────────────────────────────────────────────────────────────

class DocumentResponse(BaseModel):
    id: str
    filename: str
    file_size: Optional[int] = None
    status: str  # processing | ready | error
    chunk_count: Optional[int] = 0
    created_at: Optional[str] = None


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int


# ── Q&A ───────────────────────────────────────────────────────────────────────

class QuestionRequest(BaseModel):
    question: str
    document_ids: Optional[List[str]] = None  # None = search all user docs


class SourceCitation(BaseModel):
    document_id: str
    filename: str
    page_number: Optional[int] = None
    chunk_text: str
    relevance_score: Optional[float] = None


class AnswerResponse(BaseModel):
    answer: str
    sources: List[SourceCitation]
    status: str = "success"
    error: Optional[str] = None


# ── Upload ────────────────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    document_id: str
    filename: str
    status: str
    message: str
