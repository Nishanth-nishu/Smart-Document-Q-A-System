'use client'
import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import * as api from '@/lib/api'

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPass, setShowPass] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const data = await api.login(email, password)
            api.setToken(data.access_token)
            api.setStoredUser({ id: data.user_id, email: data.email, name: data.name })
            router.push('/dashboard')
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4 relative">
            {/* Background blobs */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full opacity-10 blur-3xl"
                    style={{ background: 'radial-gradient(circle, #4057f0 0%, transparent 70%)' }} />
            </div>

            <div className="relative w-full max-w-md">
                {/* Logo */}
                <Link href="/" className="flex items-center justify-center gap-2 mb-8">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #4057f0, #6080f8)' }}>
                        <FileText className="w-4.5 h-4.5 text-white" />
                    </div>
                    <span className="text-xl font-bold text-white">DocKnowledge</span>
                </Link>

                <div className="card animate-slide-up">
                    <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
                    <p className="text-sm text-white/45 mb-8">Sign in to your account to continue</p>

                    {error && (
                        <div className="mb-5 px-4 py-3 rounded-xl text-sm text-red-400 border border-red-400/20"
                            style={{ background: 'rgba(239,68,68,0.08)' }}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-white/60 mb-1.5">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="input pl-11"
                                    placeholder="you@example.com"
                                    required
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-white/60 mb-1.5">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="input pl-11 pr-11"
                                    placeholder="••••••••"
                                    required
                                    autoComplete="current-password"
                                />
                                <button type="button" onClick={() => setShowPass(!showPass)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                            {loading ? 'Signing in...' : 'Sign in'}
                        </button>
                    </form>

                    <p className="text-center text-sm text-white/40 mt-6">
                        Don&apos;t have an account?{' '}
                        <Link href="/register" className="text-brand-400 hover:text-brand-300 transition-colors font-medium">
                            Create one
                        </Link>
                    </p>
                </div>

                {/* Demo credentials */}
                <div className="mt-4 p-4 rounded-xl text-sm text-center text-white/40"
                    style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                    <span className="font-medium text-white/60">Demo: </span>
                    test@docknowledge.app / Demo1234!
                </div>
            </div>
        </div>
    )
}
