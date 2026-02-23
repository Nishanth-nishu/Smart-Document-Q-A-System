'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    FileText, Upload, Trash2, MessageSquare, LogOut, User2, RefreshCw,
    CheckCircle2, Clock, XCircle, FileUp, AlertCircle, ChevronRight, Menu, X
} from 'lucide-react'
import * as api from '@/lib/api'
import type { Document } from '@/lib/api'

function formatFileSize(bytes?: number): string {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso?: string): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusBadge({ status }: { status: Document['status'] }) {
    const map = {
        processing: { icon: <Clock className="w-3 h-3" />, label: 'Processing', cls: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
        ready: { icon: <CheckCircle2 className="w-3 h-3" />, label: 'Ready', cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
        error: { icon: <XCircle className="w-3 h-3" />, label: 'Error', cls: 'text-red-400 bg-red-400/10 border-red-400/20' },
    }
    const s = map[status]
    return (
        <span className={`status-badge border ${s.cls}`}>
            {s.icon}{s.label}
        </span>
    )
}

export default function DashboardPage() {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [user, setUser] = useState<api.User | null>(null)
    const [documents, setDocuments] = useState<Document[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [uploadError, setUploadError] = useState('')
    const [sidebarOpen, setSidebarOpen] = useState(false)

    const loadDocuments = useCallback(async () => {
        try {
            const res = await api.listDocuments()
            setDocuments(res.documents)
        } catch {
            // handled globally
        }
    }, [])

    useEffect(() => {
        const token = api.getToken()
        if (!token) { router.push('/login'); return }
        const stored = api.getStoredUser()
        setUser(stored)
        loadDocuments().finally(() => setLoading(false))
    }, [router, loadDocuments])

    // Poll processing documents every 3s
    useEffect(() => {
        const hasProcessing = documents.some(d => d.status === 'processing')
        if (!hasProcessing) return
        const timer = setInterval(loadDocuments, 3000)
        return () => clearInterval(timer)
    }, [documents, loadDocuments])

    async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setUploadError('')

        const ext = file.name.split('.').pop()?.toLowerCase()
        if (!['pdf', 'txt', 'text'].includes(ext || '')) {
            setUploadError('Only PDF and TXT files are supported')
            return
        }

        setUploading(true)
        try {
            await api.uploadDocument(file)
            await loadDocuments()
        } catch (err: unknown) {
            setUploadError(err instanceof Error ? err.message : 'Upload failed')
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Delete this document and all its data?')) return
        setDeletingId(id)
        try {
            await api.deleteDocument(id)
            setDocuments(prev => prev.filter(d => d.id !== id))
        } catch { /* ignore */ }
        finally { setDeletingId(null) }
    }

    function handleLogout() {
        api.removeToken()
        router.push('/login')
    }

    const readyDocs = documents.filter(d => d.status === 'ready')

    return (
        <div className="min-h-screen flex">
            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col border-r transition-transform duration-300 md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                    <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, #4057f0, #6080f8)' }}>
                            <FileText className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-bold text-white text-sm">DocKnowledge</span>
                    </Link>
                    <button onClick={() => setSidebarOpen(false)} className="md:hidden text-white/40 hover:text-white">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    <Link href="/dashboard"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white"
                        style={{ background: 'rgba(64,87,240,0.15)' }}>
                        <FileText className="w-4 h-4 text-brand-400" /> Documents
                    </Link>
                    <Link href="/chat"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors">
                        <MessageSquare className="w-4 h-4" /> Ask Questions
                    </Link>
                </nav>

                <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-brand-500/20">
                            <User2 className="w-4 h-4 text-brand-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
                            <p className="text-xs text-white/40 truncate">{user?.email}</p>
                        </div>
                        <button onClick={handleLogout} title="Sign out"
                            className="text-white/30 hover:text-red-400 transition-colors">
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Mobile overlay */}
            {sidebarOpen && (
                <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Main */}
            <main className="flex-1 md:ml-64 min-h-screen">
                {/* Top bar */}
                <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 border-b"
                    style={{ background: 'rgba(10,11,15,0.9)', backdropFilter: 'blur(20px)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSidebarOpen(true)} className="md:hidden text-white/60 hover:text-white">
                            <Menu className="w-5 h-5" />
                        </button>
                        <h1 className="text-lg font-semibold text-white">Documents</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={loadDocuments} className="btn-secondary text-sm">
                            <RefreshCw className="w-3.5 h-3.5" /> Refresh
                        </button>
                        <Link href="/chat" className={`btn-primary text-sm ${readyDocs.length === 0 ? 'opacity-40 pointer-events-none' : ''}`}>
                            <MessageSquare className="w-4 h-4" /> Ask Questions
                            <ChevronRight className="w-3 h-3" />
                        </Link>
                    </div>
                </header>

                <div className="p-6 max-w-5xl mx-auto">
                    {/* Upload area */}
                    <div className="mb-6">
                        <div
                            onClick={() => !uploading && fileInputRef.current?.click()}
                            className="group border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200"
                            style={{ borderColor: uploading ? 'rgba(64,87,240,0.5)' : 'rgba(255,255,255,0.1)' }}
                            onMouseEnter={e => { if (!uploading) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(64,87,240,0.5)' }}
                            onMouseLeave={e => { if (!uploading) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)' }}>
                            <div className="flex flex-col items-center gap-3">
                                {uploading ? (
                                    <>
                                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                                            style={{ background: 'rgba(64,87,240,0.2)' }}>
                                            <RefreshCw className="w-5 h-5 text-brand-400 animate-spin" />
                                        </div>
                                        <p className="text-white font-medium">Uploading...</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center transition-colors"
                                            style={{ background: 'rgba(64,87,240,0.1)' }}>
                                            <FileUp className="w-5 h-5 text-brand-400" />
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">Click to upload a document</p>
                                            <p className="text-sm text-white/40 mt-1">PDF or TXT · Max 20 MB</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <input ref={fileInputRef} type="file" accept=".pdf,.txt,.text" onChange={handleUpload} className="hidden" />
                        {uploadError && (
                            <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />{uploadError}
                            </div>
                        )}
                    </div>

                    {/* Documents list */}
                    {loading ? (
                        <div className="text-center py-20 text-white/30">
                            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
                            <p className="text-sm">Loading documents...</p>
                        </div>
                    ) : documents.length === 0 ? (
                        <div className="text-center py-20">
                            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4"
                                style={{ background: 'rgba(255,255,255,0.04)' }}>
                                <FileText className="w-7 h-7 text-white/20" />
                            </div>
                            <p className="text-white/40 text-sm">No documents yet. Upload one to get started.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-sm text-white/40 mb-4">{documents.length} document{documents.length !== 1 ? 's' : ''}</p>
                            {documents.map(doc => (
                                <div key={doc.id} className="card flex items-center gap-4 p-4 hover:border-white/15 transition-colors">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                        style={{ background: 'rgba(64,87,240,0.12)' }}>
                                        <FileText className="w-4.5 h-4.5 text-brand-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-white truncate">{doc.filename}</p>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-xs text-white/35">{formatFileSize(doc.file_size)}</span>
                                            <span className="text-xs text-white/35">{formatDate(doc.created_at)}</span>
                                            {doc.chunk_count ? <span className="text-xs text-white/35">{doc.chunk_count} chunks</span> : null}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <StatusBadge status={doc.status} />
                                        {doc.status === 'ready' && (
                                            <Link href={`/chat?doc=${doc.id}`} className="btn-secondary text-xs px-3 py-1.5 rounded-lg">
                                                <MessageSquare className="w-3 h-3" /> Chat
                                            </Link>
                                        )}
                                        <button onClick={() => handleDelete(doc.id)} disabled={deletingId === doc.id}
                                            className="btn-danger text-xs px-3 py-1.5 rounded-lg">
                                            {deletingId === doc.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
