import { useState, useMemo, useEffect, useCallback } from 'react'
import { useApp } from '@/context/AppContext'
import { displayName, displayNameShort } from '@/utils/poiName'
import {
  popularCities, getAttractions, setAIAttractions, hasAIAttractions,
  getAttractionTypeLabel, getAttractionTypeIcon
} from '@/data/mock-data'
import { Attraction } from '@/types'
import { generateItinerary } from '@/utils/routePlanner'
import {
  loadPOIRecommendations, forceRefreshPOIs
} from '@/utils/aiRecommend'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, ArrowRight, Check, MapPin, Star, Clock, Coins,
  Search, X, Map as MapIcon, List, ChevronDown, Loader2,
  Sparkles, RefreshCw, AlertTriangle
} from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/* ── Category definitions ── */
type PlaceCategory = 'all' | 'scenic' | 'food' | 'shopping' | 'activity'

const categories: { key: PlaceCategory; label: string; icon: string; desc: string }[] = [
  { key: 'all', label: '全部', icon: '🌟', desc: '所有推荐' },
  { key: 'scenic', label: '景点', icon: '🏛️', desc: '名胜古迹·自然风光' },
  { key: 'food', label: '餐饮', icon: '🍜', desc: '美食·小吃·咖啡' },
  { key: 'shopping', label: '购物', icon: '🛍️', desc: '商圈·市场·特产' },
  { key: 'activity', label: '娱乐', icon: '🎯', desc: '体验·表演·户外' },
]

/* ── Map marker icons ── */
function createPlaceIcon(type: Attraction['type'], isSelected: boolean) {
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
  const size = isSelected ? 36 : 28
  const opacity = isSelected ? 1 : 0.7
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:${isSelected ? 16 : 12}px;opacity:${opacity};transition:all 0.2s;">${emoji}</div>`,
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

/* ── Format helpers ── */
function formatDuration(min: number) {
  if (min < 60) return `${min}分钟`
  const h = Math.floor(min / 60); const m = min % 60
  return m > 0 ? `${h}小时${m}分` : `${h}小时`
}
function formatCost(cost: number) { return cost === 0 ? '免费' : `¥${cost}` }

function getCurrentSeasonLabel(): string {
  const month = new Date().getMonth() + 1
  if (month >= 3 && month <= 5) return '春季'
  if (month >= 6 && month <= 8) return '夏季'
  if (month >= 9 && month <= 11) return '秋季'
  return '冬季'
}

/* ═══════════════════════════════════════════════ */
/* ══ Main Component                           ══ */
/* ═══════════════════════════════════════════════ */

export default function PlaceSelectionPage() {
  const { state, dispatch } = useApp()
  const trip = state.currentTrip
  const city = popularCities.find((c) => c.id === trip?.cityId)

  /* ── State ── */
  const [activeCategory, setActiveCategory] = useState<PlaceCategory>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [isPlanning, setIsPlanning] = useState(false)

  // AI recommendation state
  const [aiLoading, setAiLoading] = useState(false)
  const [aiRefreshing, setAiRefreshing] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false) // 首次无缓存生成中
  const [aiError, setAiError] = useState<string | null>(null)
  const [isAIPowered, setIsAIPowered] = useState(false)

  const selectedIds = state.selectedPlaceIds
  const seasonLabel = getCurrentSeasonLabel()

  /* ── Load AI recommendations on mount ── */
  useEffect(() => {
    if (!city) return
    // Already have AI data in memory for this city
    if (hasAIAttractions(city.id)) {
      setIsAIPowered(true)
      return
    }
    // Auto-fetch from server (server manages API key)
    fetchAIRecommendations()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city?.id])

  const fetchAIRecommendations = useCallback(async () => {
    if (!city) return
    setAiLoading(true)
    setAiError(null)
    setAiGenerating(false)

    try {
      const result = await loadPOIRecommendations(
        city.name, city.nameEn, city.id,
        // Background refresh callback (stale-while-revalidate 或首次生成完成)
        (freshAttractions) => {
          setAIAttractions(city.id, freshAttractions)
          setAiRefreshing(false)
          setAiGenerating(false)
          setIsAIPowered(true)
          // Force re-render by toggling state
          setIsAIPowered(false)
          setTimeout(() => setIsAIPowered(true), 0)
        },
      )

      if (result.error) {
        setAiError(`AI 推荐加载失败：${result.error}`)
      } else if (result.generating) {
        // 首次无缓存：服务端正在后台生成，前端显示等待状态
        setAiGenerating(true)
        setIsAIPowered(false)
      } else if (result.attractions.length > 0) {
        setAIAttractions(city.id, result.attractions)
        setIsAIPowered(true)
        if (result.refreshing) {
          setAiRefreshing(true)
        }
      }
    } catch (err) {
      setAiError('网络错误，请检查网络连接后重试')
      console.error(err)
    } finally {
      setAiLoading(false)
    }
  }, [city])

  const handleRefreshAI = useCallback(async () => {
    if (!city) return
    setAiRefreshing(true)
    setAiError(null)
    try {
      const result = await forceRefreshPOIs(city.name, city.nameEn, city.id)
      if (result.error) {
        setAiError(`刷新失败：${result.error}`)
      } else if (result.attractions.length > 0) {
        setAIAttractions(city.id, result.attractions)
        setIsAIPowered(false)
        setTimeout(() => setIsAIPowered(true), 0)
      }
    } catch (err) {
      setAiError('刷新失败，请稍后再试')
      console.error(err)
    } finally {
      setAiRefreshing(false)
    }
  }, [city])

  /* ── Attractions data ── */
  const allAttractions = useMemo(() => {
    if (!city) return []
    const attractions = getAttractions(city.id)
    return attractions.filter((a) => a.type !== 'hotel' && a.type !== 'transport')
  }, [city, isAIPowered]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredAttractions = useMemo(() => {
    let list = allAttractions
    if (activeCategory !== 'all') list = list.filter((a) => a.type === activeCategory)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((a) =>
        a.name.toLowerCase().includes(q) ||
        (a.nameZh && a.nameZh.toLowerCase().includes(q)) ||
        a.description.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    return list
  }, [allAttractions, activeCategory, searchQuery])

  const selectedAttractions = useMemo(
    () => allAttractions.filter((a) => selectedIds.includes(a.id)),
    [allAttractions, selectedIds]
  )

  const groupedAttractions = useMemo(() => {
    if (activeCategory !== 'all' || searchQuery.trim()) return null
    const groups: Record<string, Attraction[]> = {}
    for (const a of allAttractions) {
      if (!groups[a.type]) groups[a.type] = []
      groups[a.type].push(a)
    }
    return groups
  }, [allAttractions, activeCategory, searchQuery])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allAttractions.length }
    for (const a of allAttractions) counts[a.type] = (counts[a.type] || 0) + 1
    return counts
  }, [allAttractions])

  const selectedCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of selectedAttractions) counts[a.type] = (counts[a.type] || 0) + 1
    return counts
  }, [selectedAttractions])

  if (!trip || !city) return null

  /* ── Handlers ── */
  const handleToggle = (id: string) => dispatch({ type: 'TOGGLE_PLACE', payload: id })

  const handleNext = useCallback(() => {
    if (!trip || !city) return
    if (selectedAttractions.length > 0) {
      setIsPlanning(true)
      setTimeout(() => {
        try {
          const result = generateItinerary(selectedAttractions, trip.days, city.id)
          dispatch({ type: 'SET_ALL_DAYS_ITEMS', payload: { dayItems: result.dayItems, skippedPOIs: result.skippedPOIs } })
          setIsPlanning(false)
          // If POIs were skipped, go to overflow page for guided adjustment
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

  const handleLocate = (a: Attraction) => {
    setFlyTarget({ lat: a.lat, lng: a.lng })
    if (viewMode === 'list') setViewMode('map')
  }

  /* ═════════════════════════ Render helpers ═════════════════════════ */

  function renderAttractionCard(a: Attraction, compact = false) {
    const isSelected = selectedIds.includes(a.id)
    return (
      <div
        key={a.id}
        onClick={() => handleToggle(a.id)}
        className={`group relative cursor-pointer rounded-2xl border-2 transition-all duration-300 ${
          isSelected
            ? 'border-primary bg-coral-light shadow-elegant'
            : 'border-transparent bg-card shadow-card hover:shadow-card-hover hover:-translate-y-0.5'
        } ${compact ? 'p-2.5' : 'p-3'}`}
      >
        <div className="flex gap-3">
          {/* Image */}
          <div className={`relative shrink-0 overflow-hidden rounded-xl ${compact ? 'h-16 w-16' : 'h-20 w-20'}`}>
            <img
              src={a.image}
              alt={displayName(a)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${encodeURIComponent(a.id)}/400/300` }}
            />
            <div className="absolute left-1 top-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
              {getAttractionTypeIcon(a.type)} {getAttractionTypeLabel(a.type)}
            </div>
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-start justify-between gap-2">
              <h3 className={`font-semibold text-foreground leading-tight line-clamp-1 ${compact ? 'text-sm' : 'text-[15px]'}`}>
                {displayName(a)}
              </h3>
              <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                isSelected ? 'border-primary gradient-hero' : 'border-border bg-card group-hover:border-primary/40'
              }`}>
                {isSelected && <Check className="h-3 w-3 text-white" />}
              </div>
            </div>

            {/* Recommend reason (AI-powered) */}
            {!compact && a.recommendReason && (
              <div className="mb-1.5 flex items-start gap-1">
                <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed text-primary/80 line-clamp-1">
                  {a.recommendReason}
                </p>
              </div>
            )}

            {!compact && !a.recommendReason && (
              <p className="mb-1.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                {a.description}
              </p>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Star className="h-3 w-3 text-sunset" fill="currentColor" />
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
              {!compact && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleLocate(a) }}
                  className="ml-auto flex items-center gap-0.5 text-primary hover:underline"
                >
                  <MapPin className="h-3 w-3" />
                  地图
                </button>
              )}
            </div>

            {!compact && a.tags.length > 0 && (
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

  function renderCategoryGroup(type: string, attractions: Attraction[]) {
    const label = getAttractionTypeLabel(type as Attraction['type'])
    const icon = getAttractionTypeIcon(type as Attraction['type'])
    const selCount = selectedCategoryCounts[type] || 0
    const isExpanded = expandedCategory === null || expandedCategory === type

    return (
      <div key={type} className="mb-4">
        <button
          onClick={() => setExpandedCategory(expandedCategory === type ? null : type)}
          className="mb-2 flex w-full items-center justify-between rounded-xl bg-secondary/60 px-3 py-2 transition-colors hover:bg-secondary"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">{icon}</span>
            <span className="text-sm font-semibold text-foreground">{label}</span>
            <span className="text-[10px] text-muted-foreground">
              {isAIPowered ? `TOP ${attractions.length}` : `${attractions.length}个推荐`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full gradient-hero px-1.5 text-[10px] font-bold text-white">
                {selCount}
              </span>
            )}
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {isExpanded && (
          <div className="space-y-2 animate-fade-in">
            {attractions.map((a) => renderAttractionCard(a))}
          </div>
        )}
      </div>
    )
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
        {/* ── Left panel: category + list ── */}
        <div className={`flex flex-col ${viewMode === 'map' ? 'max-lg:hidden' : ''} lg:w-[440px] lg:shrink-0 lg:border-r lg:border-border`}>
          {/* Title bar */}
          <div className="shrink-0 border-b border-border px-4 pb-3 pt-4 sm:px-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-coral-light px-3 py-1 text-[10px] font-semibold text-coral-dark">
                    <MapPin className="h-3 w-3" />
                    第三步 · 选择想去的地点
                  </span>
                  {isAIPowered && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500/10 to-blue-500/10 border border-violet-500/20 px-2 py-0.5 text-[9px] font-semibold text-violet-600">
                      <Sparkles className="h-2.5 w-2.5" />
                      AI 推荐
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-foreground">
                  {city.name} · {isAIPowered ? `${seasonLabel}精选` : '热门推荐'}
                </h2>
                {isAIPowered && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    AI 为您精选了 {allAttractions.length} 个{seasonLabel}最值得去的地点
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {/* AI refresh button */}
                {isAIPowered && (
                  <button
                    onClick={handleRefreshAI}
                    disabled={aiLoading || aiRefreshing}
                    className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-[10px] font-medium text-muted-foreground shadow-card transition-smooth hover:bg-secondary disabled:opacity-50"
                    title="重新生成AI推荐"
                  >
                    <RefreshCw className={`h-3 w-3 ${aiLoading || aiRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                )}
                {/* API key button (if no AI data yet) */}
                {!isAIPowered && !aiLoading && (
                  <button
                    onClick={() => fetchAIRecommendations()}
                    className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-2.5 py-1.5 text-[10px] font-medium text-white shadow-elegant transition-smooth hover:opacity-90"
                  >
                    <Sparkles className="h-3 w-3" />
                    AI 推荐
                  </button>
                )}
                {/* View mode toggle - mobile */}
                <button
                  onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
                  className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-card transition-smooth hover:bg-secondary lg:hidden"
                >
                  {viewMode === 'list' ? <MapIcon className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
                  {viewMode === 'list' ? '地图' : '列表'}
                </button>
              </div>
            </div>

            {/* AI error banner */}
            {aiError && (
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">{aiError}</span>
                <button onClick={() => setAiError(null)} className="shrink-0 text-amber-500 hover:text-amber-700">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

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
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {categories.map((cat) => {
                const count = categoryCounts[cat.key] || 0
                const isActive = activeCategory === cat.key
                const selCount = cat.key === 'all'
                  ? selectedAttractions.length
                  : (selectedCategoryCounts[cat.key] || 0)
                return (
                  <button
                    key={cat.key}
                    onClick={() => { setActiveCategory(cat.key); setExpandedCategory(null) }}
                    className={`relative flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                      isActive
                        ? 'gradient-hero text-white shadow-elegant'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                    {cat.key !== 'all' && (
                      <span className={`text-[9px] ${isActive ? 'text-white/80' : 'text-muted-foreground/60'}`}>
                        {count}
                      </span>
                    )}
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
          </div>

          {/* List area */}
          <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4">
            {/* AI Loading state */}
            {aiLoading && (
              <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                <div className="relative mb-4">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-r from-violet-500/10 to-blue-500/10 flex items-center justify-center">
                    <Sparkles className="h-7 w-7 text-violet-500 animate-pulse" />
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1">AI 正在生成推荐</h3>
                <p className="text-[11px] text-muted-foreground text-center max-w-[240px]">
                  正在分析 {city.name} {seasonLabel}的热门旅游资源，为您精选每个类别 TOP 20...
                </p>
              </div>
            )}

            {/* No data, show loading/retry prompt */}
            {!aiLoading && allAttractions.length === 0 && !isAIPowered && (
              <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
                <div className="h-14 w-14 rounded-full bg-gradient-to-r from-violet-500/10 to-blue-500/10 flex items-center justify-center mb-4 relative">
                  {aiGenerating ? (
                    <>
                      <div className="absolute inset-0 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
                      <Sparkles className="h-6 w-6 text-violet-500" />
                    </>
                  ) : (
                    <Sparkles className="h-6 w-6 text-violet-500" />
                  )}
                </div>
                <h3 className="text-base font-bold text-foreground mb-1">
                  {aiGenerating ? 'AI 首次生成数据' : 'AI 智能推荐'}
                </h3>
                <p className="text-[11px] text-muted-foreground text-center max-w-[260px] mb-4">
                  {aiGenerating
                    ? `AI 正在为 ${city.name} 首次生成推荐数据，通常需要 1-3 分钟，请稍候...`
                    : aiError
                      ? '加载失败，请点击重试'
                      : `正在从服务器加载 ${city.name} ${seasonLabel}推荐数据...`}
                </p>
                {aiError && !aiGenerating && (
                  <Button
                    variant="coral"
                    size="sm"
                    onClick={() => fetchAIRecommendations()}
                    className="gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    重新加载
                  </Button>
                )}
              </div>
            )}

            {/* Attractions list */}
            {!aiLoading && allAttractions.length > 0 && (
              <>
                {searchQuery.trim() && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    找到 <span className="font-semibold text-foreground">{filteredAttractions.length}</span> 个相关地点
                  </p>
                )}

                {groupedAttractions ? (
                  <div>
                    {['scenic', 'food', 'shopping', 'activity'].map((type) => {
                      const items = groupedAttractions[type]
                      if (!items || items.length === 0) return null
                      return renderCategoryGroup(type, items)
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredAttractions.map((a) => renderAttractionCard(a))}
                    {filteredAttractions.length === 0 && (
                      <div className="py-12 text-center">
                        <p className="text-sm text-muted-foreground">
                          {searchQuery ? '没有找到相关地点' : '暂无推荐地点'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="h-24 lg:h-20" />
          </div>
        </div>

        {/* ── Right panel: Map ── */}
        <div className={`relative flex-1 ${viewMode === 'list' ? 'max-lg:hidden' : ''}`}>
          <MapContainer
            center={[city.lat, city.lng]}
            zoom={12}
            className="h-full w-full"
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={20}
            />
            <MapResizeFix />
            {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} zoom={15} />}

            {filteredAttractions.map((a) => {
              const isSelected = selectedIds.includes(a.id)
              return (
                <Marker
                  key={a.id}
                  position={[a.lat, a.lng]}
                  icon={createPlaceIcon(a.type, isSelected)}
                  eventHandlers={{ click: () => handleToggle(a.id) }}
                >
                  <Popup>
                    <div className="min-w-[200px] max-w-[260px]">
                      <div className="flex gap-2 mb-1.5">
                        <img src={a.image} alt={displayName(a)} className="h-12 w-12 rounded-lg object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${encodeURIComponent(a.id)}/100/100` }} />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm leading-tight">{displayName(a)}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mt-0.5">
                            <span>{getAttractionTypeIcon(a.type)} {getAttractionTypeLabel(a.type)}</span>
                            <span>⭐ {a.rating}</span>
                          </div>
                        </div>
                      </div>
                      {a.recommendReason && (
                        <p className="text-[11px] text-violet-600 mb-1.5">✨ {a.recommendReason}</p>
                      )}
                      <p className="text-[11px] text-gray-600 line-clamp-2 mb-2">{a.description}</p>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-2">
                        <span>🕐 {formatDuration(a.duration)}</span>
                        <span>💰 {formatCost(a.cost)}</span>
                      </div>
                      <button
                        onClick={() => handleToggle(a.id)}
                        className={`w-full rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
                          isSelected ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-orange-500 text-white hover:bg-orange-600'
                        }`}
                      >
                        {isSelected ? '✓ 已添加 · 点击移除' : '+ 添加到行程'}
                      </button>
                    </div>
                  </Popup>
                </Marker>
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

          {/* Selected count badge */}
          {selectedAttractions.length > 0 && (
            <div className="absolute right-3 top-3 z-[500] rounded-xl glass border border-border px-3 py-2 shadow-card">
              <p className="text-[10px] text-muted-foreground">已选择地点</p>
              <p className="text-lg font-bold gradient-text">{selectedAttractions.length}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {Object.entries(selectedCategoryCounts).map(([type, count]) => (
                  <span key={type} className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                    {getAttractionTypeIcon(type as Attraction['type'])} {count}
                  </span>
                ))}
              </div>
            </div>
          )}

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

      {/* ── Bottom action bar ── */}
      <div className="fixed bottom-0 inset-x-0 z-[1000] glass border-t border-border safe-bottom">
        {/* Planning overlay */}
        {isPlanning && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 rounded-2xl bg-card p-8 shadow-float animate-fade-in">
              <div className="relative">
                <div className="h-16 w-16 rounded-full gradient-hero flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-foreground mb-1">智能规划中</h3>
                <p className="text-sm text-muted-foreground">正在为您优化路线，安排餐饮与景点...</p>
              </div>
            </div>
          </div>
        )}
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-1.5">
              {selectedAttractions.slice(0, 4).map((a) => (
                <img
                  key={a.id} src={a.image} alt={displayName(a)}
                  className="h-8 w-8 rounded-full border-2 border-white object-cover shadow-sm"
                  onError={(e) => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${encodeURIComponent(a.id)}/100/100` }}
                />
              ))}
              {selectedAttractions.length > 4 && (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-secondary text-[10px] font-bold text-muted-foreground shadow-sm">
                  +{selectedAttractions.length - 4}
                </div>
              )}
            </div>
            <div className="text-sm">
              <span className="font-semibold text-foreground">已选 {selectedAttractions.length} 个地点</span>
              {selectedAttractions.length > 0 && (
                <span className="ml-2 text-muted-foreground">
                  预估费用 ¥{selectedAttractions.reduce((sum, a) => sum + a.cost, 0)}
                </span>
              )}
            </div>
          </div>
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
