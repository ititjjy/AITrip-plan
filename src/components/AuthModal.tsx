/**
 * AuthModal.tsx – Login/Register modal that appears when auth is required
 */

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { X, Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react'

export default function AuthModal() {
  const { showAuthModal, authModalMessage, closeAuthModal, login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!showAuthModal) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = mode === 'login'
      ? await login(email, password)
      : await register(email, password, nickname)

    setLoading(false)
    if (!result.success) {
      setError(result.error || '操作失败')
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeAuthModal} />

      {/* Modal */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-float animate-fade-in">
        {/* Close */}
        <button
          onClick={closeAuthModal}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-smooth hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="gradient-hero px-6 pb-6 pt-8">
          <h2 className="text-xl font-bold text-primary-foreground">
            {mode === 'login' ? '欢迎回来' : '创建账号'}
          </h2>
          <p className="mt-1 text-sm text-primary-foreground/80">{authModalMessage}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {mode === 'register' && (
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="昵称"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-4 text-sm transition-smooth focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              placeholder="邮箱地址"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-4 text-sm transition-smooth focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              placeholder="密码（至少6位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-4 text-sm transition-smooth focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl gradient-hero py-3 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {mode === 'login' ? '登录' : '注册'}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          <div className="text-center text-xs text-muted-foreground">
            {mode === 'login' ? (
              <>
                没有账号？
                <button type="button" onClick={() => { setMode('register'); setError('') }} className="ml-1 font-medium text-primary hover:underline">
                  立即注册
                </button>
              </>
            ) : (
              <>
                已有账号？
                <button type="button" onClick={() => { setMode('login'); setError('') }} className="ml-1 font-medium text-primary hover:underline">
                  去登录
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
