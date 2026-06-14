import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useApp } from '@/context/AppContext'
import { displayName } from '@/utils/poiName'
import {
  popularCities, getAttractions, setCityAttractions, hasCityAttractions,
  getAttractionTypeLabel, getAttractionTypeIcon
} from '@/data/mock-data'
import { Attraction } from '@/types'
import { generateItinerary } from '@/utils/routePlanner'
import { handleImgError } from '@/utils/imageProxy'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, ArrowRight, Check, MapPin, Star, Clock, Coins,
  Search, X, Map as MapIcon, List, ChevronDown, Loader2,
  Sparkles, SlidersHorizontal, ShoppingCart, Trash2, Eye,
  ChevronUp, Info, DollarSign,
} from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import type { Marker as LeafletMarker } from 'leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/* ── Category definitions (no 'all') ── */
type PlaceCategory = 'scenic' | 'food' | 'shopping' | 'activity'

const CATEGORIES: { key: PlaceCategory; label: string; icon: string; desc: string }[] = [
  { key: 'scenic',   label: '景点', icon: '🏛️', desc: '名胜古迹·自然风光' },
  { key: 'food',     label: '餐饮', icon: '🍜', desc: '美食·小吃·咖啡' },
  { key: 'shopping', label: '购物', icon: '🛍️', desc: '商圈·市场·特产' },
  { key: 'activity', label: '娱乐', icon: '🎯', desc: '体验·表演·户外' },
]

/* ── Sort types ── */
type SortKey = 'recommend' | 'rating' | 'duration' | 'seasonal'
const SORT_LABELS: Record<SortKey, string> = {
  recommend: '推荐排序',
  seasonal:  '当季指数↓',
  rating:    '综合评分↓',
  duration:  '游玩时长↓',
}

/* ── Filter state per category ── */
interface ScenicFilter {
  subType: string   // 二级标签
  minDuration: number
  maxCost: number
  minRating: number
  openNow: boolean
  minSeasonal: number
}
interface FoodFilter {
  subType: string
  maxCost: number
  minRating: number
  openNow: boolean
}
interface ShoppingFilter {
  subType: string
  maxCost: number
  minRating: number
  openNow: boolean
}
interface ActivityFilter {
  subType: string
  maxCost: number
  minDuration: number
  minRating: number
}

const DEFAULT_SCENIC:   ScenicFilter   = { subType: '', minDuration: 0, maxCost: 9999, minRating: 0, openNow: false, minSeasonal: 0 }
const DEFAULT_FOOD:     FoodFilter     = { subType: '', maxCost: 9999, minRating: 0, openNow: false }
const DEFAULT_SHOPPING: ShoppingFilter = { subType: '', maxCost: 9999, minRating: 0, openNow: false }
const DEFAULT_ACTIVITY: ActivityFilter = { subType: '', maxCost: 9999, minDuration: 0, minRating: 0 }

/* ── Map marker icons ── */
function createPlaceIcon(type: Attraction['type'], isSelected: boolean, isHighlighted = false) {
  const colorMap: Record<string, string> = {
    scenic: 'hsl(12 76% 61%)', food: 'hsl(28 87% 62%)',
    shopping: 'hsl(260 60% 55%)', activity: 'hsl(199 89% 48%)',
    hotel: 'hsl(220 70% 55%)', transport: 'hsl(150 60% 45%)',
  }
  const emojiMap: Record<string, string> = {
    scenic: '🏛️', food: '🍜', shopping: '🛍️', activity: '🎯', hotel: '🏨', transport: '🚗',
  }
  const color = colorMap[type] || 'hsl(12 76% 61%)'
  const emoji = emojiMap[type] || '📍'
  const size = isHighlighted ? 44 : isSelected ? 36 : 28
  const border = isHighlighted ? '4px solid #fff' : '3px solid white'
  const shadow = isHighlighted ? '0 0 0 3px hsl(12 76% 61%), 0 4px 12px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.35)'
  const opacity = isSelected ? 1 : 0.8
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${border};box-shadow:${shadow};display:flex;align-items:center;justify-content:center;font-size:${isHighlighted ? 20 : isSelected ? 16 : 12}px;opacity:${opacity};transition:all 0.2s;">${emoji}</div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2],
  })
}

/* ── Map helpers ── */
function FlyTo({ lat, lng, zoom }: { lat: number; lng: number; zoom?: number }) {
  const map = useMap()
  useEffect(() => { map.flyTo([lat, lng], zoom ?? map.getZoom(), { duration: 0.8 }) }, [lat, lng, zoom, map])
  return null
}
function MapResizeFix() {
  const map = useMap()
  useEffect(() => { const t = setTimeout(() => map.invalidateSize(), 200); return () => clearTimeout(t) }, [map])
  return null
}

/* ── Marker that auto-opens its Popup when activeId matches ── */
function MarkerWithAutoPopup({
  id, activeId, position, icon, onMarkerClick, children,
}: {
  id: string
  activeId: string | null
  position: [number, number]
  icon: L.Icon | L.DivIcon
  onMarkerClick: () => void
  children: React.ReactNode
}) {
  const markerRef = useRef<LeafletMarker | null>(null)
  useEffect(() => {
    if (activeId === id && markerRef.current) {
      const t = setTimeout(() => { markerRef.current?.openPopup() }, 600)
      return () => clearTimeout(t)
    }
  }, [activeId, id])
  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={icon}
      eventHandlers={{ click: onMarkerClick }}
    >
      {children}
    </Marker>
  )
}

/* ── Format helpers ── */
function formatDuration(min: number) {
  if (min < 60) return `${min}分钟`
  const h = Math.floor(min / 60); const m = min % 60
  return m > 0 ? `${h}h${m}m` : `${h}小时`
}
function formatCost(cost: number) { return cost === 0 ? '免费' : `¥${cost}` }

function getCurrentSeasonLabel(): string {
  const month = new Date().getMonth() + 1
  if (month >= 3 && month <= 5) return '春季'
  if (month >= 6 && month <= 8) return '夏季'
  if (month >= 9 && month <= 11) return '秋季'
  return '冬季'
}

function isOpenNow(openTime?: string, closeTime?: string): boolean {
  if (!openTime || !closeTime) return true
  const now = new Date()
  const [oh, om] = openTime.split(':').map(Number)
  const [ch, cm] = closeTime.split(':').map(Number)
  const cur = now.getHours() * 60 + now.getMinutes()
  const open = oh * 60 + om
  const close = ch * 60 + cm
  return cur >= open && cur <= close
}

/* ── Extract unique sub-tags for a category ── */
function getSubTypes(attractions: Attraction[]): string[] {
  const set = new Set<string>()
  attractions.forEach((a) => a.tags.forEach((t) => set.add(t)))
  return Array.from(set).slice(0, 12)
}

/* ── Active filter count ── */
function countActiveFilters(cat: PlaceCategory, sf: ScenicFilter, ff: FoodFilter, shf: ShoppingFilter, af: ActivityFilter): number {
  if (cat === 'scenic') {
    return [sf.subType, sf.minDuration > 0, sf.maxCost < 9999, sf.minRating > 0, sf.openNow, sf.minSeasonal > 0].filter(Boolean).length
  }
  if (cat === 'food') {
    return [ff.subType, ff.maxCost < 9999, ff.minRating > 0, ff.openNow].filter(Boolean).length
  }
  if (cat === 'shopping') {
    return [shf.subType, shf.maxCost < 9999, shf.minRating > 0, shf.openNow].filter(Boolean).length
  }
  if (cat === 'activity') {
    return [af.subType, af.maxCost < 9999, af.minDuration > 0, af.minRating > 0].filter(Boolean).length
  }
  return 0
}

/* ═══════════════════════════════════════════════ */
/* ══ Main Component                           ══ */
/* ═══════════════════════════════════════════════ */

export default function PlaceSelectionPage() {
  const { state, dispatch } = useApp()
  const trip = state.currentTrip
  const city = popularCities.find((c) => c.id === trip?.cityId)

  /* ── Core state ── */
  const [activeCategory, setActiveCategory] = useState<PlaceCategory>('scenic')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null)
  const [isPlanning, setIsPlanning] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('recommend')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [detailPOI, setDetailPOI] = useState<Attraction | null>(null)
  const [cartOpen, setCartOpen] = useState(false)

  /* ── Filter state per category ── */
  const [scenicFilter, setScenicFilter] = useState<ScenicFilter>(DEFAULT_SCENIC)
  const [foodFilter, setFoodFilter] = useState<FoodFilter>(DEFAULT_FOOD)
  const [shoppingFilter, setShoppingFilter] = useState<ShoppingFilter>(DEFAULT_SHOPPING)
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>(DEFAULT_ACTIVITY)

  // POI data loading state
  const [poiLoading, setPoiLoading] = useState(false)
  const [poiLoaded, setPoiLoaded] = useState(false)

  const selectedIds = state.selectedPlaceIds
  const seasonLabel = getCurrentSeasonLabel()

  /* ── Load POIs ── */
  useEffect(() => {
    if (!city) return
    if (hasCityAttractions(city.id)) { setPoiLoaded(true); return }
    fetchPOIsFromDB()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city?.id])

  const fetchPOIsFromDB = useCallback(async () => {
    if (!city) return
    setPoiLoading(true)
    try {
      const response = await fetch(`/api/pois/${encodeURIComponent(city.id)}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json()
      if (result.success && result.data?.length > 0) {
        const attractions = castPOIs(result.data)
        setCityAttractions(city.id, attractions)
      }
      setPoiLoaded(true)
    } catch (err) {
      console.error('[PlaceSelection] Failed to load POIs:', err)
      setPoiLoaded(true)
    } finally {
      setPoiLoading(false)
    }
  }, [city])

  const castPOIs = (raw: unknown[]): Attraction[] => {
    if (!Array.isArray(raw)) return []
    return raw.map((item) => {
      const r = item as Record<string, unknown>
      return {
        id: String(r.id || ''),
        name: String(r.name || ''),
        nameZh: String(r.nameZh || r.name || ''),
        type: String(r.type || 'scenic') as Attraction['type'],
        image: String(r.image || ''),
        rating: Number(r.rating) || 4.0,
        duration: Number(r.duration) || 60,
        cost: Number(r.cost) || 0,
        description: String(r.description || ''),
        address: String(r.address || ''),
        lat: Number(r.lat) || 0,
        lng: Number(r.lng) || 0,
        tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
        openTime: String(r.openTime || '09:00'),
        closeTime: String(r.closeTime || '22:00'),
        recommendReason: String(r.recommendReason || ''),
        ...(r.mealType ? { mealType: String(r.mealType) as Attraction['mealType'] } : {}),
        ...(r.seasonScore != null ? { seasonalIndex: Math.round((Number(r.seasonScore) / 2) * 10) / 10 } : {}),
      } satisfies Attraction
    })
  }

  /* ── Derived data ── */
  const allAttractions = useMemo(() => {
    if (!city) return []
    return getAttractions(city.id).filter((a) => a.type !== 'hotel' && a.type !== 'transport')
  }, [city, poiLoaded])

  const categoryAttractions = useMemo(() => {
    return allAttractions.filter((a) => a.type === activeCategory)
  }, [allAttractions, activeCategory])

  // Sub-types for filters
  const subTypes = useMemo(() => getSubTypes(categoryAttractions), [categoryAttractions])

  // Apply filters
  const filteredAttractions = useMemo(() => {
    let list = searchQuery.trim()
      ? allAttractions.filter((a) => {
          const q = searchQuery.toLowerCase()
          return a.name.toLowerCase().includes(q) ||
            (a.nameZh && a.nameZh.toLowerCase().includes(q)) ||
            a.description.toLowerCase().includes(q) ||
            a.tags.some((t) => t.toLowerCase().includes(q))
        })
      : categoryAttractions

    // Apply category-specific filters
    if (!searchQuery.trim()) {
      if (activeCategory === 'scenic') {
        const f = scenicFilter
        if (f.subType) list = list.filter((a) => a.tags.includes(f.subType))
        if (f.minDuration > 0) list = list.filter((a) => a.duration >= f.minDuration)
        if (f.maxCost < 9999) list = list.filter((a) => a.cost <= f.maxCost)
        if (f.minRating > 0) list = list.filter((a) => a.rating >= f.minRating)
        if (f.openNow) list = list.filter((a) => isOpenNow(a.openTime, a.closeTime))
        if (f.minSeasonal > 0) list = list.filter((a) => (a.seasonalIndex || 0) >= f.minSeasonal)
      } else if (activeCategory === 'food') {
        const f = foodFilter
        if (f.subType) list = list.filter((a) => a.tags.includes(f.subType))
        if (f.maxCost < 9999) list = list.filter((a) => a.cost <= f.maxCost)
        if (f.minRating > 0) list = list.filter((a) => a.rating >= f.minRating)
        if (f.openNow) list = list.filter((a) => isOpenNow(a.openTime, a.closeTime))
      } else if (activeCategory === 'shopping') {
        const f = shoppingFilter
        if (f.subType) list = list.filter((a) => a.tags.includes(f.subType))
        if (f.maxCost < 9999) list = list.filter((a) => a.cost <= f.maxCost)
        if (f.minRating > 0) list = list.filter((a) => a.rating >= f.minRating)
        if (f.openNow) list = list.filter((a) => isOpenNow(a.openTime, a.closeTime))
      } else if (activeCategory === 'activity') {
        const f = activityFilter
        if (f.subType) list = list.filter((a) => a.tags.includes(f.subType))
        if (f.maxCost < 9999) list = list.filter((a) => a.cost <= f.maxCost)
        if (f.minDuration > 0) list = list.filter((a) => a.duration >= f.minDuration)
        if (f.minRating > 0) list = list.filter((a) => a.rating >= f.minRating)
      }
    }

    // Sort
    const sorted = [...list]
    switch (sortKey) {
      case 'seasonal':
        sorted.sort((a, b) => (b.seasonalIndex || 0) - (a.seasonalIndex || 0))
        break
      case 'rating':
        sorted.sort((a, b) => b.rating - a.rating)
        break
      case 'duration':
        sorted.sort((a, b) => b.duration - a.duration)
        break
      default:
        // 推荐排序：评分 + 当季指数加权
        sorted.sort((a, b) => {
          const sa = a.rating * 0.6 + (a.seasonalIndex || 3) * 0.4
          const sb = b.rating * 0.6 + (b.seasonalIndex || 3) * 0.4
          return sb - sa
        })
    }
    return sorted
  }, [allAttractions, categoryAttractions, activeCategory, searchQuery, sortKey, scenicFilter, foodFilter, shoppingFilter, activityFilter])

  const selectedAttractions = useMemo(
    () => allAttractions.filter((a) => selectedIds.includes(a.id)),
    [allAttractions, selectedIds]
  )

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of allAttractions) counts[a.type] = (counts[a.type] || 0) + 1
    return counts
  }, [allAttractions])

  const selectedCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of selectedAttractions) counts[a.type] = (counts[a.type] || 0) + 1
    return counts
  }, [selectedAttractions])

  const activeFilterCount = useMemo(
    () => countActiveFilters(activeCategory, scenicFilter, foodFilter, shoppingFilter, activityFilter),
    [activeCategory, scenicFilter, foodFilter, shoppingFilter, activityFilter]
  )

  if (!trip || !city) return null

  /* ── Handlers ── */
  const handleToggle = (id: string) => dispatch({ type: 'TOGGLE_PLACE', payload: id })

  // 列表卡片点击：定位到地图并弹出 Popup（与酒店页一致）
  const handleLocateAndHighlight = (a: Attraction) => {
    setFlyTarget({ lat: a.lat, lng: a.lng })
    setHighlightedId(a.id)
    setActiveMarkerId(a.id)
    if (viewMode === 'list') setViewMode('map')
    setTimeout(() => setHighlightedId(null), 3000)
  }

  // 查看详情：弹右侧抽屉，同时地图定位
  const handleViewDetail = (a: Attraction) => {
    setDetailPOI(a)
    setFlyTarget({ lat: a.lat, lng: a.lng })
    setHighlightedId(a.id)
    setActiveMarkerId(a.id)
    setTimeout(() => setHighlightedId(null), 3000)
  }

  const handleNext = useCallback(() => {
    if (!trip || !city) return
    if (selectedAttractions.length > 0) {
      setIsPlanning(true)
      setTimeout(() => {
        try {
          const result = generateItinerary(selectedAttractions, trip.days, city.id)
          dispatch({ type: 'SET_ALL_DAYS_ITEMS', payload: { dayItems: result.dayItems, skippedPOIs: result.skippedPOIs } })
          setIsPlanning(false)
          if (result.skippedPOIs && result.skippedPOIs.length > 0) {
            dispatch({ type: 'SET_VIEW', payload: 'poi-overflow' })
          } else {
            dispatch({ type: 'SET_VIEW', payload: 'planner' })
          }
        } catch (e) { console.error('Route planning failed:', e) }
        setIsPlanning(false)
      }, 100)
    } else {
      dispatch({ type: 'SET_VIEW', payload: 'planner' })
    }
  }, [trip, city, selectedAttractions, dispatch])

  const handleBack = () => dispatch({ type: 'SET_VIEW', payload: 'hotel-step' })

  const resetFilters = () => {
    if (activeCategory === 'scenic') setScenicFilter(DEFAULT_SCENIC)
    else if (activeCategory === 'food') setFoodFilter(DEFAULT_FOOD)
    else if (activeCategory === 'shopping') setShoppingFilter(DEFAULT_SHOPPING)
    else if (activeCategory === 'activity') setActivityFilter(DEFAULT_ACTIVITY)
  }

  /* ═════════════════════════ MAIN RENDER ═════════════════════════ */
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-[1000] glass border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">返回</span>
          </Button>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <StepDot step={1} done label="目的地" />
            <div className="h-0.5 w-6 sm:w-10 rounded-full bg-primary" />
            <StepDot step={2} done label="酒店" />
            <div className="h-0.5 w-6 sm:w-10 rounded-full bg-primary" />
            <StepDot step={3} active label="选择地点" />
            <ProgressLine filled={false} />
            <StepDot step={4} label="行程规划" />
          </div>
          <div className="w-16 sm:w-24" />
        </div>
      </header>

      {/* Content layout */}
      <div className="flex h-[calc(100svh-56px)] flex-col lg:flex-row">
        {/* ── Left panel ── */}
        <div className={`flex flex-col ${viewMode === 'map' ? 'max-lg:hidden' : ''} lg:w-[460px] lg:shrink-0 lg:border-r lg:border-border`}>
          {/* Title bar */}
          <div className="shrink-0 border-b border-border px-4 pb-3 pt-4 sm:px-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-coral-light px-3 py-1 text-[10px] font-semibold text-coral-dark">
                    <MapPin className="h-3 w-3" />
                    第三步 · 选择想去的地点
                  </span>
                </div>
                <h2 className="text-lg font-bold text-foreground">
                  {city.name} · {seasonLabel}精选
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  共 {allAttractions.length} 个{seasonLabel}推荐地点
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
                  className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-card transition-smooth hover:bg-secondary lg:hidden"
                >
                  {viewMode === 'list' ? <MapIcon className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
                  {viewMode === 'list' ? '地图' : '列表'}
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索地点、美食、景点..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-smooth"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category tabs */}
            <div className="mb-2.5 flex gap-1.5 overflow-x-auto scrollbar-hide">
              {CATEGORIES.map((cat) => {
                const count = categoryCounts[cat.key] || 0
                const isActive = activeCategory === cat.key && !searchQuery.trim()
                const selCount = selectedCategoryCounts[cat.key] || 0
                return (
                  <button
                    key={cat.key}
                    onClick={() => { setActiveCategory(cat.key); setSearchQuery(''); setShowFilters(false) }}
                    className={`relative flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                      isActive ? 'gradient-hero text-white shadow-elegant' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                    <span className={`text-[9px] ${isActive ? 'text-white/80' : 'text-muted-foreground/60'}`}>{count}</span>
                    {selCount > 0 && (
                      <span className={`absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[8px] font-bold ${
                        isActive ? 'bg-white text-primary' : 'gradient-hero text-white'
                      }`}>
                        {selCount}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Sort & Filter row */}
            {!searchQuery.trim() && (
              <div className="flex items-center gap-2">
                {/* Sort dropdown */}
                <div className="relative">
                  <button
                    onClick={() => { setShowSortMenu(!showSortMenu); setShowFilters(false) }}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-secondary transition-smooth"
                  >
                    <span>{SORT_LABELS[sortKey]}</span>
                    <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
                  </button>
                  {showSortMenu && (
                    <div className="absolute left-0 top-full z-50 mt-1 min-w-[130px] rounded-xl border border-border bg-card shadow-float animate-fade-in">
                      {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                        <button
                          key={k}
                          onClick={() => { setSortKey(k); setShowSortMenu(false) }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-[11px] transition-smooth first:rounded-t-xl last:rounded-b-xl ${
                            sortKey === k ? 'bg-coral-light text-coral-dark font-semibold' : 'text-foreground hover:bg-secondary'
                          }`}
                        >
                          {sortKey === k && <Check className="h-3 w-3" />}
                          {sortKey !== k && <span className="w-3" />}
                          {SORT_LABELS[k]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Filter button */}
                <button
                  onClick={() => { setShowFilters(!showFilters); setShowSortMenu(false) }}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-smooth ${
                    activeFilterCount > 0
                      ? 'border-primary bg-coral-light text-coral-dark'
                      : 'border-border bg-card text-foreground hover:bg-secondary'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  筛选{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
                </button>

                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
                    清除
                  </button>
                )}

                <span className="ml-auto text-[10px] text-muted-foreground">
                  {filteredAttractions.length}个地点
                </span>
              </div>
            )}

            {/* Filter panel */}
            {showFilters && !searchQuery.trim() && (
              <FilterPanel
                category={activeCategory}
                subTypes={subTypes}
                scenicFilter={scenicFilter} setScenicFilter={setScenicFilter}
                foodFilter={foodFilter} setFoodFilter={setFoodFilter}
                shoppingFilter={shoppingFilter} setShoppingFilter={setShoppingFilter}
                activityFilter={activityFilter} setActivityFilter={setActivityFilter}
                onClose={() => setShowFilters(false)}
              />
            )}
          </div>

          {/* List area */}
          <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4">
            {/* Loading */}
            {poiLoading && (
              <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                <Loader2 className="h-7 w-7 text-coral animate-spin mb-3" />
                <p className="text-sm font-bold text-foreground mb-1">正在加载地点数据</p>
                <p className="text-[11px] text-muted-foreground text-center">正在加载 {city.name} {seasonLabel}推荐地点...</p>
              </div>
            )}

            {/* No data */}
            {!poiLoading && allAttractions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
                <MapPin className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-base font-bold text-foreground mb-1">暂无地点数据</p>
                <p className="text-[11px] text-muted-foreground">{city.name} 暂无推荐地点数据</p>
              </div>
            )}

            {/* Attractions list */}
            {!poiLoading && allAttractions.length > 0 && (
              <div className="space-y-2">
                {searchQuery.trim() && (
                  <p className="mb-1 text-xs text-muted-foreground px-0.5">
                    找到 <span className="font-semibold text-foreground">{filteredAttractions.length}</span> 个相关地点
                  </p>
                )}
                {filteredAttractions.map((a) => (
                  <AttractionCard
                    key={a.id}
                    attraction={a}
                    isSelected={selectedIds.includes(a.id)}
                    onToggle={() => handleToggle(a.id)}
                    onLocate={() => handleLocateAndHighlight(a)}
                    onViewDetail={() => handleViewDetail(a)}
                  />
                ))}
                {filteredAttractions.length === 0 && (
                  <div className="py-12 text-center">
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? '没有找到相关地点' : '暂无符合条件的地点'}
                    </p>
                    {activeFilterCount > 0 && (
                      <button onClick={resetFilters} className="mt-2 text-xs text-primary underline">清除筛选条件</button>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="h-28 lg:h-20" />
          </div>
        </div>

        {/* ── Right panel: Map ── */}
        <div className={`relative flex-1 ${viewMode === 'list' ? 'max-lg:hidden' : ''}`}>
          <MapContainer center={[city.lat, city.lng]} zoom={12} className="h-full w-full" zoomControl={false}>
            <TileLayer
              attribution='&copy; OpenStreetMap &copy; CARTO'
              url="/api/tiles/{z}/{x}/{y}"
              subdomains=""
              maxZoom={20}
            />
            <MapResizeFix />
            {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} zoom={15} />}

            {filteredAttractions.map((a) => {
              const isSelected = selectedIds.includes(a.id)
              const isHighlighted = highlightedId === a.id
              return (
                <MarkerWithAutoPopup
                  key={a.id}
                  id={a.id}
                  activeId={activeMarkerId}
                  position={[a.lat, a.lng]}
                  icon={createPlaceIcon(a.type, isSelected, isHighlighted)}
                  onMarkerClick={() => {
                    setFlyTarget({ lat: a.lat, lng: a.lng })
                    setActiveMarkerId(a.id)
                    setHighlightedId(a.id)
                    setTimeout(() => setHighlightedId(null), 3000)
                  }}
                >
                  <Popup>
                    <div className="min-w-[200px] max-w-[260px]">
                      <div className="flex gap-2 mb-1.5">
                        <img src={a.image} alt={displayName(a)} className="h-12 w-12 rounded-lg object-cover shrink-0" onError={handleImgError} />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm leading-tight">{displayName(a)}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mt-0.5">
                            <span>{getAttractionTypeIcon(a.type)} {getAttractionTypeLabel(a.type)}</span>
                            <span>⭐ {a.rating}</span>
                          </div>
                        </div>
                      </div>
                      {a.recommendReason && <p className="text-[11px] text-violet-600 mb-1.5">✨ {a.recommendReason}</p>}
                      <p className="text-[11px] text-gray-600 line-clamp-2 mb-2">{a.description}</p>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-2">
                        <span>🕐 {formatDuration(a.duration)}</span>
                        <span>💰 {formatCost(a.cost)}</span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleToggle(a.id)}
                          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
                            isSelected ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-orange-500 text-white hover:bg-orange-600'
                          }`}
                        >
                          {isSelected ? '✓ 已添加 · 移除' : '+ 添加到行程'}
                        </button>
                        <button
                          onClick={() => handleViewDetail(a)}
                          className="rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium hover:bg-gray-50"
                        >
                          详情
                        </button>
                      </div>
                    </div>
                  </Popup>
                </MarkerWithAutoPopup>
              )
            })}
          </MapContainer>

          {/* Map legend */}
          <div className="absolute left-3 top-3 z-[500] rounded-xl glass border border-border px-3 py-2 shadow-card">
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">图例</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {[
                { color: 'hsl(12 76% 61%)', label: '景点', emoji: '🏛️' },
                { color: 'hsl(28 87% 62%)', label: '美食', emoji: '🍜' },
                { color: 'hsl(260 60% 55%)', label: '购物', emoji: '🛍️' },
                { color: 'hsl(199 89% 48%)', label: '体验', emoji: '🎯' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="h-3 w-3 rounded-full border border-white shadow-sm" style={{ background: item.color }} />
                  <span>{item.emoji} {item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile back to list */}
          {viewMode === 'map' && (
            <button
              onClick={() => setViewMode('list')}
              className="absolute left-3 bottom-24 z-[500] flex items-center gap-1.5 rounded-xl glass border border-border px-3 py-2 text-xs font-medium text-foreground shadow-card lg:hidden"
            >
              <List className="h-3.5 w-3.5" />
              返回列表
            </button>
          )}
        </div>
      </div>

      {/* ── POI Detail Drawer ── */}
      {detailPOI && (
        <POIDetailDrawer
          poi={detailPOI}
          isSelected={selectedIds.includes(detailPOI.id)}
          onClose={() => setDetailPOI(null)}
          onToggle={() => handleToggle(detailPOI.id)}
        />
      )}

      {/* ── POI Cart ── */}
      <POICart
        selectedAttractions={selectedAttractions}
        cartOpen={cartOpen}
        setCartOpen={setCartOpen}
        onRemove={(id) => dispatch({ type: 'TOGGLE_PLACE', payload: id })}
        onViewDetail={(a) => setDetailPOI(a)}
      />

      {/* ── Bottom action bar ── */}
      <div className="fixed bottom-0 inset-x-0 z-[900] glass border-t border-border safe-bottom">
        {isPlanning && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 rounded-2xl bg-card p-8 shadow-float animate-fade-in">
              <div className="h-16 w-16 rounded-full gradient-hero flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-foreground mb-1">智能规划中</h3>
                <p className="text-sm text-muted-foreground">正在为您优化路线，安排餐饮与景点...</p>
              </div>
            </div>
          </div>
        )}
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Cart trigger */}
          <button
            onClick={() => setCartOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-smooth shadow-card"
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">已选地点</span>
            {selectedAttractions.length > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full gradient-hero px-1 text-[10px] font-bold text-white">
                {selectedAttractions.length}
              </span>
            )}
          </button>

          <Button variant="coral" size="default" onClick={handleNext} disabled={isPlanning} className="group shrink-0">
            {isPlanning ? (
              <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />智能规划中...</>
            ) : (
              <>
                {selectedAttractions.length > 0 ? '开始规划行程' : '跳过，直接规划'}
                <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Click-outside handler for sort menu */}
      {showSortMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════ */
/* ── Attraction Card Component                 ── */
/* ═══════════════════════════════════════════════ */

function AttractionCard({
  attraction: a, isSelected, onToggle, onLocate, onViewDetail
}: {
  attraction: Attraction; isSelected: boolean
  onToggle: () => void; onLocate: () => void; onViewDetail: () => void
}) {
  return (
    <div
      className={`group relative rounded-2xl border-2 transition-all duration-300 cursor-pointer ${
        isSelected
          ? 'border-primary bg-coral-light shadow-elegant'
          : 'border-transparent bg-card shadow-card hover:shadow-card-hover hover:-translate-y-0.5'
      } p-3`}
      onClick={onLocate}
    >
      <div className="flex gap-3">
        {/* Image */}
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl">
          <img
            src={a.image}
            alt={displayName(a)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={handleImgError}
          />
          <div className="absolute left-1 top-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
            {getAttractionTypeIcon(a.type)} {getAttractionTypeLabel(a.type)}
          </div>
          {/* Seasonal index badge */}
          {a.seasonalIndex && a.seasonalIndex >= 4 && (
            <div className="absolute right-1 bottom-1 rounded-md bg-amber-500/90 px-1 py-0.5 text-[8px] font-bold text-white">
              🌟{a.seasonalIndex}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground leading-tight line-clamp-1 text-[15px]">
              {displayName(a)}
            </h3>
            <div className="flex items-center gap-1 shrink-0">
              {/* View detail icon — stops propagation so it opens drawer, not map popup */}
              <button
                onClick={(e) => { e.stopPropagation(); onViewDetail() }}
                className="mt-0.5 rounded-md p-0.5 text-muted-foreground hover:bg-secondary hover:text-primary transition-colors"
                title="查看详情"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              {/* Select checkbox */}
              <div
                onClick={(e) => { e.stopPropagation(); onToggle() }}
                className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all cursor-pointer ${
                  isSelected ? 'border-primary gradient-hero' : 'border-border bg-card group-hover:border-primary/40'
                }`}
              >
                {isSelected && <Check className="h-3 w-3 text-white" />}
              </div>
            </div>
          </div>

          {/* Recommend reason */}
          {a.recommendReason && (
            <div className="mb-1.5 flex items-start gap-1">
              <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-primary/80 line-clamp-1">{a.recommendReason}</p>
            </div>
          )}
          {!a.recommendReason && (
            <p className="mb-1.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">{a.description}</p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 text-amber-400" fill="currentColor" />
              <span className="font-semibold text-foreground">{a.rating}</span>
            </span>
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {formatDuration(a.duration)}
            </span>
            <span className={`flex items-center gap-0.5 font-medium ${a.cost === 0 ? 'text-green-600' : 'text-foreground'}`}>
              <Coins className="h-3 w-3" />
              {formatCost(a.cost)}
            </span>
            {a.seasonalIndex != null && (
              <span className="flex items-center gap-0.5 text-amber-600">
                <Sparkles className="h-3 w-3" />
                {a.seasonalIndex.toFixed(1)}
              </span>
            )}
            {/* 地图按钮 — 冗余入口，与整体点击效果一样 */}
            <span className="ml-auto flex items-center gap-0.5 text-primary">
              <MapPin className="h-3 w-3" />
              地图定位
            </span>
          </div>

          {a.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {a.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════ */
/* ── Filter Panel Component                   ── */
/* ═══════════════════════════════════════════════ */

function FilterPanel({
  category, subTypes,
  scenicFilter, setScenicFilter,
  foodFilter, setFoodFilter,
  shoppingFilter, setShoppingFilter,
  activityFilter, setActivityFilter,
  onClose,
}: {
  category: PlaceCategory
  subTypes: string[]
  scenicFilter: ScenicFilter; setScenicFilter: (f: ScenicFilter) => void
  foodFilter: FoodFilter; setFoodFilter: (f: FoodFilter) => void
  shoppingFilter: ShoppingFilter; setShoppingFilter: (f: ShoppingFilter) => void
  activityFilter: ActivityFilter; setActivityFilter: (f: ActivityFilter) => void
  onClose: () => void
}) {
  const COST_OPTIONS = [
    { label: '不限', value: 9999 },
    { label: '免费', value: 0 },
    { label: '¥100以下', value: 100 },
    { label: '¥300以下', value: 300 },
    { label: '¥500以下', value: 500 },
  ]
  const RATING_OPTIONS = [
    { label: '不限', value: 0 },
    { label: '4.0+', value: 4.0 },
    { label: '4.3+', value: 4.3 },
    { label: '4.5+', value: 4.5 },
  ]
  const DURATION_OPTIONS = [
    { label: '不限', value: 0 },
    { label: '30分钟+', value: 30 },
    { label: '1小时+', value: 60 },
    { label: '2小时+', value: 120 },
    { label: '半天+', value: 240 },
  ]
  const SEASONAL_OPTIONS = [
    { label: '不限', value: 0 },
    { label: '3分+', value: 3 },
    { label: '4分+', value: 4 },
    { label: '4.5分+', value: 4.5 },
  ]

  function FilterChips({ label, options, value, onChange }: {
    label: string
    options: { label: string; value: number | string | boolean }[]
    value: number | string | boolean
    onChange: (v: number | string | boolean) => void
  }) {
    return (
      <div className="mb-3">
        <p className="mb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => onChange(opt.value)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-smooth ${
                value === opt.value
                  ? 'gradient-hero text-white shadow-sm'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2.5 rounded-xl border border-border bg-card p-3 shadow-card animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-foreground">
          {category === 'scenic' ? '景点筛选' : category === 'food' ? '餐饮筛选' : category === 'shopping' ? '购物筛选' : '娱乐筛选'}
        </p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Sub-type tags */}
      {subTypes.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {category === 'scenic' ? '景点类型' : category === 'food' ? '美食类目' : category === 'shopping' ? '购物类型' : '游玩类型'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => {
                if (category === 'scenic') setScenicFilter({ ...scenicFilter, subType: '' })
                else if (category === 'food') setFoodFilter({ ...foodFilter, subType: '' })
                else if (category === 'shopping') setShoppingFilter({ ...shoppingFilter, subType: '' })
                else setActivityFilter({ ...activityFilter, subType: '' })
              }}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-smooth ${
                (category === 'scenic' ? scenicFilter.subType : category === 'food' ? foodFilter.subType : category === 'shopping' ? shoppingFilter.subType : activityFilter.subType) === ''
                  ? 'gradient-hero text-white shadow-sm' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
              }`}
            >
              全部
            </button>
            {subTypes.map((tag) => {
              const cur = category === 'scenic' ? scenicFilter.subType : category === 'food' ? foodFilter.subType : category === 'shopping' ? shoppingFilter.subType : activityFilter.subType
              return (
                <button
                  key={tag}
                  onClick={() => {
                    if (category === 'scenic') setScenicFilter({ ...scenicFilter, subType: tag })
                    else if (category === 'food') setFoodFilter({ ...foodFilter, subType: tag })
                    else if (category === 'shopping') setShoppingFilter({ ...shoppingFilter, subType: tag })
                    else setActivityFilter({ ...activityFilter, subType: tag })
                  }}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-smooth ${
                    cur === tag ? 'gradient-hero text-white shadow-sm' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
                  }`}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Scenic-specific filters */}
      {category === 'scenic' && (
        <>
          <FilterChips
            label="游玩时长"
            options={DURATION_OPTIONS}
            value={scenicFilter.minDuration}
            onChange={(v) => setScenicFilter({ ...scenicFilter, minDuration: v as number })}
          />
          <FilterChips
            label="门票价格"
            options={COST_OPTIONS}
            value={scenicFilter.maxCost}
            onChange={(v) => {
              const val = v as number
              setScenicFilter({ ...scenicFilter, maxCost: val === 0 ? 0 : val })
            }}
          />
          <FilterChips
            label="综合评分"
            options={RATING_OPTIONS}
            value={scenicFilter.minRating}
            onChange={(v) => setScenicFilter({ ...scenicFilter, minRating: v as number })}
          />
          <FilterChips
            label="当季游玩指数"
            options={SEASONAL_OPTIONS}
            value={scenicFilter.minSeasonal}
            onChange={(v) => setScenicFilter({ ...scenicFilter, minSeasonal: v as number })}
          />
          <div className="mb-2 flex items-center gap-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">开放时间</p>
            <button
              onClick={() => setScenicFilter({ ...scenicFilter, openNow: !scenicFilter.openNow })}
              className={`ml-2 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-smooth ${
                scenicFilter.openNow ? 'gradient-hero text-white shadow-sm' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
              }`}
            >
              {scenicFilter.openNow ? '✓ 现在开放' : '现在开放'}
            </button>
          </div>
        </>
      )}

      {/* Food-specific filters */}
      {category === 'food' && (
        <>
          <FilterChips
            label="人均消费"
            options={COST_OPTIONS}
            value={foodFilter.maxCost}
            onChange={(v) => setFoodFilter({ ...foodFilter, maxCost: v as number })}
          />
          <FilterChips
            label="综合评分"
            options={RATING_OPTIONS}
            value={foodFilter.minRating}
            onChange={(v) => setFoodFilter({ ...foodFilter, minRating: v as number })}
          />
          <div className="mb-2 flex items-center gap-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">营业时间</p>
            <button
              onClick={() => setFoodFilter({ ...foodFilter, openNow: !foodFilter.openNow })}
              className={`ml-2 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-smooth ${
                foodFilter.openNow ? 'gradient-hero text-white shadow-sm' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
              }`}
            >
              {foodFilter.openNow ? '✓ 现在营业' : '现在营业'}
            </button>
          </div>
        </>
      )}

      {/* Shopping-specific filters */}
      {category === 'shopping' && (
        <>
          <FilterChips
            label="人均消费"
            options={COST_OPTIONS}
            value={shoppingFilter.maxCost}
            onChange={(v) => setShoppingFilter({ ...shoppingFilter, maxCost: v as number })}
          />
          <FilterChips
            label="综合评分"
            options={RATING_OPTIONS}
            value={shoppingFilter.minRating}
            onChange={(v) => setShoppingFilter({ ...shoppingFilter, minRating: v as number })}
          />
          <div className="mb-2 flex items-center gap-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">营业时间</p>
            <button
              onClick={() => setShoppingFilter({ ...shoppingFilter, openNow: !shoppingFilter.openNow })}
              className={`ml-2 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-smooth ${
                shoppingFilter.openNow ? 'gradient-hero text-white shadow-sm' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
              }`}
            >
              {shoppingFilter.openNow ? '✓ 现在营业' : '现在营业'}
            </button>
          </div>
        </>
      )}

      {/* Activity-specific filters */}
      {category === 'activity' && (
        <>
          <FilterChips
            label="人均消费"
            options={COST_OPTIONS}
            value={activityFilter.maxCost}
            onChange={(v) => setActivityFilter({ ...activityFilter, maxCost: v as number })}
          />
          <FilterChips
            label="游玩时长"
            options={DURATION_OPTIONS}
            value={activityFilter.minDuration}
            onChange={(v) => setActivityFilter({ ...activityFilter, minDuration: v as number })}
          />
          <FilterChips
            label="综合评分"
            options={RATING_OPTIONS}
            value={activityFilter.minRating}
            onChange={(v) => setActivityFilter({ ...activityFilter, minRating: v as number })}
          />
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════ */
/* ── POI Detail Drawer Component              ── */
/* ═══════════════════════════════════════════════ */

function POIDetailDrawer({
  poi: a, isSelected, onClose, onToggle,
}: {
  poi: Attraction; isSelected: boolean; onClose: () => void; onToggle: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[800] flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-hidden bg-background shadow-float"
        style={{ animation: 'slideInRight 0.25s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image header */}
        <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-muted">
          <img
            src={a.image}
            alt={displayName(a)}
            className="h-full w-full object-cover"
            onError={handleImgError}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

          <button
            onClick={onClose}
            className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-1.5 text-white backdrop-blur-sm hover:bg-black/60"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Type badge */}
          <span className="absolute left-3 bottom-3 z-10 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
            {getAttractionTypeIcon(a.type)} {getAttractionTypeLabel(a.type)}
          </span>

          {/* Seasonal badge */}
          {a.seasonalIndex && (
            <span className="absolute right-3 bottom-3 z-10 flex items-center gap-1 rounded-full bg-amber-500/90 px-2.5 py-1 text-[10px] font-bold text-white">
              <Sparkles className="h-3 w-3" /> 当季 {a.seasonalIndex.toFixed(1)}
            </span>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="border-b border-border p-4">
            <h2 className="text-lg font-bold text-foreground">{displayName(a)}</h2>
            {a.nameZh && a.nameZh !== a.name && (
              <p className="text-sm text-muted-foreground">{a.nameZh}</p>
            )}

            {/* Rating row */}
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className={`h-3.5 w-3.5 ${i <= Math.round(a.rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
                ))}
                <span className="ml-1 text-sm font-semibold">{a.rating.toFixed(1)}</span>
              </div>
            </div>

            {/* Key metrics */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-secondary/60 p-2.5 text-center">
                <Clock className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">游玩时长</p>
                <p className="text-xs font-semibold text-foreground">{formatDuration(a.duration)}</p>
              </div>
              <div className="rounded-xl bg-secondary/60 p-2.5 text-center">
                <Coins className={`mx-auto mb-1 h-4 w-4 ${a.cost === 0 ? 'text-green-500' : 'text-muted-foreground'}`} />
                <p className="text-[10px] text-muted-foreground">{a.type === 'food' || a.type === 'shopping' || a.type === 'activity' ? '人均消费' : '门票'}</p>
                <p className={`text-xs font-semibold ${a.cost === 0 ? 'text-green-600' : 'text-foreground'}`}>{formatCost(a.cost)}</p>
              </div>
              <div className="rounded-xl bg-secondary/60 p-2.5 text-center">
                <Info className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">开放时间</p>
                <p className="text-xs font-semibold text-foreground">
                  {a.openTime && a.closeTime ? `${a.openTime}~${a.closeTime}` : '全天'}
                </p>
              </div>
            </div>

            {/* Address */}
            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {a.address}
            </p>
          </div>

          {/* Recommend reason */}
          {a.recommendReason && (
            <div className="border-b border-border p-4">
              <div className="flex items-start gap-2 rounded-xl bg-primary/5 p-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed text-primary/90">{a.recommendReason}</p>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="border-b border-border p-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground">简介</h3>
            <p className="text-sm leading-relaxed text-foreground/80">{a.description}</p>
          </div>

          {/* Tags */}
          {a.tags.length > 0 && (
            <div className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">标签</h3>
              <div className="flex flex-wrap gap-1.5">
                {a.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom action */}
        <div className="shrink-0 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-sm">
          <button
            onClick={() => { onToggle(); if (!isSelected) onClose() }}
            className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-all ${
              isSelected
                ? 'bg-secondary text-foreground hover:bg-destructive/10 hover:text-destructive border border-border'
                : 'gradient-hero text-primary-foreground shadow-elegant hover:shadow-float'
            }`}
          >
            {isSelected ? '✓ 已加入行程 · 点击移除' : '+ 加入行程'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════ */
/* ── POI Cart Component                       ── */
/* ═══════════════════════════════════════════════ */

function POICart({
  selectedAttractions, cartOpen, setCartOpen, onRemove, onViewDetail,
}: {
  selectedAttractions: Attraction[]
  cartOpen: boolean
  setCartOpen: (v: boolean) => void
  onRemove: (id: string) => void
  onViewDetail: (a: Attraction) => void
}) {
  const totalCost = selectedAttractions.reduce((s, a) => s + a.cost, 0)
  const totalDuration = selectedAttractions.reduce((s, a) => s + a.duration, 0)
  const byCat: Record<string, Attraction[]> = {}
  selectedAttractions.forEach((a) => {
    if (!byCat[a.type]) byCat[a.type] = []
    byCat[a.type].push(a)
  })

  if (!cartOpen) return null

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setCartOpen(false)} />
      <div
        className="relative w-full max-h-[75vh] flex flex-col rounded-t-2xl bg-background shadow-float border-t border-border"
        style={{ animation: 'slideUpCart 0.25s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle & header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="text-base font-bold text-foreground">
              已选地点
              <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full gradient-hero px-1.5 text-[10px] font-bold text-white">
                {selectedAttractions.length}
              </span>
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              合计预估费用 ¥{totalCost} · 总游玩时长 {formatDuration(totalDuration)}
            </p>
          </div>
          <button
            onClick={() => setCartOpen(false)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary transition-smooth"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {selectedAttractions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ShoppingCart className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">还没有选择任何地点</p>
              <p className="mt-1 text-[11px] text-muted-foreground/60">在列表中点击地点将其加入行程</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(['scenic', 'food', 'shopping', 'activity'] as PlaceCategory[]).map((type) => {
                const items = byCat[type]
                if (!items || items.length === 0) return null
                return (
                  <div key={type}>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {getAttractionTypeIcon(type)} {getAttractionTypeLabel(type as Attraction['type'])} · {items.length}个
                    </p>
                    <div className="space-y-2">
                      {items.map((a) => (
                        <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
                          <img
                            src={a.image}
                            alt={displayName(a)}
                            className="h-10 w-10 shrink-0 rounded-lg object-cover cursor-pointer"
                            onError={handleImgError}
                            onClick={() => onViewDetail(a)}
                          />
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onViewDetail(a)}>
                            <p className="text-sm font-semibold text-foreground line-clamp-1">{displayName(a)}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-0.5">
                                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                                {a.rating}
                              </span>
                              <span className="flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {formatDuration(a.duration)}
                              </span>
                              <span className={a.cost === 0 ? 'text-green-600' : ''}>
                                {formatCost(a.cost)}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => onRemove(a.id)}
                            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-smooth"
                            title="移除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUpCart {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

/* ── Step indicator components ── */
function StepDot({ step, done, active, label }: { step: number; done?: boolean; active?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
        done ? 'gradient-hero text-primary-foreground'
        : active ? 'gradient-hero text-primary-foreground shadow-elegant'
        : 'bg-secondary text-muted-foreground'
      }`}>
        {done ? <Check className="h-3.5 w-3.5" /> : step}
      </div>
      <span className={`hidden text-xs font-medium sm:block ${done || active ? 'text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </div>
  )
}

function ProgressLine({ filled }: { filled: boolean }) {
  return (
    <div className="relative h-0.5 w-6 sm:w-10 overflow-hidden rounded-full bg-border">
      <div className={`absolute inset-y-0 left-0 gradient-hero rounded-full transition-all duration-700 ${filled ? 'w-full' : 'w-0'}`} />
    </div>
  )
}
