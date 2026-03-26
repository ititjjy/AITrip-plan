/**
 * JournalPage — Published trip journal with content-first layout
 *
 * In journal mode, user-generated micro-notes are the primary content.
 * POI points appear as location badges on note cards (secondary).
 * This is the opposite of OverviewPage where POIs are primary.
 */
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { MicroNote, NoteMood } from '@/types'
import { popularCities } from '@/data/mock-data'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ArrowLeft, Calendar, MapPin, BookOpen, Loader2, Pencil,
  MessageSquarePlus, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import NoteCard from '@/components/NoteCard'
import NoteEditorModal from '@/components/NoteEditorModal'

export default function JournalPage() {
  const { state, dispatch } = useApp()
  const { user, requireAuth, getAuthHeaders } = useAuth()
  const [microNotes, setMicroNotes] = useState<MicroNote[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDay, setFilterDay] = useState<number | null>(null)
  const [showDayFilter, setShowDayFilter] = useState(false)

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<MicroNote | null>(null)
  const [editorPoiName, setEditorPoiName] = useState('')
  const [editorPoiType, setEditorPoiType] = useState('')
  const [editorDayNumber, setEditorDayNumber] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const trip = state.currentTrip
  const savedTripId = state.savedTripId

  // Fetch notes
  useEffect(() => {
    if (!savedTripId) { setLoading(false); return }
    fetch(`/api/trips/${savedTripId}/micro-notes`)
      .then(r => r.json())
      .then(data => {
        if (data.success) setMicroNotes(data.data || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [savedTripId])

  const city = trip ? popularCities.find(c => c.id === trip.cityId) : null

  // Group notes by day
  const notesByDay = useMemo(() => {
    const map = new Map<number, MicroNote[]>()
    const sorted = [...microNotes].sort((a, b) => a.createdAt - b.createdAt)
    for (const note of sorted) {
      const day = note.dayNumber
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(note)
    }
    return map
  }, [microNotes])

  const dayNumbers = useMemo(() => {
    if (!trip) return []
    return trip.days.map(d => d.dayNumber)
  }, [trip])

  const filteredNotes = useMemo(() => {
    if (filterDay === null) return [...microNotes].sort((a, b) => a.createdAt - b.createdAt)
    return (notesByDay.get(filterDay) || [])
  }, [filterDay, microNotes, notesByDay])

  const handleEditNote = useCallback((note: MicroNote) => {
    setEditorPoiName(note.poiName)
    setEditorPoiType(note.poiType)
    setEditorDayNumber(note.dayNumber)
    setEditingNote(note)
    setEditorOpen(true)
  }, [])

  const handleDeleteNote = useCallback(async (noteId: string) => {
    if (!savedTripId) return
    if (!confirm('确定要删除这条游记吗？')) return
    try {
      const res = await fetch(`/api/trips/${savedTripId}/micro-notes/${noteId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      const result = await res.json()
      if (result.success) {
        setMicroNotes(prev => prev.filter(n => n.id !== noteId))
      }
    } catch { /* ignore */ }
  }, [savedTripId, getAuthHeaders])

  const handleNoteSubmit = useCallback(async (data: { id?: string; content: string; images: string[]; mood: NoteMood | '' }) => {
    if (!savedTripId || !editingNote) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/trips/${savedTripId}/micro-notes`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: data.id,
          poiId: editingNote.poiId,
          poiName: editingNote.poiName,
          poiLat: editingNote.poiLat,
          poiLng: editingNote.poiLng,
          poiType: editingNote.poiType,
          dayNumber: editingNote.dayNumber,
          content: data.content,
          images: data.images,
          mood: data.mood,
        }),
      })
      const result = await res.json()
      if (result.success) {
        if (data.id) {
          setMicroNotes(prev => prev.map(n => n.id === data.id ? result.data : n))
        } else {
          setMicroNotes(prev => [...prev, result.data])
        }
        setEditorOpen(false)
      }
    } catch { /* ignore */ }
    setSubmitting(false)
  }, [savedTripId, getAuthHeaders, editingNote])

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })

  if (!trip) return null

  return (
    <div className="min-h-screen bg-background pb-safe">
      {/* Hero */}
      <div className="relative h-52 overflow-hidden sm:h-64">
        {city && (
          <img src={city.image} alt={city.name} className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/40 to-foreground/10" />

        <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-primary-foreground hover:bg-primary-foreground/10 sm:px-3"
              onClick={() => dispatch({ type: 'SET_VIEW', payload: 'overview' })}
            >
              <ArrowLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">返回</span>
            </Button>
            <div className="flex items-center gap-1.5 rounded-full gradient-journal px-3 py-1 text-xs font-semibold text-primary-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              旅行游记
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-primary-foreground sm:text-3xl">
              {trip.cityName}游记
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-primary-foreground/80 sm:mt-2 sm:gap-4 sm:text-sm">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {trip.days.length} 天
              </span>
              <span className="flex items-center gap-1">
                <Pencil className="h-3.5 w-3.5" />
                {microNotes.length} 条游记
              </span>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Day filter */}
        <div className="mb-6 flex items-center gap-2">
          <button
            onClick={() => setShowDayFilter(!showDayFilter)}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-secondary"
          >
            {filterDay === null ? '全部天数' : `第 ${filterDay} 天`}
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showDayFilter ? 'rotate-180' : ''}`} />
          </button>
          {showDayFilter && (
            <div className="flex flex-wrap gap-1.5 animate-fade-in">
              <button
                onClick={() => { setFilterDay(null); setShowDayFilter(false) }}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  filterDay === null ? 'gradient-journal text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                全部
              </button>
              {dayNumbers.map(d => (
                <button
                  key={d}
                  onClick={() => { setFilterDay(d); setShowDayFilter(false) }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    filterDay === d ? 'gradient-journal text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Day {d}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notes feed */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 text-journal animate-spin" />
            <p className="mt-3 text-sm text-muted-foreground">加载游记中...</p>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-20">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-journal-light">
              <BookOpen className="h-8 w-8 text-journal" />
            </div>
            <p className="mb-1 text-base font-medium text-foreground">
              {filterDay !== null ? `第 ${filterDay} 天暂无游记` : '暂无游记'}
            </p>
            <p className="text-sm text-muted-foreground">
              在行程编辑页面的每个景点下方点击"写游记"来创建
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => dispatch({ type: 'SET_VIEW', payload: 'planner' })}
            >
              <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />
              去写游记
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Group by day */}
            {filterDay === null ? (
              Array.from(notesByDay.entries())
                .sort(([a], [b]) => a - b)
                .map(([dayNum, dayNotes]) => (
                  <div key={dayNum}>
                    {/* Day separator */}
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-journal text-xs font-bold text-primary-foreground">
                        D{dayNum}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          第 {dayNum} 天
                        </p>
                        {trip.days[dayNum - 1] && (
                          <p className="text-[10px] text-muted-foreground">
                            {formatDate(trip.days[dayNum - 1].date)}
                          </p>
                        )}
                      </div>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    <div className="space-y-3 mb-6">
                      {dayNotes.map(note => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          variant="full"
                          isOwner={user?.id === note.authorId}
                          onEdit={handleEditNote}
                          onDelete={handleDeleteNote}
                        />
                      ))}
                    </div>
                  </div>
                ))
            ) : (
              <div className="space-y-3">
                {filteredNotes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    variant="full"
                    isOwner={user?.id === note.authorId}
                    onEdit={handleEditNote}
                    onDelete={handleDeleteNote}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bottom actions */}
        <div className="mt-8 flex flex-col items-center gap-3 sm:mt-10 sm:flex-row sm:justify-center sm:gap-4">
          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'planner' })}
          >
            <MessageSquarePlus className="mr-1.5 h-4 w-4" />
            继续写游记
          </Button>
          <Button
            variant="coral"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'overview' })}
          >
            返回行程总览
          </Button>
        </div>
      </main>

      {/* Note Editor */}
      <NoteEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSubmit={handleNoteSubmit}
        poiName={editorPoiName}
        poiType={editorPoiType}
        dayNumber={editorDayNumber}
        editingNote={editingNote}
        submitting={submitting}
      />
    </div>
  )
}
