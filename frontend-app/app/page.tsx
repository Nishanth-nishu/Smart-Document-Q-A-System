'use client'
import Link from 'next/link'
import { FileText, Zap, Shield, BookOpen, ArrowRight, Search, MessageSquare } from 'lucide-react'

export default function LandingPage() {
    return (
        <div className="relative min-h-screen overflow-hidden">
            {/* Background gradient blobs */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full opacity-10 blur-3xl"
                    style={{ background: 'radial-gradient(circle, #4057f0 0%, transparent 70%)' }} />
                <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full opacity-8 blur-3xl"
                    style={{ background: 'radial-gradient(circle, #6080f8 0%, transparent 70%)' }} />
            </div>

            {/* Nav */}
            <nav className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #4057f0, #6080f8)' }}>
                        <FileText className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-bold text-white">DocKnowledge</span>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/login" className="btn-secondary text-sm">Sign In</Link>
                    <Link href="/register" className="btn-primary text-sm">Get Started</Link>
                </div>
            </nav>

            {/* Hero */}
            <main className="relative z-10 flex flex-col items-center text-center px-6 pt-24 pb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium mb-8 animate-fade-in"
                    style={{ background: 'rgba(64, 87, 240, 0.15)', border: '1px solid rgba(64, 87, 240, 0.3)', color: '#93aeff' }}>
                    <Zap className="w-3 h-3" />
                    Powered by Llama 3.1 · Hybrid RAG · Sentence-Window Retrieval
                </div>

                <h1 className="text-5xl md:text-7xl font-extrabold leading-tight mb-6 animate-slide-up">
                    <span className="brand-glow-text">Ask questions.</span>
                    <br />
                    <span className="text-white/90">Get answers from</span>
                    <br />
                    <span className="text-white/90">your documents.</span>
                </h1>

                <p className="text-lg text-white/50 max-w-xl mb-10 animate-slide-up leading-relaxed">
                    Upload PDFs and text files, then have AI-powered conversations with your documents.
                    Every answer comes with source citations so you know exactly where the information comes from.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 animate-fade-in">
                    <Link href="/register"
                        className="btn-primary text-base px-8 py-3.5 rounded-2xl">
                        Start for free <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link href="/login"
                        className="btn-secondary text-base px-8 py-3.5 rounded-2xl">
                        Sign in
                    </Link>
                </div>

                {/* Feature grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-20 max-w-4xl w-full">
                    {[
                        {
                            icon: <Search className="w-5 h-5 text-brand-400" />,
                            title: 'Hybrid Search',
                            desc: 'BM25 keyword search + vector similarity combined with Reciprocal Rank Fusion for best-in-class retrieval accuracy',
                        },
                        {
                            icon: <BookOpen className="w-5 h-5 text-brand-400" />,
                            title: 'Source Citations',
                            desc: 'Every answer is grounded in your documents with exact page references, so you always know where information came from',
                        },
                        {
                            icon: <Shield className="w-5 h-5 text-brand-400" />,
                            title: 'Data Isolation',
                            desc: 'Your documents are private. Row-level security ensures only you can access your uploaded files and chat history',
                        },
                    ].map((f, i) => (
                        <div key={i} className="card text-left animate-slide-up" style={{ animationDelay: `${i * 0.1}s` }}>
                            <div className="w-10 h-10 rounded-xl mb-4 flex items-center justify-center"
                                style={{ background: 'rgba(64, 87, 240, 0.15)' }}>
                                {f.icon}
                            </div>
                            <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                            <p className="text-sm text-white/45 leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>

                {/* How it works */}
                <div className="mt-20 max-w-3xl w-full">
                    <h2 className="text-3xl font-bold text-white mb-10">How it works</h2>
                    <div className="flex flex-col md:flex-row gap-4">
                        {[
                            { step: '01', title: 'Upload', desc: 'Upload your PDFs or text files — no size limits on what matters' },
                            { step: '02', title: 'Process', desc: 'AI splits documents into smart sentence windows and creates searchable embeddings' },
                            { step: '03', title: 'Ask', desc: 'Type any question and get precise answers with source citations in seconds' },
                        ].map((s) => (
                            <div key={s.step} className="flex-1 card text-left">
                                <span className="brand-glow-text text-4xl font-black">{s.step}</span>
                                <h3 className="font-semibold text-white mt-3 mb-2">{s.title}</h3>
                                <p className="text-sm text-white/45 leading-relaxed">{s.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    )
}
