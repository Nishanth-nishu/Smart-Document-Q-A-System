"""
RAG Engine — Sentence-Window Retrieval + Hybrid BM25/pgvector Search
====================================================================
Architecture based on:
  - "Improving RAG with Sentence Window Retrieval" - LlamaIndex research 2023
  - "Benchmarking Large Language Models in RAG Pipelines" - arXiv:2309.01431
  - "BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of IR Models" (BM25 baseline)

Pipeline:
  1. Document ingestion: split into sentences, build sentence windows
  2. Embedding: local all-MiniLM-L6-v2 (384-dim, fast, free)
  3. Storage: Supabase pgvector + BM25 content field
  4. Retrieval: hybrid search — vector cosine + BM25 → Reciprocal Rank Fusion
  5. Generation: OpenRouter free LLM (Llama-3.1-8b-instruct:free)
"""
import asyncio
import re
import logging
import nltk
import requests
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from sentence_transformers import SentenceTransformer
from rank_bm25 import BM25Okapi
from config import settings
import database as db

logger = logging.getLogger(__name__)

# Download NLTK sentence tokenizer on first run
try:
    nltk.data.find("tokenizers/punkt_tab")
except LookupError:
    nltk.download("punkt_tab", quiet=True)

try:
    nltk.data.find("tokenizers/punkt")
except LookupError:
    nltk.download("punkt", quiet=True)


# ── Singleton embedding model ─────────────────────────────────────────────────
_embedding_model: Optional[SentenceTransformer] = None


def get_embedding_model() -> SentenceTransformer:
    global _embedding_model
    if _embedding_model is None:
        logger.info(f"Loading embedding model: {settings.EMBEDDING_MODEL}")
        _embedding_model = SentenceTransformer(settings.EMBEDDING_MODEL)
        logger.info("Embedding model loaded.")
    return _embedding_model


def embed_texts(texts: List[str]) -> List[List[float]]:
    model = get_embedding_model()
    embeddings = model.encode(texts, batch_size=32, normalize_embeddings=True)
    return embeddings.tolist()


def embed_query(text: str) -> List[float]:
    return embed_texts([text])[0]


# ── Document Processing ───────────────────────────────────────────────────────

def split_into_sentences(text: str) -> List[str]:
    """Split text into clean sentences using NLTK."""
    try:
        sentences = nltk.sent_tokenize(text)
    except Exception:
        # Fallback: split on period + newline patterns
        sentences = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip() for s in sentences if len(s.strip()) > 20]


def build_sentence_windows(
    sentences: List[str], window_size: int = None
) -> List[Dict[str, str]]:
    """
    Sentence Window Retrieval approach:
    - Each chunk = one anchor sentence for precise embedding
    - window_text = anchor ± window_size neighbors for richer LLM context

    Based on: "Small-to-Big" retrieval strategy in LlamaIndex documentation
    and "Sentence Window Retrieval" from Jerry Liu's RAG survey (2023)
    """
    w = window_size or settings.SENTENCE_WINDOW
    windows = []
    for i, sent in enumerate(sentences):
        start = max(0, i - w)
        end = min(len(sentences), i + w + 1)
        window_text = " ".join(sentences[start:end])
        windows.append({
            "sentence_text": sent,
            "window_text": window_text,
            "sentence_index": i,
        })
    return windows


def process_pdf(file_bytes: bytes, filename: str) -> List[Dict]:
    """Extract text from PDF and build sentence windows with page metadata."""
    import pypdf
    from io import BytesIO

    reader = pypdf.PdfReader(BytesIO(file_bytes))
    all_windows = []

    for page_num, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            continue

        sentences = split_into_sentences(text)
        windows = build_sentence_windows(sentences)

        for w in windows:
            w["page_number"] = page_num

        all_windows.extend(windows)

    return all_windows


def process_text(file_bytes: bytes, filename: str) -> List[Dict]:
    """Process plain text files into sentence windows."""
    text = file_bytes.decode("utf-8", errors="replace")
    text = re.sub(r"\s+", " ", text).strip()
    sentences = split_into_sentences(text)
    windows = build_sentence_windows(sentences)
    for w in windows:
        w["page_number"] = 1
    return windows


def process_document(file_bytes: bytes, filename: str) -> List[Dict]:
    """Route to appropriate processor based on file extension."""
    ext = filename.lower().rsplit(".", 1)[-1]
    if ext == "pdf":
        return process_pdf(file_bytes, filename)
    else:
        return process_text(file_bytes, filename)


def build_chunks_for_db(
    windows: List[Dict],
    document_id: str,
    user_id: str,
    embeddings: List[List[float]],
) -> List[Dict]:
    """Package windows + embeddings into DB row dicts."""
    chunks = []
    for i, (w, emb) in enumerate(zip(windows, embeddings)):
        chunks.append({
            "document_id": document_id,
            "user_id": user_id,
            "chunk_index": i,
            "sentence_text": w["sentence_text"],
            "window_text": w["window_text"],
            "embedding": emb,
            "bm25_content": w["sentence_text"].lower(),
            "page_number": w.get("page_number", 1),
        })
    return chunks


async def ingest_document(
    file_bytes: bytes,
    filename: str,
    document_id: str,
    user_id: str,
) -> int:
    """
    Full ingestion pipeline:
    1. Parse document to sentence windows  (sync, run in thread)
    2. Generate embeddings                 (CPU-bound, run in thread)
    3. Store chunks in Supabase            (IO-bound, run in thread)

    All sync work is offloaded via asyncio.to_thread so the event loop
    is not blocked during heavy computation.

    Returns number of chunks created.
    """
    logger.info(f"Starting ingestion for {filename} (doc_id={document_id})")

    try:
        # Step 1: Parse (sync but fast — runs in thread for safety)
        windows = await asyncio.to_thread(process_document, file_bytes, filename)
        if not windows:
            raise ValueError("No text content extracted from document")
        logger.info(f"Extracted {len(windows)} sentence windows")

        # Step 2: Embed anchor sentences — CPU-bound, offload to thread
        texts_to_embed = [w["sentence_text"] for w in windows]
        embeddings = await asyncio.to_thread(embed_texts, texts_to_embed)
        logger.info(f"Generated {len(embeddings)} embeddings")

        # Step 3: Build chunk dicts and store in DB
        chunks = build_chunks_for_db(windows, document_id, user_id, embeddings)
        await asyncio.to_thread(db.insert_chunks, chunks)
        logger.info(f"Stored {len(chunks)} chunks in DB")

        return len(chunks)

    except Exception as e:
        logger.error(f"Ingestion failed: {e}")
        raise


# ── Hybrid Retrieval ──────────────────────────────────────────────────────────

def reciprocal_rank_fusion(
    ranked_lists: List[List[str]], k: int = 60
) -> List[Tuple[str, float]]:
    """
    Reciprocal Rank Fusion (RRF) — merges multiple ranked lists.
    Based on: "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods"
              Cormack et al., SIGIR 2009

    k=60 is the standard constant from the original paper.
    """
    scores: Dict[str, float] = {}
    for ranked_list in ranked_lists:
        for rank, item_id in enumerate(ranked_list):
            scores[item_id] = scores.get(item_id, 0.0) + 1.0 / (k + rank + 1)

    return sorted(scores.items(), key=lambda x: x[1], reverse=True)


def hybrid_search(
    user_id: str,
    query: str,
    document_ids: Optional[List[str]] = None,
    top_k_vector: int = None,
    top_k_bm25: int = None,
    top_k_final: int = None,
) -> List[Dict]:
    """
    Hybrid search combining:
    - Dense vector search (cosine similarity with pgvector)
    - Sparse BM25 search (TF-IDF-based keyword matching)
    Merged via Reciprocal Rank Fusion (RRF)

    Based on: "Dense Passage Retrieval for Open-Domain Question Answering" (Karpukhin et al., 2020)
    and hybrid search improvements from "SPLADE" and "ColBERT" papers.
    """
    tk_vec = top_k_vector or settings.TOP_K_VECTOR
    tk_bm25 = top_k_bm25 or settings.TOP_K_BM25
    tk_final = top_k_final or settings.TOP_K_FINAL

    # -- Dense vector search --
    query_emb = embed_query(query)
    vector_results = db.vector_search(
        user_id=user_id,
        query_embedding=query_emb,
        document_ids=document_ids,
        top_k=tk_vec,
    )
    vector_ranked = [r["id"] for r in vector_results]
    chunk_map = {r["id"]: r for r in vector_results}

    # -- Sparse BM25 search --
    all_chunks = db.get_chunks_for_bm25(user_id, document_ids)
    if all_chunks:
        tokenized_corpus = [c["bm25_content"].split() for c in all_chunks]
        bm25 = BM25Okapi(tokenized_corpus)
        tokenized_query = query.lower().split()
        bm25_scores = bm25.get_scores(tokenized_query)
        top_bm25_indices = np.argsort(bm25_scores)[::-1][:tk_bm25]
        bm25_ranked = [all_chunks[i]["id"] for i in top_bm25_indices if bm25_scores[i] > 0]

        # Add BM25 results to chunk_map
        for i in top_bm25_indices:
            c = all_chunks[i]
            if c["id"] not in chunk_map:
                chunk_map[c["id"]] = c
    else:
        bm25_ranked = []

    # -- RRF fusion --
    fused = reciprocal_rank_fusion([vector_ranked, bm25_ranked])
    top_ids = [item_id for item_id, _ in fused[:tk_final]]

    # Build result list with RRF scores
    results = []
    for item_id, score in fused[:tk_final]:
        chunk = chunk_map.get(item_id)
        if chunk:
            chunk["rrf_score"] = score
            results.append(chunk)

    return results


# ── LLM Generation via OpenRouter ─────────────────────────────────────────────

def build_rag_prompt(question: str, context_chunks: List[Dict]) -> str:
    """Build a structured RAG prompt with numbered source references."""
    context_parts = []
    for i, chunk in enumerate(context_chunks, start=1):
        page_info = f" (Page {chunk.get('page_number', '?')})" if chunk.get("page_number") else ""
        context_parts.append(f"[Source {i}{page_info}]:\n{chunk.get('window_text', chunk.get('sentence_text', ''))}")

    context_text = "\n\n".join(context_parts)

    return f"""You are an expert document analyst. Answer the user's question using ONLY the provided context.

Guidelines:
- Be concise and accurate
- Cite sources using [Source N] notation inline in your answer
- If the context doesn't contain enough information, say "I don't have enough information in the provided documents to answer that."
- Do NOT make up information not present in the context

Context:
{context_text}

Question: {question}

Answer:"""


def call_openrouter_llm(prompt: str) -> str:
    """Call OpenRouter API with the free LLM."""
    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://docknowledge.app",
        "X-Title": "DocKnowledge Q&A",
    }
    payload = {
        "model": settings.OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1024,
        "temperature": 0.1,  # Low temp for factual RAG
    }

    try:
        response = requests.post(
            f"{settings.OPENROUTER_BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"].strip()
    except requests.exceptions.Timeout:
        return "The LLM took too long to respond. Please try again."
    except Exception as e:
        logger.error(f"OpenRouter API error: {e}")
        raise RuntimeError(f"LLM call failed: {str(e)}")


# ── Full RAG Q&A Pipeline ─────────────────────────────────────────────────────

def answer_question(
    user_id: str,
    question: str,
    document_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Full RAG pipeline:
    1. Hybrid retrieve (vector + BM25 → RRF)
    2. Build prompt with sentence windows as context
    3. Call OpenRouter LLM
    4. Return answer + source citations
    """
    logger.info(f"Processing question for user {user_id}: {question[:80]}...")

    # Step 1: Retrieve
    retrieved_chunks = hybrid_search(
        user_id=user_id,
        query=question,
        document_ids=document_ids,
    )

    if not retrieved_chunks:
        return {
            "answer": "I couldn't find any relevant information in your documents. Please make sure you've uploaded documents and they've been processed.",
            "sources": [],
            "status": "no_context",
        }

    # Step 2: Get filenames for citations
    doc_ids_used = list({c["document_id"] for c in retrieved_chunks})
    filename_map = db.get_filenames_by_ids(doc_ids_used)

    # Step 3: Build prompt and call LLM
    prompt = build_rag_prompt(question, retrieved_chunks)
    answer = call_openrouter_llm(prompt)

    # Step 4: Build source citations
    sources = []
    seen = set()
    for i, chunk in enumerate(retrieved_chunks, start=1):
        citation_key = f"{chunk['document_id']}_{chunk.get('page_number', 0)}"
        if citation_key not in seen:
            seen.add(citation_key)
            sources.append({
                "document_id": chunk["document_id"],
                "filename": filename_map.get(chunk["document_id"], "Unknown"),
                "page_number": chunk.get("page_number"),
                "chunk_text": chunk.get("sentence_text", "")[:200],
                "relevance_score": round(chunk.get("rrf_score", 0.0), 4),
            })

    return {
        "answer": answer,
        "sources": sources,
        "status": "success",
    }
