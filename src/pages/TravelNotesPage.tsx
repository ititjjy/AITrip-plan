/**
 * TravelNotesPage.tsx – Public travel notes browsing page
 */

import { useState, useEffect } from 'react'
import { useApp } from '@/context/AppContext'
import { TravelNote } from '@/types'
import {
  ArrowLeft, MapPin, Calendar, User, MessageSquare,
  Loader2, BookOpen, Compass,
} from 'lucide-react'

export default function TravelNotesPage() {
  const { dispatch } = useApp()
  const [notes, setNotes] = useState<TravelNote[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    fetchNotes()
  }, [])

  const fetchNotes = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notes?limit=50')
      const data = await res.json()
      if (data.success) {
        setNotes(data.notes)
        setTotal(data.total)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const openNote = (id: string) => {
    sessionStorage.setItem('viewNoteId', id)
    dispatch({ type: 'SET_VIEW', payload: 'note-detail' })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="gradient-hero px-4 pb-8 pt-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            <button
              onClick={() => dispatch({ type: 'SET_VIEW', payload: 'home' })}
              className="flex items-center gap-1.5 text-sm text-primary-foreground/80 transition-smooth hover:text-primary-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> 首页
            </button>
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-primary-foreground" />
              <span className="text-sm font-bold text-primary-foreground">智游旅行</span>
            </div>
          </div>
          <div className="mt-6 text-center">
            <h1 className="text-2xl font-bold text-primary-foreground sm:text-3xl">
              旅行灵感
            </h1>
            <p className="mt-2 text-sm text-primary-foreground/80">
              发现其他旅行者的精彩行程，获取灵感
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : notes.length === 0 ? (
          <div className="py-20 text-center">
            <BookOpen className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
            <h3 className="mb-2 text-lg font-semibold text-foreground">暂时还没有游记</h3>
            <p className="text-sm text-muted-foreground">成为第一个发布游记的旅行者吧</p>
          </div>
        ) : (
          <>
            <p className="mb-6 text-sm text-muted-foreground">共 {total} 篇游记</p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => openNote(note.id)}
                  className="group cursor-pointer overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover"
                >
                  {/* Cover */}
                  <div className="relative h-40 overflow-hidden bg-gradient-to-br from-coral-light to-sunset-light">
                    {note.coverImage ? (
                      <img src={note.coverImage} alt={note.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <MapPin className="h-12 w-12 text-primary/20" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3">
                      <h3 className="truncate text-base font-bold text-primary-foreground">{note.title}</h3>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{note.cityName}</span>
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{note.dayCount}天</span>
                      <span>¥{note.totalBudget}</span>
                    </div>
                    {note.publishNote && (
                      <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{note.publishNote}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                          {note.authorName.charAt(0)}
                        </div>
                        <span className="text-xs text-muted-foreground">{note.authorName}</span>
                      </div>
                      {note.allowComments && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <MessageSquare className="h-3 w-3" /> 可评论
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
