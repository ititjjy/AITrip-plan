/**
 * NoteDetailPage.tsx – Published travel journal (图文游记)
 *
 * Design: Magazine/blog article style, NOT a schedule/itinerary.
 * - Immersive hero with city image
 * - Author card as byline
 * - Micro-notes are the PRIMARY content (text + images + mood)
 * - POIs without notes appear as subtle location breadcrumbs
 * - Day separators feel like chapter breaks
 * - Comments as social engagement at the end
 */

import { useState, useEffect, useMemo } from 'react'
import { useApp } from '@/context/AppContext'
import { displayName } from '@/utils/poiName'
import { useAuth } from '@/context/AuthContext'
import { TravelNoteDetail, Comment, Trip, MicroNote, NoteMood } from '@/types'
import { popularCities, getAllAttractions, getAttractionTypeIcon } from '@/data/mock-data'
import {
  ArrowLeft, MapPin, Calendar,
  MessageSquare, Send, Loader2, Trash2,
  BookOpen, Heart, ChevronDown,
} from 'lucide-react'
import ImageGrid from '@/components/ImageGrid'

/* ── Mood labels ── */
const moodLabels: Record<NoteMood, string> = {
  '😊': '开心', '🤩': '惊喜', '😋': '好吃', '🥰': '喜欢', '😌': '治愈',
  '🎉': '兴奋', '📸': '打卡', '🌅': '感动', '❄️': '清凉', '🌸': '浪漫',
}

function relativeTime(ts: number): string {
  const d = new Date(ts)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  if (diff < 2592000_000) return `${Math.floor(diff / 86400_000)} 天前`
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function NoteDetailPage() {
  const { dispatch } = useApp()
  const { user, requireAuth, getAuthHeaders } = useAuth()
  const [note, setNote] = useState<TravelNoteDetail | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [tripData, setTripData] = useState<Trip | null>(null)
  const [microNotes, setMicroNotes] = useState<MicroNote[]>([])
  const [showComments, setShowComments] = useState(false)

  const noteId = sessionStorage.getItem('viewNoteId')

  useEffect(() => {
    if (!noteId) return
    fetchNote()
    fetchComments()
    fetchMicroNotes()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  const fetchNote = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/notes/${noteId}`, { headers: getAuthHeaders() })
      const data = await res.json()
      if (data.success) {
        setNote(data.note)
        try { setTripData(JSON.parse(data.note.tripData)) } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/notes/${noteId}/comments`)
      const data = await res.json()
      if (data.success) setComments(data.comments)
    } catch { /* ignore */ }
  }

  const fetchMicroNotes = async () => {
    if (!noteId) return
    try {
      const res = await fetch(`/api/trips/${noteId}/micro-notes`)
      const data = await res.json()
      if (data.success) setMicroNotes(data.data || [])
    } catch { /* ignore */ }
  }

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return
    if (!requireAuth('登录后即可评论')) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/notes/${noteId}/comments`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setComments((prev) => [data.comment, ...prev])
        setNewComment('')
      }
    } catch { /* ignore */ }
    setSubmitting(false)
  }

  const handleDeleteComment = async (cid: number) => {
    await fetch(`/api/notes/${noteId}/comments/${cid}`, { method: 'DELETE', headers: getAuthHeaders() })
    setComments((prev) => prev.filter((c) => c.id !== cid))
  }

  /* ── Derived data ── */
  const allAttractions = useMemo(
    () => (tripData ? getAllAttractions(tripData.cityId) : []),
    [tripData],
  )
  const city = tripData ? popularCities.find(c => c.id === tripData.cityId) : null

  /** Build a narrative-style timeline: interleave POI markers with micro-notes */
  const journalSections = useMemo(() => {
    if (!tripData?.days) return []

    return tripData.days.map((day, idx) => {
      const dayNumber = idx + 1
      const dayNotes = microNotes.filter(n => n.dayNumber === dayNumber)

      // Build items: for each POI, pair it with its notes
      const entries: Array<{
        type: 'poi-with-notes'
        poiId: string
        poiName: string
        poiType: string
        poiIcon: string
        notes: MicroNote[]
      } | {
        type: 'orphan-notes'
        notes: MicroNote[]
      }> = []

      // Map notes to POIs
      const usedNoteIds = new Set<string>()

      for (const item of day.items) {
        const attraction = allAttractions.find(a => a.id === item.attractionId)
        const name = displayName(attraction, item.attractionId)
        const poiNotes = dayNotes.filter(n => n.poiId === item.attractionId)
        poiNotes.forEach(n => usedNoteIds.add(n.id))

        entries.push({
          type: 'poi-with-notes',
          poiId: item.attractionId,
          poiName: name,
          poiType: item.type,
          poiIcon: getAttractionTypeIcon(item.type),
          notes: poiNotes,
        })
      }

      // Any notes not matched to POI items
      const orphanNotes = dayNotes.filter(n => !usedNoteIds.has(n.id))
      if (orphanNotes.length > 0) {
        entries.push({ type: 'orphan-notes', notes: orphanNotes })
      }

      return { dayNumber, date: day.date, entries }
    })
  }, [tripData, microNotes, allAttractions])

  const totalNotes = microNotes.length
  const formatDateShort = (d: string) =>
    new Date(d).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })

  /* ── Loading / Error states ── */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-journal" />
      </div>
    )
  }
  if (!note) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <BookOpen className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-lg text-foreground">游记不存在或已被删除</p>
        <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'travel-notes' })} className="text-sm text-primary hover:underline">
          返回游记列表
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ═══ Immersive Hero ═══ */}
      <div className="relative h-64 overflow-hidden sm:h-80">
        {city ? (
          <img src={city.image} alt={note.cityName} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full gradient-journal" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/30 to-foreground/5" />

        {/* Back button */}
        <button
          onClick={() => dispatch({ type: 'SET_VIEW', payload: 'travel-notes' })}
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-card/15 text-primary-foreground backdrop-blur-md transition-all hover:bg-card/30 sm:left-6 sm:top-6"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {/* Title overlay */}
        <div className="absolute inset-x-0 bottom-0 px-5 pb-6 sm:px-8 sm:pb-8">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex items-center gap-1 rounded-full gradient-journal px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground tracking-wide uppercase">
                <BookOpen className="h-3 w-3" />
                旅行游记
              </span>
              {totalNotes > 0 && (
                <span className="rounded-full bg-card/15 backdrop-blur-md px-2 py-0.5 text-[10px] text-primary-foreground/80">
                  {totalNotes} 篇记录
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-primary-foreground leading-tight sm:text-3xl">
              {note.title}
            </h1>
            <div className="mt-2 flex items-center gap-3 text-xs text-primary-foreground/70 sm:text-sm">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {note.cityName}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {tripData?.days?.length || note.dayCount} 天
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Article Body ═══ */}
      <main className="mx-auto max-w-2xl px-5 sm:px-8">

        {/* Author byline */}
        <div className="-mt-5 relative z-10 mb-8 flex items-center gap-3 rounded-2xl border border-border/50 bg-card p-4 shadow-note sm:mb-10 sm:p-5">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-journal-light text-sm font-bold text-journal sm:h-12 sm:w-12">
            {note.authorAvatar ? (
              <img src={note.authorAvatar} alt="" className="h-full w-full object-cover" />
            ) : (
              note.authorName?.charAt(0) || '?'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground sm:text-base">{note.authorName}</p>
            <p className="text-[11px] text-muted-foreground sm:text-xs">{relativeTime(note.updatedAt)}</p>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
            <Heart className="h-3 w-3" />
            游记
          </div>
        </div>

        {/* Publish intro / editor's note */}
        {note.publishNote && (
          <div className="mb-8 sm:mb-10">
            <p className="text-base leading-relaxed text-foreground/85 sm:text-[17px] sm:leading-relaxed">
              {note.publishNote}
            </p>
          </div>
        )}

        {/* ═══ Day-by-day narrative ═══ */}
        {journalSections.map((section) => {
          // Only show days that have actual content (notes)
          const hasContent = section.entries.some(e => e.notes.length > 0)
          if (!hasContent) return null

          return (
            <div key={section.dayNumber} className="mb-10 sm:mb-14">
              {/* Chapter heading */}
              <div className="mb-6 flex items-center gap-4 sm:mb-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-journal text-sm font-bold text-primary-foreground shadow-sm sm:h-11 sm:w-11">
                  {section.dayNumber}
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-foreground sm:text-xl">
                    Day {section.dayNumber}
                  </h2>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    {formatDateShort(section.date)}
                  </p>
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
              </div>

              {/* Entries — only show POIs that have micro-notes */}
              <div className="space-y-6 sm:space-y-8">
                {section.entries.map((entry, ei) => {
                  // Skip entries with no notes (no more "到此一游" clutter)
                  if (entry.notes.length === 0) return null

                  if (entry.type === 'orphan-notes') {
                    return entry.notes.map(mn => (
                      <JournalNoteBlock key={mn.id} note={mn} />
                    ))
                  }

                  // POI with notes — show location marker + note content
                  return (
                    <div key={`${entry.poiId}-${ei}`}>
                      {/* Location marker — subtle, editorial */}
                      <div className="mb-3 flex items-center gap-2">
                        <span className="text-base">{entry.poiIcon}</span>
                        <span className="text-sm font-semibold text-foreground">{entry.poiName}</span>
                        <div className="h-px flex-1 bg-border/50" />
                      </div>

                      <div className="space-y-5">
                        {entry.notes.map(mn => (
                          <JournalNoteBlock key={mn.id} note={mn} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Empty state when no notes at all */}
        {totalNotes === 0 && tripData?.days && (
          <div className="flex flex-col items-center py-16 text-center">
            <BookOpen className="mb-4 h-12 w-12 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">作者还没有添加旅行记录</p>
          </div>
        )}

        {/* ═══ Comments ═══ */}
        <div className="border-t border-border py-8">
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex w-full items-center justify-between rounded-xl px-1 py-2 text-left"
          >
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground sm:text-lg">
              <MessageSquare className="h-4.5 w-4.5 text-primary" />
              评论 ({comments.length})
            </h3>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showComments ? 'rotate-180' : ''}`} />
          </button>

          {showComments && note.allowComments && (
            <div className="mt-4 animate-fade-in">
              {/* Input */}
              <div className="mb-6 flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-journal-light text-xs font-bold text-journal">
                  {user ? user.nickname.charAt(0) : '?'}
                </div>
                <div className="flex-1">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={user ? '写下你的评论...' : '登录后即可评论'}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm transition-smooth focus:border-journal focus:outline-none focus:ring-2 focus:ring-journal/20"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={handleSubmitComment}
                      disabled={submitting || !newComment.trim()}
                      className="flex items-center gap-1.5 rounded-lg gradient-journal px-4 py-2 text-xs font-semibold text-primary-foreground transition-smooth disabled:opacity-50"
                    >
                      {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      发表
                    </button>
                  </div>
                </div>
              </div>

              {/* List */}
              <div className="space-y-4">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                      {c.nickname.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{c.nickname}</span>
                        <span className="text-[10px] text-muted-foreground">{relativeTime(c.created_at)}</span>
                        {(user?.id === c.user_id || note.isOwner) && (
                          <button
                            onClick={() => handleDeleteComment(c.id)}
                            className="ml-auto text-muted-foreground transition-smooth hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{c.content}</p>
                    </div>
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">还没有评论，来说点什么吧</p>
                )}
              </div>
            </div>
          )}

          {showComments && !note.allowComments && (
            <p className="mt-4 py-6 text-center text-sm text-muted-foreground">作者已关闭评论功能</p>
          )}
        </div>
      </main>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
 * JournalNoteBlock — A single micro-note rendered in article style
 * Content-first, no card border, flows like blog text + images
 * ════════════════════════════════════════════════════════════ */
function JournalNoteBlock({ note }: { note: MicroNote }) {
  return (
    <article className="group">
      {/* Mood tag if present */}
      {note.mood && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-journal-light px-2.5 py-1 text-xs font-medium text-journal">
            <span className="text-sm">{note.mood}</span>
            {moodLabels[note.mood as NoteMood] || ''}
          </span>
        </div>
      )}

      {/* Text content — Article paragraph style */}
      <p className="text-[15px] leading-[1.8] text-foreground/90 whitespace-pre-wrap sm:text-base sm:leading-[1.85]">
        {note.content}
      </p>

      {/* Images — Full-width, prominent */}
      {note.images.length > 0 && (
        <div className="mt-3 sm:mt-4">
          <ImageGrid images={note.images} />
        </div>
      )}

      {/* Subtle footer */}
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground/50">
        <span>{relativeTime(note.createdAt)}</span>
      </div>
    </article>
  )
}
