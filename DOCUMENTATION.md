# DocKnowledge — Architecture & Technical Documentation

**Project**: Smart Document Q&A System (Option 1)  
**Assignment**: AI Engineer Take-Home

---

## 1. Architecture Decisions

### Why this stack?

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Backend** | FastAPI (Python) | Async, fast, excellent ML library ecosystem, built-in OpenAPI docs |
| **Frontend** | Next.js 14 (App Router) | Industry standard React framework, Vercel-native, TypeScript |
| **Database** | Supabase (PostgreSQL) | Built-in pgvector, Auth, Storage — one platform for all data needs |
| **Vector store** | Supabase pgvector | No separate vector DB needed; RLS handles per-user isolation natively |
| **Embeddings** | sentence-transformers/all-MiniLM-L6-v2 | Free, local, 384-dim, fast enough for Render free tier (512MB RAM) |
| **LLM** | OpenRouter → Llama 3.1 8B Instruct (free) | Zero cost, strong instruction following, fits prototype constraints |
| **Deployment** | Render (backend) + Vercel (frontend) | Both have free tiers, GitHub integration, zero DevOps overhead |

### Why not Ollama (original stack)?

The original template used Ollama for local LLM inference — this works locally but **cannot be deployed to cloud free tiers** because:
1. Ollama needs to download 4GB+ models on startup
2. Render free tier has 512MB RAM — can't hold an on-device LLM
3. Ollama expects a GPU; cloud free tiers are CPU-only

**Solution**: OpenRouter provides a free API to hosted models. `meta-llama/llama-3.1-8b-instruct:free` gives comparable quality at zero cost.

### Why not Chainlit?

The original frontend used Chainlit — a Python-based chat UI. For a production deployment:
1. Chainlit is a dev tool, not a production frontend
2. Can't add auth, document management, or custom pages without major hacking
3. No user-scoped document management
4. Hard to deploy on Vercel (requires Node.js)

**Solution**: Next.js 14 gives full control over UI/UX, auth flows, and document management pages.

---

## 2. Database Schema

### Tables

```sql
users           → id, email, password_hash, name, created_at
documents       → id, user_id (FK), filename, file_size, status, created_at
document_chunks → id, document_id (FK), user_id (FK), chunk_index,
                   sentence_text, window_text, embedding (vector(384)),
                   bm25_content, page_number
```

### Key design decisions:

**Sentence window columns** (`sentence_text` vs `window_text`):
- `sentence_text` — the individual anchor sentence, used for embedding (precise semantic match)
- `window_text` — the anchor ± 2 neighboring sentences, passed to the LLM as context (richer information)
- This implements the "Small-to-Big" RAG pattern from LlamaIndex's research

**`bm25_content` column**:
- Lowercased version of `sentence_text` for BM25 tokenization
- BM25 is done in-memory (rank_bm25 library) on retrieved rows, not stored in DB

**User isolation**:
- Both `documents` and `document_chunks` carry a `user_id` foreign key
- The `match_document_chunks` SQL RPC function accepts `match_user_id` and filters by it
- There's no RLS policy (this is done in query logic), keeping it simple

---

## 3. Authentication Approach

**Type**: JWT (JSON Web Tokens) with email/password  
**No third-party OAuth** — for simplicity and prototype speed

### Flow:
1. User registers → password bcrypt-hashed → stored in `users` table
2. Login → verify bcrypt → issue JWT (HS256, 24h expiry)
3. Frontend stores JWT in `localStorage`
4. Every protected API call sends `Authorization: Bearer <token>`
5. FastAPI dependency `get_current_user` validates JWT → returns user dict

### Session management:
- Tokens expire after 24 hours (configurable via `JWT_EXPIRE_MINUTES`)
- On 401, frontend auto-redirects to `/login` and clears localStorage
- No refresh tokens (proto trade-off — see Trade-offs section)

---

## 4. API Design

REST API with resource-based routing:

```
/auth/*         — authentication (no JWT required)
/documents/*    — document CRUD (JWT required)
/ask            — Q&A endpoint (JWT required)
/health         — health check
```

### Key decisions:
- `POST /documents/upload` returns **202 Accepted** immediately (async processing)
- Frontend polls `GET /documents/{id}` to check `status: processing → ready`
- `POST /ask` accepts optional `document_ids[]` to scope Q&A to specific files
- All errors return standard JSON `{"detail": "message"}` (FastAPI convention)

---

## 5. AI Integration: RAG Architecture

### Research basis:
1. **Sentence Window Retrieval** (LlamaIndex, 2023) — embed small units, retrieve large context windows
2. **Reciprocal Rank Fusion** (Cormack et al., SIGIR 2009) — provably better than single-method ranking
3. **DPR** (Karpukhin et al., ACL 2020) — dense retrieval outperforms BM25 on semantic questions; hybrid outperforms both

### Retrieval pipeline:

```
Query
  │
  ├── Dense path: embed query → pgvector cosine search → top-5 by similarity
  │
  └── Sparse path: lowercase tokenize → BM25Okapi.get_scores() → top-5 by score
        (run in-memory on all user's chunks, ~O(N*querylen))
  │
  └── RRF Fusion (k=60):  score[id] += 1/(k + rank)
        (merges both ranked lists → top-4 by fused score)
  │
  └── Build context: window_text of top-4 chunks
  │
  └── OpenRouter LLM prompt → answer with [Source N] citations
```

### Embedding model choice:
- `all-MiniLM-L6-v2` (22M params, 384-dim) over larger models because:
  - Fits in 512MB RAM on Render free tier
  - 7x faster than `all-mpnet-base-v2` 
  - Only -3% benchmark score vs models 3x larger (SBERT benchmark)

---

## 6. AI Tool Usage

**Tools used**: Antigravity (Google DeepMind AI coding assistant)

### Where AI was effective:
- **Boilerplate generation** — FastAPI endpoint signatures, Pydantic schemas
- **SQL schema design** — pgvector index configuration, RPC function structure
- **Frontend component scaffolding** — Tailwind class combinations, form handling
- **Research synthesis** — Identifying RRF, sentence-window approach from papers

### Where I overrode AI suggestions:
- **Embedding model**: AI initially suggested `text-embedding-3-small` (OpenAI API, costs money). Overrode to use local `all-MiniLM-L6-v2` to stay free.
- **Auth**: AI suggested using Supabase Auth (magic links/email verification). Overrode to use custom JWT for simpler credentials-based auth that doesn't require email verification setup.
- **BM25 approach**: AI suggested storing inverted index in Redis. Overrode to in-memory BM25 — simpler, works for prototype scale, Redis would need a paid tier.
- **Chainlit**: AI suggested keeping Chainlit frontend. Completely overrode — replaced with full Next.js app.

---

## 7. Trade-offs Made

### Given the 4-6 hour time constraint:

**Prioritized:**
- Core RAG pipeline quality (hybrid search, sentence windows)
- Complete auth flow with proper JWT
- Clean, usable UI with good UX (status badges, source citations, loading states)
- Deployment-ready configuration

**Skipped (would add with more time):**
- **JWT refresh tokens** — current tokens expire in 24h and user must re-login. Would add a refresh token flow.
- **Email verification** — users can register with any email. Would add SMTP + verification link.
- **File-level deduplication** — same file can be uploaded twice. Would add content hash check.
- **Streaming LLM responses** — answers appear all-at-once. Would use SSE with OpenRouter streaming API.
- **Reranking** — a cross-encoder reranker (e.g., `cross-encoder/ms-marco-MiniLM-L-6-v2`) after RRF would improve precision further.
- **Conversation history** — each Q&A is stateless. Would add a `conversations` table and inject last N messages as context.
- **Rate limiting** — no per-user request throttling. Would add with fastapi-limiter + Redis.

### Production considerations addressed:
- ✅ CORS configuration
- ✅ Environment variable isolation
- ✅ Async document processing (no request blocking)
- ✅ Data isolation (user_id scoping on all queries)
- ✅ File size limits (20MB)
- ✅ File type validation
- ✅ Error handling with proper HTTP status codes
- ✅ Health check endpoint

### Production considerations skipped:
- ❌ HTTPS-only cookie storage (using localStorage for JWT — XSS risk in production)
- ❌ Database connection pooling (would use asyncpg + SQLAlchemy in production)
- ❌ Proper logging/monitoring (would add Sentry/Datadog)
- ❌ CDN for file uploads (files not stored after processing — would add Supabase Storage)
- ❌ Background job queue (using asyncio.create_task — would use Celery/Redis in production)
