/**
 * ProfilePage.tsx – 个人中心页面
 * 包含四个模块：我的行程、我的预订、我的游记、账号管理
 */

import { useState, useEffect, useCallback, type ElementType } from 'react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { TripSummary, Booking } from '@/types'
import {
  ArrowLeft, MapPin, Calendar, BookOpen, Settings, Trash2, Globe, Lock,
  Loader2, Eye, MessageSquare, MessageSquareOff, ChevronRight, Mail,
  KeyRound, Shield, User as UserIcon, Pencil, Check, X, Hotel,
  Clock, Phone, BedDouble, XCircle,
} from 'lucide-react'

type Tab = 'trips' | 'bookings' | 'notes' | 'account'

export default function ProfilePage() {
  const { dispatch } = useApp()
  const { user, logout, getAuthHeaders, sendVerifyCode, resetPassword, updateNickname } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('trips')
  const [trips, setTrips] = useState<TripSummary[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [bookingsLoading, setBookingsLoading] = useState(false)

  const fetchTrips = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/trips', { headers: getAuthHeaders() })
      const data = await res.json()
      if (data.success) setTrips(data.trips)
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  const fetchBookings = useCallback(async () => {
    setBookingsLoading(true)
    try {
      const res = await fetch('/api/bookings', { headers: getAuthHeaders() })
      const data = await res.json()
      if (data.success) {
        setBookings(data.bookings.map((b: any) => ({
          id: b.id,
          hotelId: b.hotel_id,
          hotelName: b.hotel_name,
          hotelAddress: b.hotel_address,
          hotelImage: b.hotel_image,
          roomTypeId: b.room_type_id,
          roomTypeName: b.room_type_name,
          checkIn: b.check_in,
          checkOut: b.check_out,
          nights: b.nights,
          guestName: b.guest_name,
          guestPhone: b.guest_phone,
          guestEmail: b.guest_email,
          totalPrice: b.total_price,
          status: b.status,
          createdAt: b.created_at,
          updatedAt: b.updated_at,
          cityName: b.city_name,
        })))
      }
    } catch { /* ignore */ }
    setBookingsLoading(false)
  }, [getAuthHeaders])

  useEffect(() => {
    if (user) {
      fetchTrips()
      fetchBookings()
    }
  }, [user, fetchTrips, fetchBookings])

  if (!user) {
    dispatch({ type: 'SET_VIEW', payload: 'home' })
    return null
  }

  const publishedTrips = trips.filter((t) => t.isPublished)

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个行程吗？此操作不可撤销。')) return
    await fetch(`/api/trips/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
    fetchTrips()
  }

  const handlePublish = async (id: string) => {
    const res = await fetch(`/api/trips/${id}/publish`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishNote: '' }),
    })
    const data = await res.json()
    if (!data.success && data.error === 'NO_CONTENT') {
      alert(data.message || '请先为行程添加至少一条微游记，才能发布为游记')
      return
    }
    fetchTrips()
  }

  const handleUnpublish = async (id: string) => {
    await fetch(`/api/trips/${id}/unpublish`, { method: 'POST', headers: getAuthHeaders() })
    fetchTrips()
  }

  const handleToggleComments = async (id: string, current: boolean) => {
    await fetch(`/api/trips/${id}/comments-toggle`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ allow: !current }),
    })
    fetchTrips()
  }

  const handleViewTrip = async (tripId: string) => {
    try {
      const res = await fetch(`/api/trips/${tripId}`, { headers: getAuthHeaders() })
      const data = await res.json()
      if (data.success && data.trip?.tripData) {
        const tripData = data.trip.tripData
        dispatch({ type: 'CREATE_TRIP', payload: tripData })
        dispatch({ type: 'SET_ALL_DAYS_ITEMS', payload: { dayItems: tripData.days.map((d: any) => d.items || []) } })
        dispatch({ type: 'SET_SAVED_TRIP_ID', payload: tripId })
        dispatch({ type: 'SET_VIEW', payload: 'overview' })
      }
    } catch { /* ignore */ }
  }

  const handleCancelBooking = async (id: string) => {
    if (!confirm('确定要取消此预订吗？')) return
    try {
      await fetch(`/api/bookings/${id}/cancel`, {
        method: 'PUT',
        headers: getAuthHeaders(),
      })
      fetchBookings()
    } catch { /* ignore */ }
  }

  const tabs: { key: Tab; label: string; icon: ElementType; count?: number }[] = [
    { key: 'trips', label: '我的行程', icon: Calendar, count: trips.length },
    { key: 'bookings', label: '我的预订', icon: Hotel, count: bookings.length },
    { key: 'notes', label: '我的游记', icon: BookOpen, count: publishedTrips.length },
    { key: 'account', label: '账号管理', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="gradient-hero px-4 pb-8 pt-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <button
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'home' })}
            className="mb-6 flex items-center gap-1.5 text-sm text-primary-foreground/80 transition-smooth hover:text-primary-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> 返回首页
          </button>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-foreground/20 text-2xl font-bold text-primary-foreground">
              {user.nickname?.charAt(0)?.toUpperCase() || user.email.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-primary-foreground">{user.nickname || '旅行者'}</h1>
              <p className="text-sm text-primary-foreground/70">{user.email}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl gap-0 px-4 sm:px-6">
          {tabs.map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-smooth sm:px-6 ${
                activeTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {count !== undefined && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {activeTab === 'trips' && (
          <TripList
            trips={trips}
            loading={loading}
            onDelete={handleDelete}
            onPublish={handlePublish}
            onUnpublish={handleUnpublish}
            onToggleComments={handleToggleComments}
            onView={handleViewTrip}
            onCreateNew={() => dispatch({ type: 'SET_VIEW', payload: 'create' })}
          />
        )}
        {activeTab === 'bookings' && (
          <BookingList
            bookings={bookings}
            loading={bookingsLoading}
            onCancel={handleCancelBooking}
          />
        )}
        {activeTab === 'notes' && (
          <NoteList
            notes={publishedTrips}
            loading={loading}
            onUnpublish={handleUnpublish}
            onToggleComments={handleToggleComments}
            onViewNote={(id) => {
              dispatch({ type: 'SET_VIEW', payload: 'note-detail' })
              // Store note ID for viewing
              sessionStorage.setItem('viewNoteId', id)
            }}
          />
        )}
        {activeTab === 'account' && (
          <AccountManagement
            user={user}
            onLogout={() => { logout(); dispatch({ type: 'SET_VIEW', payload: 'home' }) }}
            onSendCode={sendVerifyCode}
            onResetPassword={resetPassword}
            onUpdateNickname={updateNickname}
          />
        )}
      </main>
    </div>
  )
}

/* ═══════════════════════ Trip List ═══════════════════════ */

function TripList({ trips, loading, onDelete, onPublish, onUnpublish, onToggleComments, onView, onCreateNew }: {
  trips: TripSummary[]
  loading: boolean
  onDelete: (id: string) => void
  onPublish: (id: string) => void
  onUnpublish: (id: string) => void
  onToggleComments: (id: string, current: boolean) => void
  onView: (id: string) => void
  onCreateNew: () => void
}) {
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>

  if (trips.length === 0) {
    return (
      <div className="py-16 text-center">
        <Calendar className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
        <h3 className="mb-2 text-lg font-semibold text-foreground">还没有行程</h3>
        <p className="mb-6 text-sm text-muted-foreground">开始创建你的第一个旅行计划吧</p>
        <button onClick={onCreateNew} className="rounded-xl gradient-hero px-6 py-2.5 text-sm font-semibold text-primary-foreground">
          创建新行程
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">共 {trips.length} 个行程</h2>
        <button onClick={onCreateNew} className="rounded-lg gradient-hero px-4 py-2 text-xs font-semibold text-primary-foreground">
          + 新建行程
        </button>
      </div>
      {trips.map((trip) => (
        <div key={trip.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-card transition-smooth hover:shadow-card-hover">
          <div className="flex items-start gap-4 p-4 sm:p-5">
            <div className="flex-1 min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <h3 className="truncate text-base font-semibold text-foreground">{trip.title}</h3>
                {trip.isPublished && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                    <Globe className="h-3 w-3" /> 已发布
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{trip.cityName}</span>
                {trip.startDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{trip.startDate} · {trip.dayCount}天</span>}
                <span>¥{trip.totalBudget}</span>
              </div>
            </div>
            <button onClick={() => onView(trip.id)} className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-smooth hover:bg-primary hover:text-primary-foreground">
              <Eye className="h-3 w-3" /> 查看
            </button>
          </div>
          <div className="flex items-center gap-1 border-t border-border/50 px-4 py-2">
            {!trip.isPublished ? (
              <button onClick={() => onPublish(trip.id)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-smooth hover:bg-emerald-50 hover:text-emerald-600">
                <Globe className="h-3 w-3" /> 发布为游记
              </button>
            ) : (
              <>
                <button onClick={() => onUnpublish(trip.id)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-smooth hover:bg-amber-50 hover:text-amber-600">
                  <Lock className="h-3 w-3" /> 取消发布
                </button>
                <button
                  onClick={() => onToggleComments(trip.id, trip.allowComments)}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-smooth hover:bg-secondary"
                >
                  {trip.allowComments ? <MessageSquare className="h-3 w-3" /> : <MessageSquareOff className="h-3 w-3" />}
                  {trip.allowComments ? '关闭评论' : '开放评论'}
                </button>
              </>
            )}
            <div className="flex-1" />
            <button onClick={() => onDelete(trip.id)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-smooth hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-3 w-3" /> 删除
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════ Note List ═══════════════════════ */

function NoteList({ notes, loading, onUnpublish, onToggleComments, onViewNote }: {
  notes: TripSummary[]
  loading: boolean
  onUnpublish: (id: string) => void
  onToggleComments: (id: string, current: boolean) => void
  onViewNote: (id: string) => void
}) {
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>

  if (notes.length === 0) {
    return (
      <div className="py-16 text-center">
        <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
        <h3 className="mb-2 text-lg font-semibold text-foreground">还没有游记</h3>
        <p className="text-sm text-muted-foreground">将你的行程发布为游记，与其他旅行者分享吧</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">共 {notes.length} 篇游记</h2>
      {notes.map((note) => (
        <div key={note.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center gap-4 p-4 sm:p-5">
            <div className="flex-1 min-w-0">
              <h3 className="mb-1 truncate text-base font-semibold text-foreground">{note.title}</h3>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span><MapPin className="mr-1 inline h-3 w-3" />{note.cityName}</span>
                <span>{note.dayCount}天 · ¥{note.totalBudget}</span>
                <span className="flex items-center gap-1">
                  {note.allowComments ? <MessageSquare className="h-3 w-3 text-emerald-500" /> : <MessageSquareOff className="h-3 w-3 text-muted-foreground" />}
                  {note.allowComments ? '开放评论' : '评论已关闭'}
                </span>
              </div>
            </div>
            <button
              onClick={() => onViewNote(note.id)}
              className="flex items-center gap-1 text-xs font-medium text-primary transition-smooth hover:underline"
            >
              查看 <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center gap-1 border-t border-border/50 px-4 py-2">
            <button
              onClick={() => onToggleComments(note.id, note.allowComments)}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-smooth hover:bg-secondary"
            >
              {note.allowComments ? <MessageSquareOff className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
              {note.allowComments ? '关闭评论' : '开放评论'}
            </button>
            <button onClick={() => onUnpublish(note.id)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-smooth hover:bg-amber-50 hover:text-amber-600">
              <Lock className="h-3 w-3" /> 取消发布
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════ Account Management ═══════════════════════ */

function AccountManagement({ user, onLogout, onSendCode, onResetPassword, onUpdateNickname }: {
  user: { id: number; email: string; nickname: string }
  onLogout: () => void
  onSendCode: (email: string) => Promise<{ success: boolean; error?: string }>
  onResetPassword: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; error?: string }>
  onUpdateNickname: (nickname: string) => Promise<{ success: boolean; error?: string }>
}) {
  const [editNickname, setEditNickname] = useState(false)
  const [newNickname, setNewNickname] = useState(user.nickname)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')
  const [sending, setSending] = useState(false)

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMsg(text)
    setMsgType(type)
    setTimeout(() => setMsg(''), 3000)
  }

  const handleSaveNickname = async () => {
    if (!newNickname.trim()) return
    const result = await onUpdateNickname(newNickname.trim())
    if (result.success) {
      setEditNickname(false)
      showMessage('昵称已更新', 'success')
    } else {
      showMessage(result.error || '更新失败', 'error')
    }
  }

  const handleSendCode = async () => {
    setSending(true)
    const result = await onSendCode(user.email)
    setSending(false)
    if (result.success) {
      setCodeSent(true)
      showMessage('验证码已发送到邮箱（请查看服务器控制台）', 'success')
    } else {
      showMessage(result.error || '发送失败', 'error')
    }
  }

  const handleResetPassword = async () => {
    if (newPassword.length < 6) return showMessage('密码至少需要6位', 'error')
    if (newPassword !== confirmPassword) return showMessage('两次密码不一致', 'error')

    const result = await onResetPassword(user.email, code, newPassword)
    if (result.success) {
      setShowResetPassword(false)
      setCode('')
      setNewPassword('')
      setConfirmPassword('')
      setCodeSent(false)
      showMessage('密码已重置', 'success')
    } else {
      showMessage(result.error || '重置失败', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          msgType === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-destructive/10 text-destructive'
        }`}>
          {msg}
        </div>
      )}

      {/* Profile Info */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
          <UserIcon className="h-4 w-4 text-primary" /> 个人信息
        </h3>

        <div className="space-y-4">
          {/* Email */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-medium text-muted-foreground">邮箱</label>
              <p className="flex items-center gap-2 text-sm text-foreground">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {user.email}
              </p>
            </div>
          </div>

          {/* Nickname */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">昵称</label>
              {editNickname ? (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    value={newNickname}
                    onChange={(e) => setNewNickname(e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                    autoFocus
                  />
                  <button onClick={handleSaveNickname} className="rounded-lg bg-primary p-1.5 text-primary-foreground"><Check className="h-3.5 w-3.5" /></button>
                  <button onClick={() => { setEditNickname(false); setNewNickname(user.nickname) }} className="rounded-lg bg-secondary p-1.5 text-secondary-foreground"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-foreground">
                  {user.nickname}
                  <button onClick={() => setEditNickname(true)} className="text-muted-foreground transition-smooth hover:text-primary"><Pencil className="h-3 w-3" /></button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Password Reset */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
          <Shield className="h-4 w-4 text-primary" /> 安全设置
        </h3>

        {!showResetPassword ? (
          <button
            onClick={() => setShowResetPassword(true)}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm text-foreground transition-smooth hover:bg-secondary"
          >
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            修改密码
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              验证码将发送到 <span className="font-medium text-foreground">{user.email}</span>
            </p>

            <div className="flex items-center gap-2">
              <input
                placeholder="输入验证码"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <button
                onClick={handleSendCode}
                disabled={sending || codeSent}
                className="whitespace-nowrap rounded-lg bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground transition-smooth hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : codeSent ? '已发送' : '发送验证码'}
              </button>
            </div>

            <input
              type="password"
              placeholder="新密码（至少6位）"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <input
              type="password"
              placeholder="确认新密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />

            <div className="flex gap-2">
              <button onClick={handleResetPassword} className="rounded-lg gradient-hero px-4 py-2 text-xs font-semibold text-primary-foreground">
                确认修改
              </button>
              <button onClick={() => { setShowResetPassword(false); setCode(''); setNewPassword(''); setConfirmPassword(''); setCodeSent(false) }} className="rounded-lg bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground">
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={onLogout}
        className="w-full rounded-xl border border-destructive/20 bg-destructive/5 py-3 text-sm font-medium text-destructive transition-smooth hover:bg-destructive/10"
      >
        退出登录
      </button>
    </div>
  )
}

/* ═══════════════════════ Booking List ═══════════════════════ */

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: '待确认', color: 'text-amber-600', bgColor: 'bg-amber-50' },
  confirmed: { label: '已确认', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  'checked-in': { label: '已入住', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  completed: { label: '已完成', color: 'text-muted-foreground', bgColor: 'bg-secondary' },
  cancelled: { label: '已取消', color: 'text-destructive', bgColor: 'bg-destructive/5' },
}

function BookingList({ bookings, loading, onCancel }: {
  bookings: Booking[]
  loading: boolean
  onCancel: (id: string) => void
}) {
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>

  if (bookings.length === 0) {
    return (
      <div className="py-16 text-center">
        <Hotel className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
        <h3 className="mb-2 text-lg font-semibold text-foreground">还没有预订</h3>
        <p className="text-sm text-muted-foreground">在行程规划中预订酒店后，订单将会出现在这里</p>
      </div>
    )
  }

  const activeBookings = bookings.filter(b => b.status !== 'cancelled' && b.status !== 'completed')
  const pastBookings = bookings.filter(b => b.status === 'cancelled' || b.status === 'completed')

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">共 {bookings.length} 个预订</h2>

      {/* Active bookings */}
      {activeBookings.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">进行中</p>
          {activeBookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} onCancel={onCancel} />
          ))}
        </div>
      )}

      {/* Past bookings */}
      {pastBookings.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">历史订单</p>
          {pastBookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} onCancel={onCancel} />
          ))}
        </div>
      )}
    </div>
  )
}

function BookingCard({ booking, onCancel }: { booking: Booking; onCancel: (id: string) => void }) {
  const statusCfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending
  const canCancel = booking.status === 'pending' || booking.status === 'confirmed'
  const isPast = booking.status === 'cancelled' || booking.status === 'completed'

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-card shadow-card transition-smooth hover:shadow-card-hover ${isPast ? 'opacity-70' : ''}`}>
      <div className="flex gap-4 p-4 sm:p-5">
        {/* Hotel image */}
        {booking.hotelImage ? (
          <img
            src={booking.hotelImage}
            alt={booking.hotelName}
            className="h-20 w-28 shrink-0 rounded-lg object-cover sm:h-24 sm:w-32"
          />
        ) : (
          <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-secondary text-2xl sm:h-24 sm:w-32">
            🏨
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-foreground">{booking.hotelName}</h3>
              {booking.cityName && (
                <span className="text-[10px] text-muted-foreground">{booking.cityName}</span>
              )}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusCfg.bgColor} ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <BedDouble className="h-3 w-3" />
              <span>{booking.roomTypeName}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{formatDate(booking.checkIn)} - {formatDate(booking.checkOut)} · {booking.nights}晚</span>
            </div>
            <div className="flex items-center gap-1">
              <UserIcon className="h-3 w-3" />
              <span>{booking.guestName}</span>
              <span className="mx-1">·</span>
              <Phone className="h-3 w-3" />
              <span>{booking.guestPhone}</span>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-baseline gap-0.5">
              <span className="text-lg font-bold text-primary">¥{booking.totalPrice}</span>
              <span className="text-[10px] text-muted-foreground">总价</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {new Date(booking.createdAt).toLocaleDateString('zh-CN')} 下单
              </span>
              {canCancel && (
                <button
                  onClick={() => onCancel(booking.id)}
                  className="flex items-center gap-1 rounded-lg border border-destructive/20 px-2.5 py-1 text-[10px] font-medium text-destructive transition-smooth hover:bg-destructive/5"
                >
                  <XCircle className="h-3 w-3" />
                  取消预订
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Booking ID footer */}
      <div className="border-t border-border/50 bg-secondary/30 px-4 py-1.5 sm:px-5">
        <span className="text-[10px] text-muted-foreground">订单号: {booking.id}</span>
      </div>
    </div>
  )
}
