-- ============================================================
-- DocKnowledge Q&A — Supabase SQL Schema
-- Run this in Supabase SQL Editor (New Query)
-- ============================================================

-- Enable pgvector extension
create extension if not exists vector;

-- ── Users table (custom, separate from Supabase auth) ────────────────────────
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  name text,
  created_at timestamptz default now()
);

-- ── Documents table ───────────────────────────────────────────────────────────
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  filename text not null,
  file_size integer,
  status text not null default 'processing',  -- processing | ready | error
  created_at timestamptz default now()
);

-- ── Document chunks with sentence windows and embeddings ──────────────────────
create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  chunk_index integer not null,
  sentence_text text not null,     -- anchor sentence (embedded for search)
  window_text text not null,       -- anchor ± 2 neighbors (fed to LLM as context)
  embedding vector(384),           -- all-MiniLM-L6-v2 dimensions
  bm25_content text,               -- normalized text for BM25 keyword search
  page_number integer default 1,
  created_at timestamptz default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────

-- Fast lookup by user
create index if not exists idx_documents_user_id on documents(user_id);
create index if not exists idx_chunks_user_id on document_chunks(user_id);
create index if not exists idx_chunks_document_id on document_chunks(document_id);

-- IVFFlat index for approximate nearest-neighbor vector search
-- Lists=100 is a good default for collections up to ~1M rows
create index if not exists idx_chunks_embedding
  on document_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ── RPC: Hybrid vector similarity search ─────────────────────────────────────
-- This function is called by the backend's vector_search() method
create or replace function match_document_chunks(
  query_embedding vector(384),
  match_user_id uuid,
  match_count int,
  doc_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  user_id uuid,
  sentence_text text,
  window_text text,
  page_number integer,
  bm25_content text,
  similarity float
)
language sql stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.user_id,
    dc.sentence_text,
    dc.window_text,
    dc.page_number,
    dc.bm25_content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where
    dc.user_id = match_user_id
    and dc.embedding is not null
    and (doc_ids is null or dc.document_id = any(doc_ids))
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

-- ── Storage bucket for uploaded files ─────────────────────────────────────────
-- Run in Supabase Dashboard > Storage > Create bucket named "documents" (private)
-- Or use this SQL:
insert into storage.buckets (id, name, public)
  values ('documents', 'documents', false)
  on conflict (id) do nothing;
