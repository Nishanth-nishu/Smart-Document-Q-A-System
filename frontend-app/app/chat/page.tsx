'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
    FileText, MessageSquare, Send, Loader2, User2, Bot, ChevronDown,
    ExternalLink, LogOut, Menu, X, BookOpen, Copy, CheckCheck
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import * as api from '@/lib/api'
import type { Document, SourceCitation } from '@/lib/api'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    sources?: SourceCitation[]
    loading?: boolean
}

function CitationCard({ source, index }: { source: SourceCitation; index: number }) {
    const [open, setOpen] = useState(false)
    return (
        <div className="rounded-xl overflow-hidden border transition-all"
            style={{ borderColor: open ? 'rgba(64,87,240,0.4)' : 'rgba(255,255,255,0.08)' }}>
            <button onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-white/5 transition-colors">
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-brand-400"
                    style={{ background: 'rgba(64,87,240,0.2)' }}>
                    {index}
                </span>
                <div className="flex-1 min-w-0">
                    <span className="font-medium text-white/80 truncate block">{source.filename}</span>
                    {source.page_number && (
                        <span className="text-xs text-white/35">Page {source.page_number}</span>
                    )}
                </div>
                {source.relevance_score !== undefined && (
                    <span className="text-xs text-white/30 flex-shrink-0">
                        {(source.relevance_score * 100).toFixed(1)}% match
                    </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 text-white/30 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="px-4 pb-4 text-sm text-white/50 leading-relaxed border-t"
                    style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
                    <p className="mt-3 italic">&ldquo;{source.chunk_text}&rdquo;</p>
                </div>
            )}
        </div>
    )
}

function MessageBubble({ msg }: { msg: Message }) {
    const [copied, setCopied] = useState(false)
    const isUser = msg.role === 'user'

    function handleCopy() {
        navigator.clipboard.writeText(msg.content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className={`flex gap-3 animate-slide-up ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-brand-500/25' : 'bg-white/6'}`}>
                {isUser
                    ? <User2 className="w-4 h-4 text-brand-400" />
                    : <Bot className="w-4 h-4 text-white/50" />
                }
            </div>

            <div className={`flex-1 max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
                {/* Bubble */}
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${isUser
                    ? 'text-white rounded-tr-none'
                    : 'text-white/85 rounded-tl-none'
                    }`}
                    style={isUser
                        ? { background: 'linear-gradient(135deg, #4057f0, #5065e8)' }
                        : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }
                    }>
                    {msg.loading ? (
                        <div className="flex items-center gap-2 text-white/50">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-xs">Searching documents...</span>
                        </div>
                    ) : (
                        <div className="markdown-content">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                    ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
                                    ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
                                    li: ({ children }) => <li className="mb-1">{children}</li>,
                                    code: ({ node, ...props }) => (
                                        <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                                            {props.children}
                                        </code>
                                    ),
                                    pre: ({ node, ...props }) => (
                                        <pre className="bg-white/5 p-3 rounded-xl overflow-x-auto text-xs font-mono my-2 border border-white/10" {...props}>
                                            {props.children}
                                        </pre>
                                    )
                                }}
                            >
                                {msg.content}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>

                {/* Copy button for assistant messages */}
                {!isUser && !msg.loading && (
                    <button onClick={handleCopy}
                        className="flex items-center gap-1.5 text-xs text-white/25 hover:text-white/50 transition-colors">
                        {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                )}

                {/* Sources */}
                {!msg.loading && msg.sources && msg.sources.length > 0 && (
                    <div className="w-full mt-1">
                        <div className="flex items-center gap-2 mb-2">
                            <BookOpen className="w-3.5 h-3.5 text-white/30" />
                            <span className="text-xs text-white/30 font-medium">
                                {msg.sources.length} source{msg.sources.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <div className="space-y-2">
                            {msg.sources.map((s, i) => (
                                <CitationCard key={`${s.document_id}-${i}`} source={s} index={i + 1} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function ChatContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const focusDocId = searchParams.get('doc')
    const bottomRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const [user, setUser] = useState<api.User | null>(null)
    const [documents, setDocuments] = useState<Document[]>([])
    const [selectedDocs, setSelectedDocs] = useState<string[]>([])
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(false)

    const loadData = useCallback(async () => {
        try {
            const [me, docsRes] = await Promise.all([api.getMe(), api.listDocuments()])
            setUser(me)
            const readyDocs = docsRes.documents.filter(d => d.status === 'ready')
            setDocuments(readyDocs)
            if (focusDocId) {
                setSelectedDocs([focusDocId])
            }
        } catch { /* handled globally */ }
    }, [focusDocId])

    useEffect(() => {
        const token = api.getToken()
        if (!token) { router.push('/login'); return }
        loadData()
    }, [router, loadData])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    function toggleDoc(id: string) {
        setSelectedDocs(prev =>
            prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
        )
    }

    async function handleSend() {
        if (!input.trim() || sending) return
        const question = input.trim()
        setInput('')
        setSending(true)

        const userMsg: Message = { id: Date.now().toString(), role: 'user', content: question }
        const placeholderMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: '', loading: true }
        setMessages(prev => [...prev, userMsg, placeholderMsg])

        try {
            const res = await api.askQuestion(
                question,
                selectedDocs.length > 0 ? selectedDocs : undefined,
            )
            setMessages(prev => prev.map(m =>
                m.id === placeholderMsg.id
                    ? { ...m, content: res.answer, sources: res.sources, loading: false }
                    : m
            ))
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to get an answer. Please try again.'
            setMessages(prev => prev.map(m =>
                m.id === placeholderMsg.id
                    ? { ...m, content: `❌ ${errorMsg}`, loading: false }
                    : m
            ))
        } finally {
            setSending(false)
            textareaRef.current?.focus()
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <div className="min-h-screen flex">
            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 z-40 w-72 flex flex-col border-r transition-transform duration-300 md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
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

                <nav className="p-4 space-y-1 border-b" style={{ borderColor: 'var(--border)' }}>
                    <Link href="/dashboard"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors">
                        <FileText className="w-4 h-4" /> Documents
                    </Link>
                    <Link href="/chat"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white"
                        style={{ background: 'rgba(64,87,240,0.15)' }}>
                        <MessageSquare className="w-4 h-4 text-brand-400" /> Ask Questions
                    </Link>
                </nav>

                {/* Document filter */}
                <div className="flex-1 p-4 overflow-y-auto">
                    <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">Filter by document</p>
                    {documents.length === 0 ? (
                        <div className="text-center py-6">
                            <p className="text-xs text-white/30">No ready documents.</p>
                            <Link href="/dashboard" className="text-xs text-brand-400 hover:text-brand-300 mt-1 block">Upload one →</Link>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <button
                                onClick={() => setSelectedDocs([])}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors text-left ${selectedDocs.length === 0 ? 'text-white bg-white/10' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
                                <span className="text-xs font-medium">All documents</span>
                            </button>
                            {documents.map(doc => (
                                <button key={doc.id}
                                    onClick={() => toggleDoc(doc.id)}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors text-left ${selectedDocs.includes(doc.id) ? 'text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                                    style={selectedDocs.includes(doc.id) ? { background: 'rgba(64,87,240,0.15)' } : {}}>
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedDocs.includes(doc.id) ? 'bg-brand-400' : 'bg-white/20'}`} />
                                    <span className="truncate text-xs">{doc.filename}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-brand-500/20">
                            <User2 className="w-4 h-4 text-brand-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
                            <p className="text-xs text-white/40 truncate">{user?.email}</p>
                        </div>
                        <button onClick={() => { api.removeToken(); router.push('/login') }} title="Sign out"
                            className="text-white/30 hover:text-red-400 transition-colors">
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </aside>

            {sidebarOpen && (
                <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Chat main */}
            <main className="flex-1 md:ml-72 flex flex-col h-screen">
                {/* Top bar */}
                <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b"
                    style={{ background: 'rgba(10,11,15,0.9)', backdropFilter: 'blur(20px)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSidebarOpen(true)} className="md:hidden text-white/60 hover:text-white">
                            <Menu className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-base font-semibold text-white">Ask Questions</h1>
                            <p className="text-xs text-white/35">
                                {selectedDocs.length === 0
                                    ? `Searching all ${documents.length} document${documents.length !== 1 ? 's' : ''}`
                                    : `Searching ${selectedDocs.length} selected document${selectedDocs.length !== 1 ? 's' : ''}`
                                }
                            </p>
                        </div>
                    </div>
                    <Link href="/dashboard" className="btn-secondary text-sm">
                        <ExternalLink className="w-3.5 h-3.5" /> Documents
                    </Link>
                </header>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full py-16 animate-fade-in">
                            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                                style={{ background: 'rgba(64,87,240,0.12)' }}>
                                <MessageSquare className="w-7 h-7 text-brand-400" />
                            </div>
                            <h2 className="text-xl font-semibold text-white mb-2">Start asking questions</h2>
                            <p className="text-sm text-white/40 max-w-sm text-center leading-relaxed">
                                Ask anything about your uploaded documents. I&apos;ll find the answer and show you which sources it came from.
                            </p>
                            {documents.length === 0 && (
                                <Link href="/dashboard" className="btn-primary mt-6 text-sm">
                                    Upload documents first
                                </Link>
                            )}
                            {/* Suggested questions */}
                            {documents.length > 0 && (
                                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                                    {[
                                        'What is this document about?',
                                        'Summarize the key points',
                                        'What are the main conclusions?',
                                        'What topics are covered?',
                                    ].map(q => (
                                        <button key={q} onClick={() => setInput(q)}
                                            className="text-left px-4 py-3 rounded-xl text-sm text-white/50 hover:text-white transition-all hover:-translate-y-0.5"
                                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="flex-shrink-0 px-4 md:px-8 py-4 border-t" style={{ borderColor: 'var(--border)', background: 'rgba(10,11,15,0.95)' }}>
                    <div className="flex items-end gap-3 rounded-2xl p-2 border"
                        style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(64,87,240,0.2)' }}>
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask a question about your documents... (Enter to send)"
                            rows={1}
                            disabled={sending || documents.length === 0}
                            className="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-none resize-none px-3 py-2 leading-relaxed"
                            style={{ maxHeight: '120px' }}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || sending || documents.length === 0}
                            className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                            style={input.trim() && !sending
                                ? { background: 'linear-gradient(135deg, #4057f0, #6080f8)', boxShadow: '0 0 15px rgba(64,87,240,0.3)' }
                                : { background: 'rgba(255,255,255,0.06)' }}>
                            {sending
                                ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                                : <Send className="w-4 h-4 text-white" />
                            }
                        </button>
                    </div>
                    <p className="text-center text-xs text-white/20 mt-2">
                        Powered by Llama 3.1 via OpenRouter · Hybrid RAG · Sentence-Window Retrieval
                    </p>
                </div>
            </main>
        </div>
    )
}

export default function ChatPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-white/30" />
            </div>
        }>
            <ChatContent />
        </Suspense>
    )
}
