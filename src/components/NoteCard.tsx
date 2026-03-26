/**
 * NoteCard — Social-style micro note card
 *
 * Two variants:
 *   - compact: Inline display under POI items in DayTimeline (small, subtle)
 *   - full: Full-width card for JournalPage (content-first, POI as location tag)
 */
import { MicroNote, NoteMood } from '@/types'
import ImageGrid from '@/components/ImageGrid'
import { MapPin, Pencil, Trash2, Clock } from 'lucide-react'

interface Props {
  note: MicroNote
  /** Display variant */
  variant?: 'compact' | 'full'
  /** Whether the current user is the author */
  isOwner?: boolean
  /** Edit callback */
  onEdit?: (note: MicroNote) => void
  /** Delete callback */
  onDelete?: (noteId: string) => void
}

/** Mood label map */
const moodLabels: Record<NoteMood, string> = {
  '😊': '开心',
  '🤩': '惊喜',
  '😋': '好吃',
  '🥰': '喜欢',
  '😌': '治愈',
  '🎉': '兴奋',
  '📸': '打卡',
  '🌅': '感动',
  '❄️': '清凉',
  '🌸': '浪漫',
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)} 天前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

const poiTypeIcon = (type: string) => {
  switch (type) {
    case 'scenic': return '🏛️'
    case 'food': return '🍜'
    case 'hotel': return '🏨'
    case 'shopping': return '🛍️'
    case 'activity': return '🎯'
    default: return '📍'
  }
}

export default function NoteCard({ note, variant = 'compact', isOwner, onEdit, onDelete }: Props) {
  if (variant === 'compact') {
    return (
      <div className="group/note relative ml-1 mt-2 rounded-xl border border-border/60 bg-card p-3 shadow-note transition-all duration-300 hover:shadow-note-hover">
        {/* Author row */}
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-journal-light text-[10px]">
            {note.authorAvatar ? (
              <img src={note.authorAvatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-journal font-bold">{note.authorName?.[0] || '?'}</span>
            )}
          </div>
          <span className="text-[11px] font-medium text-foreground">{note.authorName}</span>
          {note.mood && (
            <span className="ml-auto flex items-center gap-0.5 rounded-full bg-journal-light px-1.5 py-0.5 text-[10px] font-medium text-journal">
              {note.mood} {moodLabels[note.mood as NoteMood] || ''}
            </span>
          )}
        </div>

        {/* Content */}
        <p className="text-[12px] leading-relaxed text-foreground/90 line-clamp-3">
          {note.content}
        </p>

        {/* Images */}
        {note.images.length > 0 && (
          <div className="mt-2">
            <ImageGrid images={note.images} compact />
          </div>
        )}

        {/* Footer: time + actions */}
        <div className="mt-2 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            {formatTime(note.createdAt)}
          </span>
          {isOwner && (
            <div className="flex gap-1 opacity-0 group-hover/note:opacity-100 transition-all duration-200">
              {onEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(note) }}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-smooth"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(note.id) }}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-smooth"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ═══ Full variant — Journal page card ═══ */
  return (
    <div className="group/note gradient-note-card rounded-2xl border border-border/40 p-4 shadow-note transition-all duration-300 hover:shadow-note-hover sm:p-5">
      {/* Author row */}
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-journal-light text-xs sm:h-10 sm:w-10">
          {note.authorAvatar ? (
            <img src={note.authorAvatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-journal font-bold text-sm">{note.authorName?.[0] || '?'}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{note.authorName}</p>
          <p className="text-[11px] text-muted-foreground">{formatTime(note.createdAt)}</p>
        </div>
        {note.mood && (
          <span className="flex items-center gap-1 rounded-full bg-journal-light px-2.5 py-1 text-xs font-medium text-journal">
            <span className="text-base">{note.mood}</span>
            {moodLabels[note.mood as NoteMood] || ''}
          </span>
        )}
      </div>

      {/* Content — Primary element in journal mode */}
      <p className="mb-3 text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap sm:text-sm sm:leading-relaxed">
        {note.content}
      </p>

      {/* Images */}
      {note.images.length > 0 && (
        <div className="mb-3">
          <ImageGrid images={note.images} />
        </div>
      )}

      {/* POI location badge — Secondary in journal mode */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 rounded-full bg-secondary/80 px-2.5 py-1 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span>{poiTypeIcon(note.poiType)}</span>
          <span className="font-medium">{note.poiName}</span>
          <span className="text-muted-foreground/60">|</span>
          <span>Day {note.dayNumber}</span>
        </div>

        {isOwner && (
          <div className="flex gap-1 opacity-0 group-hover/note:opacity-100 transition-all duration-200">
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(note) }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-smooth"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(note.id) }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-smooth"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
