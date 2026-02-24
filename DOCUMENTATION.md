# DocKnowledge — Architecture & Technical Documentation

**Project**: Smart Document Q&A System (Option 1)
**Assignment**: AI Engineer Take-Home
**Live Demo**: [http://16.176.103.66:3000/](http://16.176.103.66:3000/)
**Test credentials**: `test@docknowledge.app` / `Demo1234!`

---

## Table of Contents

1. [Architecture Decisions](#1-architecture-decisions)
2. [Database Schema](#2-database-schema)
3. [Authentication Approach](#3-authentication-approach)
4. [API Design](#4-api-design)
5. [AI Integration — RAG Architecture](#5-ai-integration--rag-architecture)
6. [AI Tool Usage](#6-ai-tool-usage)
7. [Trade-offs Made](#7-trade-offs-made)

---

## 1. Architecture Decisions

### Stack overview

| Layer | Choice | Rationale |
|---|---|---|
| **Frontend** | Next.js 14 (App Router, TypeScript) | Industry-standard React framework; Vercel-native; full control over auth flows, routing, and custom UI — not possible with Chainlit |
| **Backend** | FastAPI (Python 3.11) | Async support, excellent ML/AI library ecosystem, built-in OpenAPI docs, easy Pydantic validation |
| **Database** | Supabase (PostgreSQL + pgvector) | Eliminates a separate vector database; pgvector handles both relational and semantic search in one platform; free tier is production-capable |
| **Embeddings** | `sentence-transformers/all-MiniLM-L6-v2` | 22M parameters, 384-dim output, runs entirely locally with no API cost, fits comfortably within 512 MB RAM on Render's free tier |
| **LLM (default)** | Google Gemini (`gemini-2.0-flash`) | Free tier, reliable response quality, no rate limits at prototype scale |
| **LLM (fallback)** | OpenRouter (`meta-llama/llama-3.1-8b-instruct:free`) | Switchable via `LLM_PROVIDER` env var; also free; useful if Gemini quota is hit |
| **Deployment** | AWS EC2 (demo), Render + Vercel (documented) | EC2 for the live demo; Render + Vercel documented as the recommended free-tier path with zero DevOps overhead |
| **Containerization** | Docker + Docker Compose | Reproducible local development; images published to Docker Hub for portability |

### Why not the original stack?

The base template used **Ollama** for local LLM inference and **Chainlit** for the frontend. Both were replaced:

**Ollama** cannot be deployed to cloud free tiers because it needs to download multi-gigabyte models at startup and requires GPU memory. Render's free tier provides 512 MB RAM — a local LLM is not feasible. The solution was a multi-provider integration: Gemini as default (free tier API), OpenRouter as a fallback.

**Chainlit** is a developer prototyping tool and cannot support production requirements like custom auth flows, per-user document management pages, or a polished UI. It was fully replaced with a Next.js 14 app.

---

## 2. Database Schema

### Tables

```sql
users (
  id            uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text  UNIQUE NOT NULL,
  password_hash text  NOT NULL,
  name          text,
  created_at    timestamptz DEFAULT now()
)

documents (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename   text  NOT NULL,
  file_size  integer,
  status     text  NOT NULL DEFAULT 'processing',  -- processing | ready | error
  created_at timestamptz DEFAULT now()
)

document_chunks (
  id            uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid  NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id       uuid  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_index   integer NOT NULL,
  sentence_text text  NOT NULL,        -- anchor sentence, used for embedding
  window_text   text  NOT NULL,        -- anchor ± 2 neighbors, fed to LLM
  embedding     vector(384),           -- all-MiniLM-L6-v2 output
  bm25_content  text,                  -- lowercased sentence_text for BM25
  page_number   integer DEFAULT 1,
  created_at    timestamptz DEFAULT now()
)
```

### Key design decisions

**`sentence_text` vs `window_text` (Small-to-Big pattern)**

Each chunk stores two versions of its content. `sentence_text` is a single anchor sentence — short and precise, ideal for creating a focused embedding. `window_text` is that anchor sentence plus two neighboring sentences on each side. When the LLM answers a question, it receives `window_text` as context, which provides much richer information than the anchor alone. This is the "Sentence Window Retrieval" approach from LlamaIndex's research: retrieve at a fine-grained level for accuracy, but expand context for generation quality.

**`bm25_content` column**

A lowercased copy of `sentence_text` used for BM25 tokenization. BM25 is computed in-memory using the `rank-bm25` library on rows fetched from Supabase — there is no inverted index in the database. This avoids Redis or any additional infrastructure.

**Dual `user_id` foreign key**

Both `documents` and `document_chunks` carry a `user_id` FK. This makes it possible to filter chunks directly by `user_id` without joining through the `documents` table on every query, which matters for performance as chunk counts grow.

**IVFFlat index for vector search**

```sql
CREATE INDEX idx_chunks_embedding
  ON document_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

IVFFlat with `lists=100` is appropriate for collections up to roughly one million rows. It trades a small amount of recall for much faster approximate nearest-neighbor search compared to an exact sequential scan.

**`match_document_chunks` RPC function**

Vector search is exposed as a Supabase RPC (remote procedure call) function rather than a direct table query. This keeps the cosine similarity computation inside PostgreSQL, avoids transferring raw embedding vectors over the network, and allows filtering by `user_id` and optional `document_ids` in one SQL expression.

---

## 3. Authentication Approach

**Type**: Custom JWT (HS256) with email/password authentication
**No third-party OAuth** — chosen for simplicity and speed given the time constraint

### Registration and login flow

```
Register
  → validate password length (≥8 chars)
  → check email not already registered
  → bcrypt.hashpw(password, gensalt())
  → INSERT into users table
  → issue JWT {sub: user_id, email, exp: now+24h}
  → return token + user info

Login
  → SELECT user by email
  → bcrypt.checkpw(plain, stored_hash)
  → if match → issue JWT
  → return token + user info
```

### Session management

Tokens are signed with HS256 using a `JWT_SECRET` environment variable. Expiry is configurable via `JWT_EXPIRE_MINUTES` (default: 1440 minutes = 24 hours). The frontend stores the token in `localStorage` and sends it as `Authorization: Bearer <token>` on every protected request. On a 401 response, the API client automatically clears localStorage and redirects to `/login`. There are no refresh tokens in this prototype — users re-authenticate after 24 hours.

### FastAPI dependency

```python
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    return decode_token(credentials.credentials)
```

Every protected endpoint declares `Depends(get_current_user)` which validates the JWT and returns the decoded payload (`sub`, `email`). If the token is missing, expired, or invalid, FastAPI automatically returns 401 before the endpoint body runs.

---

## 4. API Design

REST API with resource-based routing. All endpoints return standard JSON.

```
/auth/*           — Authentication (no JWT required)
/documents/*      — Document CRUD (JWT required)
/ask              — Q&A (JWT required)
/health           — Health check (no JWT required)
```

### Notable design decisions

**202 Accepted for uploads**

`POST /documents/upload` returns `202 Accepted` immediately rather than blocking until processing completes. Document ingestion (text extraction, sentence tokenization, embedding generation, database insertion) can take 5–30 seconds for a large PDF. Blocking the HTTP connection for that duration is a poor user experience and risks proxy timeouts. The frontend polls `GET /documents/{id}` every 3 seconds and updates the status badge from `processing` → `ready` when done.

**Async background processing**

```python
asyncio.create_task(process_document_background(file_bytes, filename, doc_id, user_id))
```

The background task uses `asyncio.to_thread` to offload CPU-bound work (text parsing, embedding generation) without blocking the FastAPI event loop. This is appropriate for prototype scale — a production system would use Celery with a Redis broker.

**Optional document scope on `/ask`**

The `POST /ask` endpoint accepts an optional `document_ids` list. When omitted, the query searches across all of the user's documents. When provided, the search is scoped to only those documents. This allows users to ask questions about a specific document via the chat page's sidebar filter.

**Standard error format**

All errors use FastAPI's default `{"detail": "message"}` JSON structure with appropriate HTTP status codes (400 for validation, 401 for auth, 404 for not found, 422 for unprocessable state, 502 for LLM failures).

---

## 5. AI Integration — RAG Architecture

### Research basis

| Paper | Application in this project |
|---|---|
| "Improving RAG with Sentence Window Retrieval" — Liu, LlamaIndex (2023) | `sentence_text` for embedding, `window_text` for LLM context |
| "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods" — Cormack et al., SIGIR 2009 | RRF used to merge vector and BM25 ranked lists |
| "Dense Passage Retrieval for Open-Domain Question Answering" — Karpukhin et al., ACL 2020 | Justification for hybrid over BM25-only retrieval |

### Full ingestion pipeline

```
File bytes (PDF or TXT)
  │
  ▼
Parse text (pypdf for PDF, UTF-8 decode for TXT)
  │
  ▼
Split into sentences — NLTK sent_tokenize
  (fallback: split on [.!?] + whitespace)
  Filter: drop sentences shorter than 20 characters
  │
  ▼
Build sentence windows
  For each sentence i:
    window_text  = sentences[max(0, i-2) : i+3]  (joined)
    sentence_text = sentences[i]
  │
  ▼
Embed anchor sentences in batches of 32
  Model: all-MiniLM-L6-v2 (384-dim, cosine-normalized)
  Runs locally via sentence-transformers
  │
  ▼
Bulk insert to Supabase in batches of 50 rows
  (document_id, user_id, chunk_index, sentence_text,
   window_text, embedding, bm25_content, page_number)
  │
  ▼
Update document status: processing → ready
```

All three stages (parsing, embedding, DB insert) run inside `asyncio.to_thread` so the FastAPI event loop is never blocked.

### Hybrid retrieval pipeline

```
User question
  │
  ├─── Dense path ──────────────────────────────────────────
  │    embed_query(question) → 384-dim vector
  │    → Supabase RPC match_document_chunks
  │      (cosine similarity, filtered by user_id + doc_ids)
  │    → top-5 chunks ranked by similarity
  │
  └─── Sparse path ─────────────────────────────────────────
       fetch all chunks for user (bm25_content field)
       → BM25Okapi(tokenized_corpus)
       → bm25.get_scores(question.lower().split())
       → top-5 chunks by BM25 score (score > 0 only)
  │
  ▼
Reciprocal Rank Fusion
  For each chunk in each ranked list:
    score[id] += 1 / (60 + rank + 1)
  Sort by fused score descending → top-4
  │
  ▼
Build LLM context
  For each of top-4 chunks:
    [Source N (Page P)]:
    {chunk.window_text}
  │
  ▼
Prompt:
  "Answer using ONLY the provided context.
   Cite sources using [Source N] notation.
   If insufficient context, say so explicitly."
  │
  ▼
LLM call (Gemini or OpenRouter)
  temperature=0.1, max_tokens=1024
  │
  ▼
Return: answer + source citations
  (document_id, filename, page_number, chunk_text, rrf_score)
```

### Embedding model selection

`all-MiniLM-L6-v2` was chosen over larger alternatives for the following reasons:

- 22M parameters — fits in 512 MB RAM alongside FastAPI
- 7× faster than `all-mpnet-base-v2` at inference
- Only ~3% lower score on SBERT benchmarks versus models 3× larger
- No API cost or network latency — embeddings are generated locally on the server

### LLM provider design

The `call_llm()` function routes to `call_gemini_llm()` or `call_openrouter_llm()` based on the `LLM_PROVIDER` environment variable. This makes it trivial to switch providers without code changes. Both implementations include retry logic with exponential backoff for rate limit errors (HTTP 429) and timeout handling.

---

## 6. AI Tool Usage

### Tools used

- **Claude (Anthropic)** — architecture discussion, debugging assistance, code review
- **ChatGPT (OpenAI GPT-4)** — boilerplate generation, SQL schema drafting, research synthesis
- **GitHub Copilot** — inline completions while writing FastAPI endpoints and TypeScript API client

### Where AI was effective

**Boilerplate acceleration** — FastAPI endpoint signatures, Pydantic schema definitions, and Next.js form components were scaffolded quickly with AI. Writing these by hand would have consumed most of the 4–6 hour budget.

**SQL schema design** — AI suggested the pgvector IVFFlat index configuration, the `match_document_chunks` RPC function structure, and the ON DELETE CASCADE FK pattern for automatic chunk cleanup.

**Research synthesis** — Identifying the relevant papers (RRF, Sentence Window Retrieval, DPR) and understanding how to combine them into a coherent hybrid pipeline was significantly accelerated by AI assistance.

**Frontend component scaffolding** — Tailwind class combinations for the dark theme, the expandable citation card component, and the polling logic for document status were all drafted with AI and then refined.

### Where AI suggestions were overridden

**Embedding model**

AI initially recommended `text-embedding-3-small` (OpenAI API). This would add a per-token API cost on every document upload and every query. Overridden to `all-MiniLM-L6-v2` — free, local, and fits within the memory constraints of Render's free tier.

**Authentication**

AI suggested using Supabase Auth (magic links / email verification). This would require SMTP setup and email verification flows that add significant complexity. Overridden to a custom JWT system with bcrypt — simpler, faster to implement, and appropriate for a prototype where email verification is not a hard requirement.

**BM25 storage**

AI suggested storing an inverted index in Redis for BM25 lookups. Redis would require a paid add-on on any free hosting platform. Overridden to in-memory BM25 using `rank-bm25` on chunks fetched per-query. This is O(N × query_length) but entirely acceptable at prototype scale (hundreds to low thousands of chunks per user).

**Frontend framework**

AI suggested keeping the original Chainlit frontend. Completely overridden — Chainlit cannot support custom auth flows, per-user document management, or a production-quality UI. Replaced with Next.js 14 App Router.

**LLM provider**

AI initially suggested OpenAI GPT-3.5/4 as the LLM. This would incur API costs at any non-trivial usage level. Overridden to Google Gemini (free tier) as the default, with OpenRouter (also free) as a configurable fallback.

---

## 7. Trade-offs Made

### Time constraint: 4–6 hours

**Prioritized (completed)**

- Complete, research-backed RAG pipeline: hybrid search, sentence-window retrieval, RRF fusion
- Full JWT authentication flow with password hashing
- Per-user data isolation on all queries
- Clean, usable UI: status badges, expandable source citations, loading states, sidebar document filter
- Async document processing (non-blocking uploads)
- Docker Compose for local development
- Deployment configuration for both Render/Vercel and EC2
- Complete documentation

**Skipped (would add with more time)**

| Feature | Reason skipped | How to add |
|---|---|---|
| JWT refresh tokens | 24h expiry is acceptable for a prototype | Add a `refresh_tokens` table; issue short-lived access tokens + long-lived refresh tokens |
| Email verification | Requires SMTP setup and verification link flow | Add `is_verified` column; send email via SendGrid/SES on registration |
| File deduplication | Same file can be uploaded twice | Add SHA-256 content hash to `documents` table; check before inserting |
| Streaming LLM responses | Answers appear all at once | Use Server-Sent Events with OpenRouter/Gemini streaming APIs |
| Cross-encoder reranking | RRF output could be reranked by a cross-encoder | Add `cross-encoder/ms-marco-MiniLM-L-6-v2` after RRF for precision improvement |
| Conversation history | Each Q&A is stateless | Add a `conversations` table; inject last N messages as context |
| Rate limiting | No per-user request throttling | Add `fastapi-limiter` with Redis |
| Automated tests | No unit or integration tests | Add pytest for backend, Playwright for E2E |

### Production considerations

**Addressed in this prototype**

- CORS configuration with environment-variable-controlled allowlist
- Environment variable isolation with `.env.example`
- Async document processing (no HTTP connection blocking)
- Data isolation via `user_id` scoping on all queries
- File size limit (20 MB) and file type validation
- Proper HTTP status codes for all error cases
- Health check endpoint for liveness probes
- Retry logic with exponential backoff for LLM API calls
- Docker images for reproducible deployment

**Skipped (known limitations)**

- JWT in `localStorage` — vulnerable to XSS. Production should use `HttpOnly` cookies.
- HTTP, not HTTPS, on the demo server — tokens sent in plaintext over the network.
- No database connection pooling — would use `asyncpg` + SQLAlchemy in production.
- No structured logging or monitoring — would add Sentry for errors, Datadog for metrics.
- Files not persisted after processing — would store originals in Supabase Storage for re-processing or download.
- Background tasks via `asyncio.create_task` — no durability. A server restart loses in-flight tasks. Production should use Celery with Redis.
- No input sanitization beyond length/type checks — production would add more thorough validation.
