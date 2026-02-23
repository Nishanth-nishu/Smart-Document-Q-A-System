"""
Database layer — Supabase (PostgreSQL + pgvector + Storage)
All queries use the Supabase REST API via the `supabase-py` client.
"""
import logging
from typing import List, Optional, Dict, Any
from supabase import create_client, Client
from config import settings
from auth import hash_password

logger = logging.getLogger(__name__)

# ── Client ────────────────────────────────────────────────────────────────────

def get_supabase() -> Client:
    """Return a Supabase client with the service role key (bypasses RLS for server-side ops)."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


supabase: Client = get_supabase()


# ── Auth / Users ──────────────────────────────────────────────────────────────

def create_user(email: str, password: str, name: Optional[str] = None) -> Dict:
    """Register a new user. Raises on duplicate email."""
    # Check if user already exists
    existing = supabase.table("users").select("id").eq("email", email).execute()
    if existing.data:
        raise ValueError("Email already registered")

    hashed = hash_password(password)
    result = supabase.table("users").insert({
        "email": email,
        "password_hash": hashed,
        "name": name or email.split("@")[0],
    }).execute()

    if not result.data:
        raise RuntimeError("Failed to create user")
    return result.data[0]


def get_user_by_email(email: str) -> Optional[Dict]:
    result = supabase.table("users").select("*").eq("email", email).execute()
    return result.data[0] if result.data else None


def get_user_by_id(user_id: str) -> Optional[Dict]:
    result = supabase.table("users").select("id,email,name,created_at").eq("id", user_id).execute()
    return result.data[0] if result.data else None


# ── Documents ─────────────────────────────────────────────────────────────────

def create_document(user_id: str, filename: str, file_size: int) -> Dict:
    result = supabase.table("documents").insert({
        "user_id": user_id,
        "filename": filename,
        "file_size": file_size,
        "status": "processing",
    }).execute()
    if not result.data:
        raise RuntimeError("Failed to create document record")
    return result.data[0]


def get_documents_by_user(user_id: str) -> List[Dict]:
    result = (
        supabase.table("documents")
        .select("id,filename,file_size,status,created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    # Attach chunk counts
    docs = result.data or []
    for doc in docs:
        count_result = (
            supabase.table("document_chunks")
            .select("id", count="exact")
            .eq("document_id", doc["id"])
            .execute()
        )
        doc["chunk_count"] = count_result.count or 0
    return docs


def get_document(doc_id: str, user_id: str) -> Optional[Dict]:
    result = (
        supabase.table("documents")
        .select("*")
        .eq("id", doc_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        return None
    
    doc = result.data[0]
    # Attach chunk count
    count_result = (
        supabase.table("document_chunks")
        .select("id", count="exact")
        .eq("document_id", doc_id)
        .execute()
    )
    doc["chunk_count"] = count_result.count or 0
    return doc


def update_document_status(doc_id: str, status: str) -> None:
    supabase.table("documents").update({"status": status}).eq("id", doc_id).execute()


def delete_document(doc_id: str, user_id: str) -> bool:
    """Delete document and all its chunks (cascaded by FK). Returns True on success."""
    doc = get_document(doc_id, user_id)
    if not doc:
        return False
    # Delete chunks first
    supabase.table("document_chunks").delete().eq("document_id", doc_id).execute()
    # Delete storage file
    try:
        storage_path = f"{user_id}/{doc_id}/{doc['filename']}"
        supabase.storage.from_("documents").remove([storage_path])
    except Exception as e:
        logger.warning(f"Storage deletion failed (non-fatal): {e}")
    # Delete document record
    supabase.table("documents").delete().eq("id", doc_id).execute()
    return True


# ── Document Chunks ───────────────────────────────────────────────────────────

def insert_chunks(chunks: List[Dict]) -> None:
    """Bulk-insert document chunks (with embeddings)."""
    if not chunks:
        return
    # Insert in batches of 50
    batch_size = 50
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        supabase.table("document_chunks").insert(batch).execute()


def vector_search(
    user_id: str,
    query_embedding: List[float],
    document_ids: Optional[List[str]] = None,
    top_k: int = 5,
) -> List[Dict]:
    """
    Cosine similarity search via Supabase RPC function.
    Scoped to user_id and optionally specific document_ids.
    """
    params = {
        "query_embedding": query_embedding,
        "match_user_id": user_id,
        "match_count": top_k,
        "doc_ids": document_ids,
    }
    result = supabase.rpc("match_document_chunks", params).execute()
    return result.data or []


def get_chunks_for_bm25(
    user_id: str, document_ids: Optional[List[str]] = None
) -> List[Dict]:
    """Retrieve all chunks for BM25 indexing (text + metadata)."""
    query = (
        supabase.table("document_chunks")
        .select("id,document_id,sentence_text,window_text,page_number,bm25_content")
        .eq("user_id", user_id)
    )
    if document_ids:
        query = query.in_("document_id", document_ids)
    result = query.execute()
    return result.data or []


def get_filenames_by_ids(doc_ids: List[str]) -> Dict[str, str]:
    """Map document_id -> filename for citation display."""
    if not doc_ids:
        return {}
    result = (
        supabase.table("documents")
        .select("id,filename")
        .in_("id", doc_ids)
        .execute()
    )
    return {row["id"]: row["filename"] for row in (result.data or [])}
