import { displayName, displayNameShort } from '@/utils/poiName'
import { handleImgError } from '@/utils/imageProxy'
/**
 * DayTimeline v3 – Full daily schedule with editing capabilities
 *
 * Features:
 *   🏨 Departure/arrival hotel cards with recommendation
 *   🚶 Transport segments with OSRM data
 *   🏛️ POI items with seasonal index, recommend reason, badges
 *   🍜 Meal items with auto-fill indicators
 *   ➕ Inline "add POI" buttons between items
 *   🔄 One-click route optimization
 *   ✋ Drag & drop reordering
 *   📝 Micro-notes per POI (微游记)
 */
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { ItineraryItem, Attraction, HotelPOI, MicroNote, NoteMood } from '@/types'
import { getAttractions, getAllAttractions, getAttractionTypeLabel, getAttractionTypeIcon, recommendedHotels } from '@/data/mock-data'
import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import {
  GripVertical, Trash2, Clock, Edit3, Check, Sparkles,
  Map as MapIcon, List, Hotel, Car, Train, Plus,
  Zap, ChevronDown, ChevronUp, ChevronRight, Star, Flame, X,
  MessageSquarePlus,
} from 'lucide-react'
import TransportSegmentCard from '@/components/TransportSegment'
import RouteMap from '@/components/RouteMap'
import NoteCard from '@/components/NoteCard'
import NoteEditorModal from '@/components/NoteEditorModal'
import { fetchTransitLegs, type TransitLeg } from '@/utils/transport'
import { optimizeDayRoute } from '@/utils/routePlanner'

/* ─── Types ─── */
interface TransitData {
  [key: string]: TransitLeg
}

/* ─── Seasonal Index Stars ─── */
function SeasonalBadge({ value }: { value: number }) {
  if (!value || value <= 0) return null
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
      <Flame className="h-2.5 w-2.5 text-amber-500" />
      {value.toFixed(1)}
    </span>
  )
}

export default function DayTimeline() {
  const { state, dispatch } = useApp()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [showMap, setShowMap] = useState(true)
  const [transitData, setTransitData] = useState<TransitData>({})
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [insertIndex, setInsertIndex] = useState<number | null>(null)
  const [showHotelRec, setShowHotelRec] = useState(false)
  const dragCounter = useRef(0)

  /* ── Micro Notes state ── */
  const { user, requireAuth, getAuthHeaders } = useAuth()
  const [microNotes, setMicroNotes] = useState<MicroNote[]>([])
  const [noteEditorOpen, setNoteEditorOpen] = useState(false)
  const [noteEditorPoiId, setNoteEditorPoiId] = useState('')
  const [noteEditorPoiName, setNoteEditorPoiName] = useState('')
  const [noteEditorPoiType, setNoteEditorPoiType] = useState('')
  const [noteEditorPoiLat, setNoteEditorPoiLat] = useState(0)
  const [noteEditorPoiLng, setNoteEditorPoiLng] = useState(0)
  const [editingMicroNote, setEditingMicroNote] = useState<MicroNote | null>(null)
  const [noteSubmitting, setNoteSubmitting] = useState(false)

  const trip = state.currentTrip
  if (!trip) return null

  const dayIndex = state.selectedDayIndex
  const day = trip.days[dayIndex]
  if (!day) return null

  const attractions = useMemo(() => {
    const display = getAttractions(trip.cityId)
    const all = getAllAttractions(trip.cityId)
    const map = new Map<string, Attraction>()
    for (const a of all) map.set(a.id, a)
    for (const a of display) map.set(a.id, a)
    return Array.from(map.values())
  }, [trip.cityId])

  const getAttraction = (id: string) => attractions.find((a) => a.id === id)

  const startHotel: HotelPOI | null = dayIndex > 0
    ? trip.days[dayIndex - 1].hotel ?? null
    : day.hotel ?? null
  const endHotel: HotelPOI | null = day.hotel ?? null

  // ── Fetch real transit data from OSRM ──
  useEffect(() => {
    if (day.items.length === 0) return

    const waypoints: [number, number][] = []
    if (startHotel) waypoints.push([startHotel.lat, startHotel.lng])
    for (const item of day.items) {
      const a = getAttraction(item.attractionId)
      if (a) waypoints.push([a.lat, a.lng])
    }
    if (endHotel) waypoints.push([endHotel.lat, endHotel.lng])
    if (waypoints.length < 2) return

    fetchTransitLegs(waypoints).then(legs => {
      if (!legs) return
      const data: TransitData = {}
      const ids: string[] = []
      if (startHotel) ids.push(`hotel-start`)
      for (const item of day.items) ids.push(item.attractionId)
      if (endHotel) ids.push(`hotel-end`)

      for (let i = 0; i < legs.length && i < ids.length - 1; i++) {
        data[`${ids[i]}->${ids[i + 1]}`] = legs[i]
      }
      setTransitData(data)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.items.length, dayIndex, startHotel?.id, endHotel?.id])

  // ── Fetch micro notes for this trip ──
  const savedTripId = state.savedTripId
  useEffect(() => {
    if (!savedTripId) return
    fetch(`/api/trips/${savedTripId}/micro-notes`)
      .then(r => r.json())
      .then(data => {
        if (data.success) setMicroNotes(data.data || [])
      })
      .catch(() => {})
  }, [savedTripId])

  // Notes for current day filtered by POI
  const getNotesForPoi = useCallback((poiId: string) => {
    return microNotes.filter(n => n.poiId === poiId && n.dayNumber === day.dayNumber)
  }, [microNotes, day.dayNumber])

  // ── Open note editor for a POI ──
  const doOpenNoteEditor = useCallback((attraction: Attraction) => {
    setNoteEditorPoiId(attraction.id)
    setNoteEditorPoiName(displayNameShort(attraction))
    setNoteEditorPoiType(attraction.type)
    setNoteEditorPoiLat(attraction.lat)
    setNoteEditorPoiLng(attraction.lng)
    setEditingMicroNote(null)
    setNoteEditorOpen(true)
  }, [])

  const openNoteEditor = useCallback((attraction: Attraction) => {
    if (!savedTripId) return
    if (!requireAuth('写游记需要先登录', () => doOpenNoteEditor(attraction))) return
    doOpenNoteEditor(attraction)
  }, [savedTripId, requireAuth, doOpenNoteEditor])

  const handleEditNote = useCallback((note: MicroNote) => {
    const attraction = getAttraction(note.poiId)
    setNoteEditorPoiId(note.poiId)
    setNoteEditorPoiName(note.poiName)
    setNoteEditorPoiType(note.poiType)
    setNoteEditorPoiLat(note.poiLat)
    setNoteEditorPoiLng(note.poiLng)
    setEditingMicroNote(note)
    setNoteEditorOpen(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleNoteSubmit = useCallback(async (data: { id?: string; content: string; images: string[]; mood: NoteMood | '' }) => {
    if (!savedTripId) return
    setNoteSubmitting(true)
    try {
      const res = await fetch(`/api/trips/${savedTripId}/micro-notes`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: data.id,
          poiId: noteEditorPoiId,
          poiName: noteEditorPoiName,
          poiLat: noteEditorPoiLat,
          poiLng: noteEditorPoiLng,
          poiType: noteEditorPoiType,
          dayNumber: day.dayNumber,
          content: data.content,
          images: data.images,
          mood: data.mood,
        }),
      })
      const result = await res.json()
      if (result.success) {
        // Update local state
        if (data.id) {
          setMicroNotes(prev => prev.map(n => n.id === data.id ? result.data : n))
        } else {
          setMicroNotes(prev => [...prev, result.data])
        }
        setNoteEditorOpen(false)
      }
    } catch { /* ignore */ }
    setNoteSubmitting(false)
  }, [savedTripId, getAuthHeaders, noteEditorPoiId, noteEditorPoiName, noteEditorPoiLat, noteEditorPoiLng, noteEditorPoiType, day.dayNumber])

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

  /* ── One-click optimize ── */
  const handleOptimize = useCallback(() => {
    if (day.items.length < 2) return
    setIsOptimizing(true)

    // Small delay for visual feedback
    setTimeout(() => {
      const optimized = optimizeDayRoute(
        day.items,
        attractions,
        startHotel,
        endHotel,
        trip.cityId,
      )
      dispatch({
        type: 'REORDER_ITEMS',
        payload: { dayIndex, items: optimized },
      })
      setIsOptimizing(false)
    }, 300)
  }, [day.items, attractions, startHotel, endHotel, trip.cityId, dayIndex, dispatch])

  /* ── Drag & Drop handlers ── */
  const handleDragStart = (index: number) => setDragIndex(index)
  const handleDragEnter = (index: number) => { dragCounter.current++; setDragOverIndex(index) }
  const handleDragLeave = () => { dragCounter.current--; if (dragCounter.current === 0) setDragOverIndex(null) }
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()

  const handleDrop = (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null); setDragOverIndex(null); dragCounter.current = 0; return
    }
    const items = [...day.items]
    const [moved] = items.splice(dragIndex, 1)
    items.splice(dropIndex, 0, moved)

    let currentHour = 9, currentMin = 0
    const updatedItems = items.map((item) => {
      const attraction = getAttraction(item.attractionId)
      const duration = attraction?.duration || 60
      const startTime = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`
      const endMin = currentMin + duration
      let endHour = currentHour + Math.floor(endMin / 60)
      const finalMin = endMin % 60
      if (endHour > 23) endHour = 23
      const endTime = `${String(endHour).padStart(2, '0')}:${String(finalMin).padStart(2, '0')}`
      currentMin = finalMin + 30
      if (currentMin >= 60) { currentHour = endHour + 1; currentMin -= 60 } else { currentHour = endHour }
      return { ...item, startTime, endTime }
    })

    dispatch({ type: 'REORDER_ITEMS', payload: { dayIndex, items: updatedItems } })
    setDragIndex(null); setDragOverIndex(null); dragCounter.current = 0
  }

  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null); dragCounter.current = 0 }
  const removeItem = (itemId: string) => dispatch({ type: 'REMOVE_ITEM', payload: { dayIndex, itemId } })
  const startEditNotes = (item: ItineraryItem) => { setEditingId(item.id); setEditNotes(item.notes) }
  const saveNotes = (item: ItineraryItem) => {
    dispatch({ type: 'UPDATE_ITEM', payload: { dayIndex, item: { ...item, notes: editNotes } } })
    setEditingId(null)
  }
  const openDetail = (attractionId: string) => dispatch({ type: 'VIEW_DETAIL', payload: attractionId })

  /* ── Inline add POI ── */
  const handleInlineAdd = (attraction: Attraction, atIndex: number) => {
    const dayItems = day.items
    let startHour = 9, startMin = 0
    if (atIndex > 0 && dayItems[atIndex - 1]) {
      const [h, m] = dayItems[atIndex - 1].endTime.split(':').map(Number)
      startHour = h; startMin = m + 30
      if (startMin >= 60) { startHour++; startMin -= 60 }
    }
    const endMin = startMin + attraction.duration
    let endHour = startHour + Math.floor(endMin / 60)
    const finalMin = endMin % 60
    if (endHour > 23) endHour = 23

    const newItem: ItineraryItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      attractionId: attraction.id,
      startTime: `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`,
      endTime: `${String(endHour).padStart(2, '0')}:${String(finalMin).padStart(2, '0')}`,
      notes: '',
      cost: attraction.cost,
      type: attraction.type,
    }

    // Insert at specific position
    const newItems = [...dayItems]
    newItems.splice(atIndex, 0, newItem)
    dispatch({ type: 'REORDER_ITEMS', payload: { dayIndex, items: newItems } })
    setInsertIndex(null)
  }

  /* ── Hotel recommendation ── */
  const hotelRecommendations = useMemo(() => {
    const hotels = recommendedHotels[trip.cityId] || []
    if (hotels.length === 0 || day.items.length === 0) return []

    // Compute centroid of last few POIs and next day first POI
    const lastItems = day.items.slice(-2)
    let refLat = 0, refLng = 0, count = 0
    for (const item of lastItems) {
      const a = getAttraction(item.attractionId)
      if (a) { refLat += a.lat; refLng += a.lng; count++ }
    }
    // Also consider next day's first POI
    if (dayIndex < trip.days.length - 1) {
      const nextDay = trip.days[dayIndex + 1]
      if (nextDay.items.length > 0) {
        const nextA = getAttraction(nextDay.items[0].attractionId)
        if (nextA) { refLat += nextA.lat; refLng += nextA.lng; count++ }
      }
    }
    if (count === 0) return hotels.slice(0, 3)
    refLat /= count; refLng /= count

    // Sort by distance from centroid
    const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const R = 6371
      const toRad = (deg: number) => (deg * Math.PI) / 180
      const dLat = toRad(lat2 - lat1)
      const dLng = toRad(lng2 - lng1)
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    return [...hotels]
      .map(h => ({ ...h, dist: haversine(refLat, refLng, h.lat, h.lng) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.cityId, day.items.length, dayIndex])

  /* ── Styling helpers ── */
  const typeBadgeClass = (type: string) => {
    switch (type) {
      case 'scenic': return 'badge-spot text-primary-foreground'
      case 'food': return 'badge-food text-primary-foreground'
      case 'hotel': return 'badge-hotel text-primary-foreground'
      case 'activity': return 'gradient-hero text-primary-foreground'
      case 'shopping': return 'gradient-ocean text-primary-foreground'
      default: return 'bg-secondary text-secondary-foreground'
    }
  }

  const timelineDotClass = (type: string) => {
    switch (type) {
      case 'scenic': return 'badge-spot'
      case 'food': return 'badge-food'
      case 'hotel': return 'badge-hotel'
      case 'activity': return 'gradient-hero'
      default: return 'bg-primary'
    }
  }

  const totalCost = day.items.reduce((sum, item) => sum + item.cost, 0)

  /* ── Transit info renderer ── */
  const renderTransitInfo = (fromId: string, toId: string, fromLat?: number, fromLng?: number, toLat?: number, toLng?: number) => {
    const key = `${fromId}->${toId}`
    const leg = transitData[key]

    if (leg) {
      return (
        <div className="relative my-1 ml-[-20px] flex items-center gap-2 py-1">
          <div className="absolute left-[10px] top-0 bottom-0 w-0.5 border-l-2 border-dashed border-border" />
          <div className="relative z-10 ml-[2px] flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card/80 px-2.5 py-1.5 text-[10px] font-medium shadow-sm">
            <span className="flex items-center gap-1 text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">
              <Car className="h-2.5 w-2.5" />
              自驾 {leg.driving.distance}km · {leg.driving.duration}min
            </span>
            <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
              <Train className="h-2.5 w-2.5" />
              {leg.transit.modeLabel} ~{leg.transit.duration}min
            </span>
          </div>
        </div>
      )
    }

    if (fromLat != null && fromLng != null && toLat != null && toLng != null) {
      return (
        <TransportSegmentCard
          fromLat={fromLat}
          fromLng={fromLng}
          toLat={toLat}
          toLng={toLng}
          cityId={trip.cityId}
        />
      )
    }
    return null
  }

  /* ── Hotel card renderer ── */
  const renderHotelCard = (hotel: HotelPOI | null, label: string, isStart: boolean) => {
    const handleViewDetail = hotel ? () => {
      dispatch({ type: 'VIEW_HOTEL_DETAIL', payload: JSON.stringify(hotel) })
    } : undefined

    const handleChangeHotel = (e: React.MouseEvent) => {
      e.stopPropagation()
      dispatch({ type: 'SET_VIEW', payload: 'hotel-step' })
    }

    const handleRemoveHotel = (e: React.MouseEvent) => {
      e.stopPropagation()
      dispatch({ type: 'SET_DAY_HOTEL', payload: { dayIndex, hotel: null } })
    }

    return (
      <div className="relative mb-3">
        <div className="absolute -left-8 top-3 h-[22px] w-[22px] rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-[10px] border-2 border-card shadow-sm">
          <span className="text-white">🏨</span>
        </div>

        <div
          onClick={handleViewDetail}
          className={`rounded-xl border-2 border-dashed p-3 transition-all ${
            hotel
              ? 'border-indigo-200 bg-gradient-to-r from-indigo-50/50 to-violet-50/50 cursor-pointer hover:border-indigo-300 hover:shadow-md'
              : 'border-border bg-secondary/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                hotel ? 'bg-indigo-100' : 'bg-secondary'
              }`}>
                <Hotel className={`h-4 w-4 ${hotel ? 'text-indigo-600' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
                {hotel ? (
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground">{hotel.name}</p>
                    {hotel.stars && <span className="text-[9px] text-amber-600 font-medium">{hotel.stars}★</span>}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">未选择酒店</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {hotel?.priceRange && (
                <span className="text-[11px] font-semibold text-primary mr-1">¥{hotel.priceRange[0]}起</span>
              )}
              {/* 操作按钮：仅入住酒店卡片显示（非出发卡片） */}
              {!isStart && (
                hotel ? (
                  <>
                    <button
                      onClick={handleChangeHotel}
                      className="flex h-7 items-center gap-0.5 rounded-lg border border-border bg-card px-2 text-[10px] font-medium text-muted-foreground hover:border-primary hover:text-primary transition-smooth"
                    >
                      <Edit3 className="h-3 w-3" />
                      更换
                    </button>
                    <button
                      onClick={handleRemoveHotel}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:border-destructive hover:text-destructive transition-smooth"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleChangeHotel}
                    className="flex h-7 items-center gap-1 rounded-lg gradient-hero px-3 text-[10px] font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-smooth"
                  >
                    <Plus className="h-3 w-3" />
                    选择酒店
                  </button>
                )
              )}
              {hotel && isStart && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── Meal slot badge ── */
  const getMealSlotLabel = (slot?: string) => {
    switch (slot) {
      case 'breakfast': return '🌅 早餐'
      case 'lunch': return '☀️ 午餐'
      case 'dinner': return '🌙 晚餐'
      case 'snack': return '🍰 下午茶'
      default: return null
    }
  }

  /* ── Inline Add POI popup ── */
  const renderInsertPopup = (atIndex: number) => {
    if (insertIndex !== atIndex) return null

    // Get POIs already in the day
    const usedIds = new Set(day.items.map(i => i.attractionId))
    // Show nearby attractions not yet used
    const available = attractions
      .filter(a => !usedIds.has(a.id) && a.type !== 'hotel')
      .slice(0, 8)

    return (
      <div className="relative my-2 animate-fade-in">
        <div className="rounded-xl border border-primary/20 bg-card shadow-float p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Plus className="h-3 w-3 text-primary" />
              插入景点到第 {atIndex + 1} 位
            </p>
            <button
              onClick={() => setInsertIndex(null)}
              className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-smooth"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto">
            {available.map(a => (
              <button
                key={a.id}
                onClick={() => handleInlineAdd(a, atIndex)}
                className="flex items-center gap-2 rounded-lg border border-border p-2 text-left hover:bg-secondary/50 hover:border-primary/30 transition-all"
              >
                <img src={a.image} alt={displayNameShort(a)} className="h-8 w-8 rounded-md object-cover flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-foreground truncate">{displayNameShort(a)}</p>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-muted-foreground">{getAttractionTypeIcon(a.type)} {getAttractionTypeLabel(a.type)}</span>
                    {a.seasonalIndex && a.seasonalIndex > 0 && (
                      <SeasonalBadge value={a.seasonalIndex} />
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  /* ── Inline add button ── */
  const renderInsertButton = (atIndex: number) => {
    return (
      <div className="relative my-1 ml-[-20px] flex items-center group/insert">
        <div className="absolute left-[10px] top-0 bottom-0 w-0.5 border-l-2 border-dashed border-border" />
        <button
          onClick={() => setInsertIndex(insertIndex === atIndex ? null : atIndex)}
          className={`relative z-10 ml-[1px] flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all duration-200 ${
            insertIndex === atIndex
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-transparent bg-transparent text-transparent group-hover/insert:border-border group-hover/insert:bg-card group-hover/insert:text-muted-foreground group-hover/insert:shadow-sm'
          }`}
        >
          <Plus className="h-2.5 w-2.5" />
          <span className="hidden sm:inline">插入</span>
        </button>
      </div>
    )
  }

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <>
    <div className="flex-1 overflow-y-auto">
      {/* Day Header */}
      <div className="sticky top-0 z-10 glass border-b border-border px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              第 {day.dayNumber} 天
            </h2>
            <p className="text-sm text-muted-foreground">
              {new Date(day.date).toLocaleDateString('zh-CN', {
                month: 'long', day: 'numeric', weekday: 'long',
              })}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* One-click optimize */}
            {day.items.length >= 2 && (
              <button
                onClick={handleOptimize}
                disabled={isOptimizing}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-300 ${
                  isOptimizing
                    ? 'bg-primary/20 text-primary animate-pulse'
                    : 'bg-primary/10 text-primary hover:bg-primary/20 hover:shadow-sm active:scale-95'
                }`}
              >
                <Zap className={`h-3.5 w-3.5 ${isOptimizing ? 'animate-spin' : ''}`} />
                {isOptimizing ? '优化中...' : '一键优化'}
              </button>
            )}

            {day.items.length > 0 && (
              <button
                onClick={() => setShowMap(!showMap)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-smooth ${
                  showMap ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary'
                }`}
              >
                {showMap ? <List className="h-3.5 w-3.5" /> : <MapIcon className="h-3.5 w-3.5" />}
                {showMap ? '收起地图' : '展开地图'}
              </button>
            )}
            <div className="text-right">
              <p className="text-xs text-muted-foreground">当日花费</p>
              <p className="text-lg font-bold text-primary">¥{totalCost}</p>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted-foreground">活动数</p>
              <p className="text-lg font-bold text-foreground">{day.items.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6 sm:py-6">
        {/* Route Map */}
        {showMap && day.items.length > 0 && (
          <div className="mb-5 animate-fade-in">
            <RouteMap
              items={day.items}
              hotel={day.hotel}
              cityId={trip.cityId}
              onMarkerClick={openDetail}
              className="h-[220px] sm:h-[280px]"
            />
          </div>
        )}

        {day.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-20">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-coral-light">
              <Clock className="h-8 w-8 text-primary" />
            </div>
            <p className="mb-1 text-base font-medium text-foreground">暂无行程安排</p>
            <p className="text-sm text-muted-foreground">从右侧景点推荐中添加活动</p>
          </div>
        ) : (
          <div className="relative pl-8">
            {/* Timeline line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />

            {/* ── Start Hotel ── */}
            {renderHotelCard(startHotel, dayIndex === 0 ? '出发酒店' : '从昨晚酒店出发', true)}

            {/* Transport from hotel to first item */}
            {(() => {
              const firstItem = day.items[0]
              const firstAttraction = firstItem ? getAttraction(firstItem.attractionId) : null
              if (startHotel && firstAttraction) {
                return renderTransitInfo(
                  'hotel-start', firstItem.attractionId,
                  startHotel.lat, startHotel.lng,
                  firstAttraction.lat, firstAttraction.lng,
                )
              }
              return null
            })()}

            {/* Insert before first item */}
            {renderInsertButton(0)}
            {renderInsertPopup(0)}

            {/* ── Day items ── */}
            {day.items.map((item, index) => {
              const attraction = getAttraction(item.attractionId)
              const isDragging = dragIndex === index
              const isDragOver = dragOverIndex === index

              const prevItem = index > 0 ? day.items[index - 1] : null
              const prevAttraction = prevItem ? getAttraction(prevItem.attractionId) : null

              const showTransport = index > 0 && attraction && prevAttraction

              const isMealItem = item.type === 'food'
              const isAutoFilled = item.isAutoFilled
              const mealSlotLabel = getMealSlotLabel(item.mealSlot)

              return (
                <div key={item.id}>
                  {/* Transport between consecutive POIs */}
                  {showTransport && renderTransitInfo(
                    prevItem!.attractionId, item.attractionId,
                    prevAttraction!.lat, prevAttraction!.lng,
                    attraction!.lat, attraction!.lng,
                  )}

                  <div
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragEnter={() => handleDragEnter(index)}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    className={`relative mb-3 transition-all duration-200 ${
                      isDragging ? 'opacity-40 scale-95' : ''
                    } ${isDragOver ? 'translate-y-1' : ''}`}
                  >
                    {isDragOver && dragIndex !== index && (
                      <div className="absolute -top-2 left-0 right-0 h-0.5 gradient-hero rounded-full" />
                    )}

                    {/* Timeline dot */}
                    <div className={`absolute -left-8 top-5 h-[22px] w-[22px] rounded-full ${timelineDotClass(item.type)} flex items-center justify-center text-[10px] border-2 border-card`}>
                      <span className="text-primary-foreground font-bold">{index + 1}</span>
                    </div>

                    {/* Card */}
                    <div className={`group rounded-xl border p-3 sm:p-4 shadow-card hover:shadow-card-hover transition-all duration-300 ${
                      isAutoFilled
                        ? isMealItem
                          ? 'border-amber-200 bg-gradient-to-r from-amber-50/60 to-orange-50/60'
                          : 'border-violet-200 bg-gradient-to-r from-violet-50/50 to-indigo-50/50'
                        : isMealItem
                          ? 'border-orange-200 bg-gradient-to-r from-orange-50/40 to-red-50/40'
                          : 'border-border bg-card'
                    }`}>
                      <div className="flex items-start gap-2.5 sm:gap-3">
                        {/* Drag handle */}
                        <div className="mt-1 cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing hidden sm:block">
                          <GripVertical className="h-5 w-5" />
                        </div>

                        {/* Image */}
                        {attraction && (
                          <div
                            className="h-14 w-14 sm:h-16 sm:w-16 flex-shrink-0 overflow-hidden rounded-lg cursor-pointer ring-0 hover:ring-2 hover:ring-primary/30 transition-all"
                            onClick={() => openDetail(attraction.id)}
                          >
                            <img
                              src={attraction.image}
                              alt={displayName(attraction)}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              onError={handleImgError}
                            />
                          </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {mealSlotLabel && (
                              <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
                                {mealSlotLabel}
                              </span>
                            )}
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${typeBadgeClass(item.type)}`}>
                              {getAttractionTypeIcon(item.type)} {getAttractionTypeLabel(item.type)}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {item.startTime} - {item.endTime}
                            </span>
                            {isAutoFilled && (
                              <span className="flex items-center gap-0.5 rounded-full bg-violet-100 text-violet-700 px-1.5 py-0.5 text-[9px] font-medium">
                                <Sparkles className="h-2.5 w-2.5" />
                                AI推荐
                              </span>
                            )}
                            {/* Seasonal index */}
                            {attraction?.seasonalIndex && attraction.seasonalIndex > 0 && (
                              <SeasonalBadge value={attraction.seasonalIndex} />
                            )}
                          </div>

                          <h4
                            className="text-sm font-semibold text-foreground truncate cursor-pointer hover:text-primary transition-smooth"
                            onClick={() => attraction && openDetail(attraction.id)}
                          >
                            {displayName(attraction)}
                          </h4>

                          {/* Recommend reason */}
                          {attraction?.recommendReason && (
                            <div className="mt-1.5 flex items-start gap-1.5">
                              <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                              <p className="text-[11px] text-primary/80 leading-relaxed line-clamp-2">
                                {attraction.recommendReason}
                              </p>
                            </div>
                          )}

                          {/* Notes */}
                          {editingId === item.id ? (
                            <div className="mt-2 flex gap-2">
                              <input
                                type="text"
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                placeholder="添加备注..."
                                className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && saveNotes(item)}
                              />
                              <button
                                onClick={() => saveNotes(item)}
                                className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            </div>
                          ) : item.notes ? (
                            <p
                              className="mt-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-smooth"
                              onClick={() => startEditNotes(item)}
                            >
                              📝 {item.notes}
                            </p>
                          ) : null}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col items-end gap-2">
                          <p className="text-sm font-semibold text-primary">
                            {item.cost > 0 ? `¥${item.cost}` : '免费'}
                          </p>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-smooth">
                            <button
                              onClick={() => startEditNotes(item)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-smooth"
                              title="编辑备注"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => removeItem(item.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-smooth"
                              title="删除"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Micro Notes for this POI ── */}
                  {savedTripId && attraction && (() => {
                    const poiNotes = getNotesForPoi(item.attractionId)
                    return (
                      <div className="ml-0 sm:ml-5">
                        {poiNotes.map(note => (
                          <NoteCard
                            key={note.id}
                            note={note}
                            variant="compact"
                            isOwner={user?.id === note.authorId}
                            onEdit={handleEditNote}
                            onDelete={handleDeleteNote}
                          />
                        ))}
                        {/* Write note button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); openNoteEditor(attraction) }}
                          className="mt-1.5 flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-journal/70 transition-all duration-200 hover:bg-journal-light hover:text-journal"
                        >
                          <MessageSquarePlus className="h-3 w-3" />
                          写游记
                        </button>
                      </div>
                    )
                  })()}

                  {/* Inline insert button after each item */}
                  {renderInsertButton(index + 1)}
                  {renderInsertPopup(index + 1)}
                </div>
              )
            })}

            {/* Transport from last item to end hotel */}
            {(() => {
              const lastItem = day.items[day.items.length - 1]
              const lastAttraction = lastItem ? getAttraction(lastItem.attractionId) : null
              if (endHotel && lastAttraction) {
                return renderTransitInfo(
                  lastItem.attractionId, 'hotel-end',
                  lastAttraction.lat, lastAttraction.lng,
                  endHotel.lat, endHotel.lng,
                )
              }
              return null
            })()}

            {/* ── End Hotel ── */}
            {renderHotelCard(endHotel, '入住酒店', false)}

            {/* ── Hotel Recommendation ── */}
            {!endHotel && day.items.length > 0 && hotelRecommendations.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setShowHotelRec(!showHotelRec)}
                  className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-smooth mb-2"
                >
                  <Sparkles className="h-3 w-3" />
                  智能推荐酒店
                  {showHotelRec ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>

                {showHotelRec && (
                  <div className="space-y-2 animate-fade-in">
                    <p className="text-[10px] text-muted-foreground">基于当天路线推荐最近的酒店</p>
                    {hotelRecommendations.map((h: any) => (
                      <button
                        key={h.id}
                        onClick={() => dispatch({ type: 'SET_DAY_HOTEL', payload: { dayIndex, hotel: { id: h.id, name: h.name, address: h.address, lat: h.lat, lng: h.lng } } })}
                        className="flex items-center gap-3 w-full rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/40 to-violet-50/40 p-3 text-left hover:border-indigo-300 hover:shadow-sm transition-all"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 flex-shrink-0">
                          <Hotel className="h-4 w-4 text-indigo-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{h.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{h.address}</p>
                        </div>
                        {h.dist != null && (
                          <span className="text-[10px] font-medium text-indigo-600 whitespace-nowrap">
                            {h.dist < 1 ? `${Math.round(h.dist * 1000)}m` : `${h.dist.toFixed(1)}km`}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* Note Editor Modal */}
    <NoteEditorModal
      open={noteEditorOpen}
      onClose={() => setNoteEditorOpen(false)}
      onSubmit={handleNoteSubmit}
      poiName={noteEditorPoiName}
      poiType={noteEditorPoiType}
      dayNumber={day.dayNumber}
      editingNote={editingMicroNote}
      submitting={noteSubmitting}
    />
    </>
  )
}
