/**
 * API client — typed wrapper around the backend REST API.
 * Uses localStorage for JWT token persistence.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface User {
    id: string
    email: string
    name?: string
    created_at?: string
}

export interface TokenResponse {
    access_token: string
    token_type: string
    user_id: string
    email: string
    name?: string
}

export interface Document {
    id: string
    filename: string
    file_size?: number
    status: 'processing' | 'ready' | 'error'
    chunk_count?: number
    created_at?: string
}

export interface SourceCitation {
    document_id: string
    filename: string
    page_number?: number
    chunk_text: string
    relevance_score?: number
}

export interface AnswerResponse {
    answer: string
    sources: SourceCitation[]
    status: string
    error?: string
}

export interface UploadResponse {
    document_id: string
    filename: string
    status: string
    message: string
}

// ── Token helpers ──────────────────────────────────────────────────────────────

export function getToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('auth_token')
}

export function setToken(token: string): void {
    localStorage.setItem('auth_token', token)
}

export function removeToken(): void {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
}

export function getStoredUser(): User | null {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem('auth_user')
    try { return raw ? JSON.parse(raw) : null } catch { return null }
}

export function setStoredUser(user: User): void {
    localStorage.setItem('auth_user', JSON.stringify(user))
}

// ── Base fetch ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(
    path: string,
    options: RequestInit = {},
    withAuth = true,
): Promise<T> {
    const headers: Record<string, string> = {}

    if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json'
    }
    if (withAuth) {
        const token = getToken()
        if (token) headers['Authorization'] = `Bearer ${token}`
    }

    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
    })

    if (res.status === 401) {
        removeToken()
        window.location.href = '/login'
        throw new Error('Session expired. Please login again.')
    }

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
        throw new Error(data?.detail || data?.message || `HTTP ${res.status}`)
    }

    return data as T
}

// ── Auth ────────────────────────────────────────────────────────────────────────

export async function register(
    email: string,
    password: string,
    name?: string,
): Promise<TokenResponse> {
    return apiFetch<TokenResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
    }, false)
}

export async function login(
    email: string,
    password: string,
): Promise<TokenResponse> {
    return apiFetch<TokenResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    }, false)
}

export async function getMe(): Promise<User> {
    return apiFetch<User>('/auth/me')
}

// ── Documents ────────────────────────────────────────────────────────────────────

export async function listDocuments(): Promise<{ documents: Document[]; total: number }> {
    return apiFetch('/documents/')
}

export async function getDocument(id: string): Promise<Document> {
    return apiFetch(`/documents/${id}`)
}

export async function uploadDocument(file: File): Promise<UploadResponse> {
    const form = new FormData()
    form.append('file', file)
    return apiFetch<UploadResponse>('/documents/upload', {
        method: 'POST',
        body: form,
    })
}

export async function deleteDocument(id: string): Promise<void> {
    await apiFetch<void>(`/documents/${id}`, { method: 'DELETE' })
}

// ── Q&A ─────────────────────────────────────────────────────────────────────────

export async function askQuestion(
    question: string,
    documentIds?: string[],
): Promise<AnswerResponse> {
    return apiFetch<AnswerResponse>('/ask', {
        method: 'POST',
        body: JSON.stringify({ question, document_ids: documentIds }),
    })
}

// ── Health ─────────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<{ status: string }> {
    return apiFetch<{ status: string }>('/health', {}, false)
}
