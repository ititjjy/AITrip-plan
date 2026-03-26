/**
 * NoteEditorModal — Bottom-sheet style editor for micro notes
 *
 * Features:
 *   - Text content (280 char limit) with char counter
 *   - Image upload (max 9, stored as base64 data URIs)
 *   - Mood emoji picker
 *   - POI info display (read-only, pre-filled from context)
 *   - Edit / Create mode
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { X, ImagePlus, Smile, MapPin, Send, Loader2 } from 'lucide-react'
import { MicroNote, NoteMood } from '@/types'

const MAX_CONTENT = 280
const MAX_IMAGES = 9

const MOOD_OPTIONS: { emoji: NoteMood; label: string }[] = [
  { emoji: '😊', label: '开心' },
  { emoji: '🤩', label: '惊喜' },
  { emoji: '😋', label: '好吃' },
  { emoji: '🥰', label: '喜欢' },
  { emoji: '😌', label: '治愈' },
  { emoji: '🎉', label: '兴奋' },
  { emoji: '📸', label: '打卡' },
  { emoji: '🌅', label: '感动' },
  { emoji: '❄️', label: '清凉' },
  { emoji: '🌸', label: '浪漫' },
]

interface Props {
  /** Visible state */
  open: boolean
  /** Close callback */
  onClose: () => void
  /** Submit callback */
  onSubmit: (data: {
    id?: string
    content: string
    images: string[]
    mood: NoteMood | ''
  }) => Promise<void>
  /** Pre-filled POI info */
  poiName: string
  poiType: string
  dayNumber: number
  /** Editing existing note? */
  editingNote?: MicroNote | null
  /** Loading state for submit */
  submitting?: boolean
}

export default function NoteEditorModal({
  open,
  onClose,
  onSubmit,
  poiName,
  poiType,
  dayNumber,
  editingNote,
  submitting,
}: Props) {
  const [content, setContent] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [mood, setMood] = useState<NoteMood | ''>('')
  const [showMoodPicker, setShowMoodPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initialize from editing note
  useEffect(() => {
    if (open && editingNote) {
      setContent(editingNote.content)
      setImages(editingNote.images || [])
      setMood(editingNote.mood || '')
    } else if (open) {
      setContent('')
      setImages([])
      setMood('')
    }
  }, [open, editingNote])

  // Auto-focus
  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 300)
    }
  }, [open])

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const remaining = MAX_IMAGES - images.length
    const toProcess = Array.from(files).slice(0, remaining)

    toProcess.forEach((file) => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        setImages((prev) => {
          if (prev.length >= MAX_IMAGES) return prev
          return [...prev, result]
        })
      }
      reader.readAsDataURL(file)
    })

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [images.length])

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!content.trim()) return
    await onSubmit({
      id: editingNote?.id,
      content: content.trim().slice(0, MAX_CONTENT),
      images,
      mood,
    })
  }

  const poiIcon = poiType === 'food' ? '🍜' : poiType === 'scenic' ? '🏛️' : poiType === 'hotel' ? '🏨' : '📍'

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative z-10 w-full max-w-lg animate-slide-up rounded-t-2xl border-t border-border bg-card shadow-float safe-bottom">
        {/* Handle bar */}
        <div className="flex justify-center py-2">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-journal-light px-2.5 py-1 text-[11px] font-medium text-journal">
              <MapPin className="h-3 w-3" />
              {poiIcon} {poiName}
              <span className="text-journal/50">|</span>
              Day {dayNumber}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary transition-smooth"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content area */}
        <div className="px-4">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT))}
              placeholder="记录这一刻的美好..."
              className="min-h-[100px] w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              maxLength={MAX_CONTENT}
            />
            <span className={`absolute bottom-1 right-1 text-[10px] ${content.length > MAX_CONTENT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'}`}>
              {content.length}/{MAX_CONTENT}
            </span>
          </div>
        </div>

        {/* Image preview row */}
        {images.length > 0 && (
          <div className="px-4 pb-2">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {images.map((img, i) => (
                <div key={i} className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg">
                  <img src={img} alt="" className="h-full w-full object-cover" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground/70 text-primary-foreground"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mood display */}
        {mood && (
          <div className="px-4 pb-2">
            <button
              onClick={() => setMood('')}
              className="inline-flex items-center gap-1 rounded-full bg-journal-light px-2.5 py-1 text-xs text-journal transition-smooth hover:bg-journal/10"
            >
              <span className="text-sm">{mood}</span>
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Mood picker dropdown */}
        {showMoodPicker && (
          <div className="mx-4 mb-2 animate-fade-in rounded-xl border border-border bg-card p-3 shadow-card">
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">选择心情</p>
            <div className="flex flex-wrap gap-1.5">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m.emoji}
                  onClick={() => { setMood(m.emoji); setShowMoodPicker(false) }}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-all ${
                    mood === m.emoji
                      ? 'border-journal bg-journal-light text-journal'
                      : 'border-border bg-card text-muted-foreground hover:border-journal/40 hover:bg-journal-light/50'
                  }`}
                >
                  <span className="text-sm">{m.emoji}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="flex items-center gap-2">
            {/* Image upload */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= MAX_IMAGES}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-smooth hover:border-primary hover:text-primary disabled:opacity-40"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              {images.length > 0 ? `${images.length}/${MAX_IMAGES}` : '图片'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />

            {/* Mood picker toggle */}
            <button
              onClick={() => setShowMoodPicker(!showMoodPicker)}
              className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-smooth ${
                showMoodPicker
                  ? 'border-journal bg-journal-light text-journal'
                  : 'border-border bg-card text-muted-foreground hover:border-journal hover:text-journal'
              }`}
            >
              <Smile className="h-3.5 w-3.5" />
              心情
            </button>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
            className="flex h-9 items-center gap-1.5 rounded-xl gradient-journal px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {editingNote ? '更新' : '发布'}
          </button>
        </div>
      </div>
    </div>
  )
}
