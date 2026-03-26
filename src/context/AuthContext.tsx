/**
 * AuthContext.tsx – Authentication state management
 *
 * Manages user login state, JWT token storage (localStorage),
 * and provides login/logout/register functions to the app.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { User } from '@/types'

const API_BASE = '/api'
const TOKEN_KEY = 'trip_planner_token'

interface AuthState {
  user: User | null
  loading: boolean
  /** Show the auth modal (login prompt) */
  showAuthModal: boolean
  /** Message shown in auth modal */
  authModalMessage: string
  /** Callback after successful login from modal */
  authModalCallback: (() => void) | null
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  register: (email: string, password: string, nickname: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  /** Show auth modal with optional message and callback after login */
  requireAuth: (message?: string, onSuccess?: () => void) => boolean
  /** Close auth modal */
  closeAuthModal: () => void
  /** Get auth header for API calls */
  getAuthHeaders: () => Record<string, string>
  /** Send verification code for password reset */
  sendVerifyCode: (email: string) => Promise<{ success: boolean; error?: string }>
  /** Reset password with verification code */
  resetPassword: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; error?: string }>
  /** Update nickname */
  updateNickname: (nickname: string) => Promise<{ success: boolean; error?: string }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    showAuthModal: false,
    authModalMessage: '',
    authModalCallback: null,
  })

  // On mount, check if we have a stored token
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.user) {
            setState((s) => ({ ...s, user: data.user, loading: false }))
          } else {
            localStorage.removeItem(TOKEN_KEY)
            setState((s) => ({ ...s, loading: false }))
          }
        })
        .catch(() => {
          setState((s) => ({ ...s, loading: false }))
        })
    } else {
      setState((s) => ({ ...s, loading: false }))
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (data.success && data.token) {
        localStorage.setItem(TOKEN_KEY, data.token)
        setState((s) => ({ ...s, user: data.user, showAuthModal: false }))
        // Run callback if pending
        if (state.authModalCallback) {
          setTimeout(() => state.authModalCallback?.(), 100)
        }
        return { success: true }
      }
      return { success: false, error: data.message || '登录失败' }
    } catch {
      return { success: false, error: '网络错误' }
    }
  }, [state.authModalCallback])

  const register = useCallback(async (email: string, password: string, nickname: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, nickname }),
      })
      const data = await res.json()
      if (data.success && data.token) {
        localStorage.setItem(TOKEN_KEY, data.token)
        setState((s) => ({ ...s, user: data.user, showAuthModal: false }))
        if (state.authModalCallback) {
          setTimeout(() => state.authModalCallback?.(), 100)
        }
        return { success: true }
      }
      return { success: false, error: data.message || '注册失败' }
    } catch {
      return { success: false, error: '网络错误' }
    }
  }, [state.authModalCallback])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setState((s) => ({ ...s, user: null }))
  }, [])

  const requireAuth = useCallback((message?: string, onSuccess?: () => void): boolean => {
    if (state.user) return true
    setState((s) => ({
      ...s,
      showAuthModal: true,
      authModalMessage: message || '请先登录账号',
      authModalCallback: onSuccess || null,
    }))
    return false
  }, [state.user])

  const closeAuthModal = useCallback(() => {
    setState((s) => ({ ...s, showAuthModal: false, authModalMessage: '', authModalCallback: null }))
  }, [])

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem(TOKEN_KEY)
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const sendVerifyCode = useCallback(async (email: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      return data.success ? { success: true } : { success: false, error: data.message || '发送失败' }
    } catch {
      return { success: false, error: '网络错误' }
    }
  }, [])

  const resetPassword = useCallback(async (email: string, code: string, newPassword: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword }),
      })
      const data = await res.json()
      return data.success ? { success: true } : { success: false, error: data.message || '重置失败' }
    } catch {
      return { success: false, error: '网络错误' }
    }
  }, [])

  const updateNickname = useCallback(async (nickname: string) => {
    try {
      const token = localStorage.getItem(TOKEN_KEY)
      const res = await fetch(`${API_BASE}/auth/nickname`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nickname }),
      })
      const data = await res.json()
      if (data.success) {
        setState((s) => s.user ? { ...s, user: { ...s.user, nickname } } : s)
        return { success: true }
      }
      return { success: false, error: data.message || '更新失败' }
    } catch {
      return { success: false, error: '网络错误' }
    }
  }, [])

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      register,
      logout,
      requireAuth,
      closeAuthModal,
      getAuthHeaders,
      sendVerifyCode,
      resetPassword,
      updateNickname,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
