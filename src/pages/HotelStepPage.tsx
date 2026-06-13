import { useState, useCallback, useEffect, useRef, useMemo, type ElementType } from 'react'
import { useApp } from '@/context/AppContext'
import { popularCities, recommendedHotels } from '@/data/mock-data'
import { HotelPOI } from '@/types'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, ArrowRight, Check, Hotel, SkipForward,
  Search, X, MapPin, Navigation, Copy, Star, SlidersHorizontal,
  Loader2, Wifi, Car, Waves, Dumbbell, ChevronDown, Eye,
} from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { handleImgError } from '@/utils/imageProxy'

/* ── Custom map marker icons ── */
function createIcon(color: string, isSelected = false) {
  const size = isSelected ? 36 : 28
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      border-radius:50%;
      background:${color};
      border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      font-size:${isSelected ? 16 : 13}px;
      transition:all 0.2s;
    ">🏨</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}
const defaultIcon = createIcon('hsl(12 76% 61%)')
const selectedIcon = createIcon('hsl(12 76% 61%)', true)
const assignedIcon = createIcon('hsl(199 89% 48%)')
const searchIcon = createIcon('hsl(28 87% 62%)')

/* ── Map click handler ── */
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onMapClick(e.latlng.lat, e.latlng.lng) } })
  return null
}

/* ── Fly to location ── */
function FlyTo({ lat, lng, zoom }: { lat: number; lng: number; zoom?: number }) {
  const map = useMap()
  useEffect(() => { map.flyTo([lat, lng], zoom ?? map.getZoom(), { duration: 0.8 }) }, [lat, lng, zoom, map])
  return null
}

/* ── Map resize fix: ensure tiles load when container becomes visible ── */
function MapResizeFix() {
  const map = useMap()
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(timer)
  }, [map])
  return null
}

/* ── Nominatim search hook ── */
function useHotelSearch(cityLat: number, cityLng: number) {
  const [results, setResults] = useState<HotelPOI[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const search = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!query.trim()) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const bbox = `${cityLng - 0.15},${cityLat - 0.15},${cityLng + 0.15},${cityLat + 0.15}`
        const url = `https://nominatim.openstreetmap.org/search?` +
          `q=${encodeURIComponent(query)}&format=json&limit=6&` +
          `viewbox=${bbox}&bounded=1&accept-language=zh-CN`
        const res = await fetch(url, { headers: { 'User-Agent': 'TripPlannerDemo/1.0' } })
        const data = await res.json()
        setResults(data.map((d: { place_id: number; display_name: string; lat: string; lon: string }) => ({
          id: `search-${d.place_id}`,
          name: d.display_name.split(',')[0],
          address: d.display_name.split(',').slice(0, 3).join(','),
          lat: parseFloat(d.lat),
          lng: parseFloat(d.lon),
        })))
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 600)
  }, [cityLat, cityLng])

  return { results, loading, search, clearResults: () => setResults([]) }
}

/* ── Hook to fetch hotels from server database ── */
function useServerHotels(cityId: string, _cityName: string, _cityNameEn: string) {
  const [hotels, setHotels] = useState<HotelPOI[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fetchedRef = useRef(false)

  const fetchHotels = useCallback(() => {
    setLoading(true)
    fetch(`/api/hotels/${cityId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.data)) {
          setHotels(data.data as HotelPOI[])
          setError('')
        } else if (!data.success) {
          setError(data.message || '加载失败')
        }
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') setError('网络错误')
      })
      .finally(() => setLoading(false))
  }, [cityId])

  useEffect(() => {
    if (!cityId || fetchedRef.current) return
    fetchedRef.current = true
    fetchHotels()
  }, [cityId, fetchHotels])

  return { hotels, loading, generating: false, error }
}

/* ── Reverse geocode ── */
async function reverseGeocode(lat: number, lng: number): Promise<{ name: string; address: string }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=zh-CN`,
      { headers: { 'User-Agent': 'TripPlannerDemo/1.0' } }
    )
    const data = await res.json()
    return {
      name: data.name || data.display_name?.split(',')[0] || '自定义位置',
      address: data.display_name?.split(',').slice(0, 3).join(',') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    }
  } catch {
    return { name: '自定义位置', address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }
  }
}

/* ── Sort + Filter types ── */
type SortKey = 'recommend' | 'price-asc' | 'price-desc' | 'rating' | 'distance'
type StarFilter = 0 | 2 | 3 | 4 | 5  // 0 means all

const SORT_LABELS: Record<SortKey, string> = {
  recommend: '推荐排序',
  'price-asc': '价格低到高',
  'price-desc': '价格高到低',
  rating: '评分最高',
  distance: '距离最近',
}

/* ── Amenity quick icons ── */
const AMENITY_ICONS: Record<string, ElementType> = {
  'Wi-Fi': Wifi, '停车场': Car, '泳池': Waves, '健身房': Dumbbell,
}

export default function HotelStepPage() {
  const { state, dispatch } = useApp()
  const trip = state.currentTrip
  const city = popularCities.find((c) => c.id === trip?.cityId)

  const [mode, setMode] = useState<'choice' | 'selection'>('choice')
  const [activeDayIdx, setActiveDayIdx] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [mapClickHotel, setMapClickHotel] = useState<{ lat: number; lng: number; name: string; address: string } | null>(null)
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null)

  // Filters & sort
  const [sortKey, setSortKey] = useState<SortKey>('recommend')
  const [starFilter, setStarFilter] = useState<StarFilter>(0)
  const [showFilters, setShowFilters] = useState(false)

  // Server hotel data
  const { hotels: serverHotels, loading: serverLoading, error: serverError } = useServerHotels(
    city?.id || '', city?.name || '', city?.nameEn || ''
  )

  // Fall back to mock data if server has no hotels
  const fallbackHotels = city ? (recommendedHotels[city.id] || []) : []
  const allCityHotels = serverHotels.length > 0 ? serverHotels : fallbackHotels

  // Apply filters & sort
  const filteredHotels = useMemo(() => {
    let list = [...allCityHotels]
    // 关键词搜索：匹配名称、地址、描述、标签
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(h =>
        h.name.toLowerCase().includes(q) ||
        (h.address || '').toLowerCase().includes(q) ||
        (h.description || '').toLowerCase().includes(q) ||
        (h.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (h.amenities || []).some(a => a.toLowerCase().includes(q)) ||
        (q.includes('星') && h.stars && `${h.stars}星`.includes(q))
      )
    }
    if (starFilter > 0) {
      list = list.filter(h => (h.stars || 0) >= starFilter)
    }
    switch (sortKey) {
      case 'price-asc':
        list.sort((a, b) => (a.priceRange?.[0] || 9999) - (b.priceRange?.[0] || 9999))
        break
      case 'price-desc':
        list.sort((a, b) => (b.priceRange?.[0] || 0) - (a.priceRange?.[0] || 0))
        break
      case 'rating':
        list.sort((a, b) => (b.rating || 0) - (a.rating || 0))
        break
      case 'distance':
        list.sort((a, b) => (a.distance || 99) - (b.distance || 99))
        break
    }
    return list
  }, [allCityHotels, starFilter, sortKey, searchQuery])

  const { results: searchResults, loading: searchLoading, search: nominatimSearch, clearResults } = useHotelSearch(city?.lat ?? 0, city?.lng ?? 0)

  // 仅当本地过滤无匹配结果时，才触发 Nominatim 地图搜索作为兜底
  useEffect(() => {
    if (searchQuery.trim() && filteredHotels.length === 0) {
      nominatimSearch(searchQuery)
    }
  }, [searchQuery, filteredHotels.length, nominatimSearch])

  if (!trip || !city) return null

  const days = trip.days
  const currentDayHotel = days[activeDayIdx]?.hotel
  const assignedCount = days.filter((d) => d.hotel).length

  const handleSelectHotel = (hotel: HotelPOI) => {
    dispatch({ type: 'SET_DAY_HOTEL', payload: { dayIndex: activeDayIdx, hotel } })
    setFlyTarget({ lat: hotel.lat, lng: hotel.lng })
  }

  const handleApplyToAll = () => {
    if (!currentDayHotel) return
    const indices = days.map((_, i) => i)
    dispatch({ type: 'SET_DAYS_HOTEL', payload: { dayIndices: indices, hotel: currentDayHotel } })
  }

  const handleApplyToRemaining = () => {
    if (!currentDayHotel) return
    const indices = days.map((_, i) => i).filter((i) => i >= activeDayIdx)
    dispatch({ type: 'SET_DAYS_HOTEL', payload: { dayIndices: indices, hotel: currentDayHotel } })
  }

  const handleRemoveHotel = () => {
    dispatch({ type: 'SET_DAY_HOTEL', payload: { dayIndex: activeDayIdx, hotel: null } })
  }

  const handleMapClick = async (lat: number, lng: number) => {
    const geo = await reverseGeocode(lat, lng)
    setMapClickHotel({ lat, lng, ...geo })
  }

  const confirmMapClick = () => {
    if (!mapClickHotel) return
    const hotel: HotelPOI = {
      id: `custom-${Date.now()}`,
      name: mapClickHotel.name,
      address: mapClickHotel.address,
      lat: mapClickHotel.lat,
      lng: mapClickHotel.lng,
    }
    handleSelectHotel(hotel)
    setMapClickHotel(null)
  }

  const handleViewDetail = (hotel: HotelPOI) => {
    dispatch({ type: 'VIEW_HOTEL_DETAIL', payload: JSON.stringify(hotel) })
  }

  const handleNext = () => {
    dispatch({ type: 'SET_VIEW', payload: 'place-selection' })
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    return `${d.getMonth() + 1}/${d.getDate()} 周${weekdays[d.getDay()]}`
  }

  // Collect all markers to show on map
  const allMarkers: { hotel: HotelPOI; type: 'current' | 'assigned' | 'recommend' | 'search' | 'mapclick' }[] = []
  if (currentDayHotel) allMarkers.push({ hotel: currentDayHotel, type: 'current' })
  const seenIds = new Set(currentDayHotel ? [currentDayHotel.id] : [])
  days.forEach((d, i) => {
    if (i !== activeDayIdx && d.hotel && !seenIds.has(d.hotel.id)) {
      seenIds.add(d.hotel.id)
      allMarkers.push({ hotel: d.hotel, type: 'assigned' })
    }
  })
  filteredHotels.forEach((h) => {
    if (!seenIds.has(h.id)) allMarkers.push({ hotel: h, type: 'recommend' })
  })
  searchResults.forEach((h) => {
    if (!seenIds.has(h.id)) allMarkers.push({ hotel: h, type: 'search' })
  })

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-[1000] glass border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Button
            variant="ghost" size="sm"
            onClick={() => mode === 'selection' ? setMode('choice') : dispatch({ type: 'SET_VIEW', payload: 'create' })}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{mode === 'selection' ? '返回' : '返回上一步'}</span>
          </Button>

          {/* Step Indicator: 3 steps */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <StepDot step={1} current={0} label="目的地" />
            <div className="h-0.5 w-6 sm:w-10 rounded-full bg-primary" />
            <StepDot step={2} current={2} label="酒店安排" />
            <ProgressLine filled={false} />
            <StepDot step={3} current={0} label="行程规划" />
          </div>

          <div className="w-16 sm:w-24" />
        </div>
      </header>

      {/* ===== CHOICE MODE ===== */}
      {mode === 'choice' && (
        <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 animate-fade-in">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full bg-coral-light px-4 py-1.5 text-xs font-semibold text-coral-dark">
              <Hotel className="h-3.5 w-3.5" />
              第二步 · 酒店安排
            </div>
            <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
              是否需要指定入住酒店？
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              你可以为 <span className="font-semibold text-foreground">{city.name}</span> 的每一天安排入住酒店，也可以稍后再决定
            </p>
          </div>

          {/* Choice Cards */}
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            <button
              onClick={() => setMode('selection')}
              className="group relative overflow-hidden rounded-2xl border-2 border-transparent bg-card p-6 text-left shadow-card transition-all duration-300 hover:border-primary hover:shadow-elegant hover:-translate-y-1 sm:p-8"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl gradient-hero transition-all duration-300 group-hover:shadow-glow sm:h-16 sm:w-16">
                <Hotel className="h-7 w-7 text-primary-foreground sm:h-8 sm:w-8" />
              </div>
              <h3 className="mb-2 text-lg font-bold text-foreground sm:text-xl">指定每日酒店</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                在地图上搜索或选点，为每一天安排入住酒店，方便后续规划行程路线
              </p>
              <div className="mt-4 flex items-center gap-1 text-sm font-medium text-primary transition-smooth group-hover:gap-2">
                开始选择
                <ArrowRight className="h-4 w-4" />
              </div>
            </button>

            <button
              onClick={handleNext}
              className="group relative overflow-hidden rounded-2xl border-2 border-transparent bg-card p-6 text-left shadow-card transition-all duration-300 hover:border-border hover:shadow-card-hover hover:-translate-y-1 sm:p-8"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary transition-all duration-300 sm:h-16 sm:w-16">
                <SkipForward className="h-7 w-7 text-muted-foreground sm:h-8 sm:w-8" />
              </div>
              <h3 className="mb-2 text-lg font-bold text-foreground sm:text-xl">暂不指定</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                跳过酒店安排，直接进入行程规划。你可以随时回来补充酒店信息
              </p>
              <div className="mt-4 flex items-center gap-1 text-sm font-medium text-muted-foreground transition-smooth group-hover:gap-2">
                跳过此步
                <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          </div>

          {/* City summary */}
          <div className="mt-8 flex items-center justify-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-card">
            <img src={city.image} alt={city.name} className="h-12 w-12 rounded-xl object-cover" />
            <div className="text-sm">
              <p className="font-semibold text-foreground">{city.name} · {days.length}天{days.length > 1 ? `${days.length - 1}晚` : ''}</p>
              <p className="text-muted-foreground">{days[0]?.date} ~ {days[days.length - 1]?.date}</p>
            </div>
          </div>
        </main>
      )}

      {/* ===== SELECTION MODE ===== */}
      {mode === 'selection' && (
        <div className="flex h-[calc(100svh-56px)] flex-col animate-fade-in">
          {/* Day tabs */}
          <div className="shrink-0 border-b border-border bg-card px-3 py-2 sm:px-6">
            <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto scrollbar-hide">
              {days.map((day, i) => (
                <button
                  key={day.id}
                  onClick={() => { setActiveDayIdx(i); if (day.hotel) setFlyTarget({ lat: day.hotel.lat, lng: day.hotel.lng }) }}
                  className={`relative flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all sm:text-sm ${
                    i === activeDayIdx
                      ? 'gradient-hero text-primary-foreground shadow-elegant'
                      : day.hotel
                      ? 'bg-ocean-light text-ocean border border-ocean/20'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  }`}
                >
                  {day.hotel && i !== activeDayIdx && <Check className="h-3 w-3" />}
                  <span>第{day.dayNumber}天</span>
                  <span className="hidden sm:inline text-[10px] opacity-75">{formatDate(day.date)}</span>
                </button>
              ))}
              <div className="ml-auto shrink-0 rounded-full bg-secondary px-3 py-1 text-[10px] font-medium text-muted-foreground">
                已安排 {assignedCount}/{days.length} 晚
              </div>
            </div>
          </div>

          {/* Main content: sidebar + map */}
          <div className="flex min-h-0 flex-1">
            {/* Left sidebar */}
            <div className="flex w-[340px] shrink-0 flex-col border-r border-border bg-card max-lg:hidden">
              {/* Search */}
              <div className="shrink-0 border-b border-border p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="搜索酒店名称或地址..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); clearResults() }}
                    className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-smooth"
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(''); clearResults() }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  <MapPin className="mr-1 inline h-3 w-3" />
                  也可以直接在地图上点击选点
                </p>
              </div>

              {/* Sort & Filter bar */}
              <div className="shrink-0 border-b border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as SortKey)}
                      className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-1.5 pr-7 text-[11px] font-medium text-foreground focus:border-primary focus:outline-none"
                    >
                      {Object.entries(SORT_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-smooth ${
                      starFilter > 0 ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    筛选{starFilter > 0 ? ` ·${starFilter}星+` : ''}
                  </button>
                </div>
                {showFilters && (
                  <div className="mt-2 flex items-center gap-1 animate-fade-in">
                    <span className="text-[10px] text-muted-foreground mr-1">星级:</span>
                    {([0, 2, 3, 4, 5] as StarFilter[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setStarFilter(s)}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-smooth ${
                          starFilter === s ? 'gradient-hero text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                        }`}
                      >
                        {s === 0 ? '全部' : `${s}星+`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Results / Recommended list */}
              <div className="flex-1 overflow-y-auto p-3">
                {/* 仅当本地无匹配结果时才显示Nominatim搜索中状态 */}
                {searchLoading && searchQuery.trim() && filteredHotels.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground animate-pulse-soft">搜索中...</div>
                )}

                {/* Nominatim地图搜索结果（兜底，仅当本地无匹配且有外部搜索结果时显示） */}
                {searchResults.length > 0 && searchQuery.trim() && filteredHotels.length === 0 && (
                  <div className="mb-4">
                    <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">地图位置搜索</p>
                    {searchResults.map((h) => (
                      <HotelListItem
                        key={h.id}
                        hotel={h}
                        isSelected={currentDayHotel?.id === h.id}
                        onSelect={() => handleSelectHotel(h)}
                        onLocate={() => setFlyTarget({ lat: h.lat, lng: h.lng })}
                        onViewDetail={() => handleViewDetail(h)}
                      />
                    ))}
                  </div>
                )}

                {serverLoading && (
                  <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span>正在加载{city.name}推荐酒店...</span>
                  </div>
                )}

                {serverError && !serverLoading && allCityHotels.length === 0 && (
                  <div className="rounded-xl bg-destructive/5 p-4 text-center text-xs text-destructive">{serverError}</div>
                )}

                {!serverLoading && (
                  <div>
                    <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {searchQuery.trim()
                        ? <>搜索结果 <span className="ml-1 text-muted-foreground/60">{filteredHotels.length}家匹配</span></>
                        : <>推荐酒店 <span className="ml-1 text-muted-foreground/60">{filteredHotels.length}家</span></>
                      }
                    </p>
                    {filteredHotels.length === 0 && searchQuery.trim() && (
                      <div className="rounded-xl bg-secondary/50 p-6 text-center">
                        <p className="text-sm text-muted-foreground">未找到匹配「{searchQuery}」的酒店</p>
                        <p className="mt-1 text-[10px] text-muted-foreground/60">试试其他关键词，或直接在地图上点击选点</p>
                      </div>
                    )}
                    {filteredHotels.map((h) => (
                      <HotelListItem
                        key={h.id}
                        hotel={h}
                        isSelected={currentDayHotel?.id === h.id}
                        onSelect={() => handleSelectHotel(h)}
                        onLocate={() => setFlyTarget({ lat: h.lat, lng: h.lng })}
                        onViewDetail={() => handleViewDetail(h)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Current day status */}
              {currentDayHotel && (
                <div className="shrink-0 border-t border-border p-3">
                  <div className="rounded-xl gradient-warm border border-border p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] font-medium text-muted-foreground">第{days[activeDayIdx].dayNumber}天入住</span>
                      <button onClick={handleRemoveHotel} className="text-[10px] text-destructive hover:underline">移除</button>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{currentDayHotel.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">{currentDayHotel.address}</p>
                    <div className="mt-2 flex gap-1.5">
                      <button onClick={handleApplyToAll} className="flex items-center gap-1 rounded-lg bg-card border border-border px-2 py-1 text-[10px] font-medium text-foreground hover:bg-secondary transition-smooth">
                        <Copy className="h-3 w-3" /> 应用到全部天
                      </button>
                      <button onClick={handleApplyToRemaining} className="flex items-center gap-1 rounded-lg bg-card border border-border px-2 py-1 text-[10px] font-medium text-foreground hover:bg-secondary transition-smooth">
                        <Copy className="h-3 w-3" /> 应用到之后
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Map area */}
            <div className="relative flex-1">
              <MapContainer
                center={[city.lat, city.lng]}
                zoom={13}
                className="h-full w-full"
                zoomControl={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
                  url="/api/tiles/{z}/{x}/{y}"
                  subdomains=""
                  maxZoom={20}
                />
                <MapResizeFix />
                <MapClickHandler onMapClick={handleMapClick} />
                {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} />}

                {/* Hotel markers */}
                {allMarkers.map((m) => (
                  <Marker
                    key={m.hotel.id}
                    position={[m.hotel.lat, m.hotel.lng]}
                    icon={m.type === 'current' ? selectedIcon : m.type === 'assigned' ? assignedIcon : m.type === 'search' ? searchIcon : defaultIcon}
                    eventHandlers={{ click: () => { if (m.type !== 'current') handleSelectHotel(m.hotel) } }}
                  >
                    <Popup>
                      <div className="min-w-[180px]">
                        <p className="font-semibold text-sm">{m.hotel.name}</p>
                        {m.hotel.rating && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            <span className="text-xs font-medium">{m.hotel.rating.toFixed(1)}</span>
                            {m.hotel.stars && <span className="text-[10px] text-gray-400">· {m.hotel.stars}星</span>}
                          </div>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5">{m.hotel.address}</p>
                        {m.hotel.priceRange && (
                          <p className="text-xs font-semibold text-orange-500 mt-1">¥{m.hotel.priceRange[0]}起/晚</p>
                        )}
                        <div className="mt-2 flex gap-1">
                          {m.type !== 'current' && (
                            <button
                              onClick={() => handleSelectHotel(m.hotel)}
                              className="flex-1 rounded-md bg-orange-500 px-2 py-1 text-xs text-white font-medium hover:bg-orange-600"
                            >
                              选为第{days[activeDayIdx].dayNumber}天酒店
                            </button>
                          )}
                          {m.hotel.roomTypes && m.hotel.roomTypes.length > 0 && (
                            <button
                              onClick={() => handleViewDetail(m.hotel)}
                              className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50"
                            >
                              详情
                            </button>
                          )}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {/* Map click marker */}
                {mapClickHotel && (
                  <Marker
                    position={[mapClickHotel.lat, mapClickHotel.lng]}
                    icon={createIcon('#22c55e', true)}
                  >
                    <Popup>
                      <div className="min-w-[180px]">
                        <p className="font-semibold text-sm">{mapClickHotel.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{mapClickHotel.address}</p>
                        <div className="mt-2 flex gap-1">
                          <button
                            onClick={confirmMapClick}
                            className="flex-1 rounded-md bg-orange-500 px-2 py-1 text-xs text-white font-medium hover:bg-orange-600"
                          >
                            确认选择
                          </button>
                          <button
                            onClick={() => setMapClickHotel(null)}
                            className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-gray-50"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )}
              </MapContainer>

              {/* Mobile search overlay */}
              <MobileSearchOverlay
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                search={nominatimSearch}
                clearResults={clearResults}
                searchLoading={searchLoading}
                searchResults={searchResults}
                cityHotels={filteredHotels}
                currentDayHotel={currentDayHotel}
                onSelectHotel={handleSelectHotel}
                onLocate={(h) => setFlyTarget({ lat: h.lat, lng: h.lng })}
                onViewDetail={handleViewDetail}
                activeDayIdx={activeDayIdx}
                days={days}
                onRemoveHotel={handleRemoveHotel}
                onApplyAll={handleApplyToAll}
                onApplyRemaining={handleApplyToRemaining}
                serverLoading={serverLoading}
              />

              {/* Bottom bar: next button */}
              <div className="absolute bottom-4 left-4 right-4 z-[500] flex items-center justify-between gap-3 rounded-2xl glass border border-border p-3 shadow-float max-lg:flex-col">
                <div className="text-sm">
                  <span className="font-semibold text-foreground">第{days[activeDayIdx].dayNumber}天</span>
                  <span className="mx-1.5 text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{formatDate(days[activeDayIdx].date)}</span>
                  {currentDayHotel && (
                    <>
                      <span className="mx-1.5 text-muted-foreground">·</span>
                      <span className="font-medium text-primary">{currentDayHotel.name}</span>
                    </>
                  )}
                </div>
                <Button variant="coral" size="default" onClick={handleNext} className="group shrink-0">
                  完成酒店安排
                  <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Subcomponents ── */

function StepDot({ step, current, label }: { step: number; current: number; label: string }) {
  const done = current > step
  const active = current === step
  return (
    <div className="flex items-center gap-1.5">
      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
        done ? 'gradient-hero text-primary-foreground'
        : active ? 'gradient-hero text-primary-foreground shadow-elegant'
        : step === 1 ? 'gradient-hero text-primary-foreground scale-90'
        : 'bg-secondary text-muted-foreground'
      }`}>
        {done || step === 1 ? <Check className="h-3.5 w-3.5" /> : step}
      </div>
      <span className={`hidden text-xs font-medium sm:block ${active || done || step === 1 ? 'text-foreground' : 'text-muted-foreground'}`}>
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

/* ── Enhanced Hotel List Item with rating, price, amenities ── */
function HotelListItem({ hotel, isSelected, onSelect, onLocate, onViewDetail }: {
  hotel: HotelPOI; isSelected: boolean; onSelect: () => void; onLocate: () => void; onViewDetail: () => void
}) {
  const hasRichData = !!(hotel.rating || hotel.priceRange || hotel.stars)

  return (
    <div className={`mb-2 rounded-xl transition-all cursor-pointer ${
      isSelected ? 'bg-coral-light border border-primary/20' : 'hover:bg-secondary border border-transparent'
    }`} onClick={onSelect}>
      {/* Rich card with image */}
      {hasRichData && hotel.images && hotel.images.length > 0 ? (
        <div className="flex gap-2.5 p-2.5">
          <img
            src={hotel.images[0]}
            alt={hotel.name}
            className="h-20 w-24 shrink-0 rounded-lg object-cover"
            onError={handleImgError}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-1">
              <p className={`text-sm font-semibold truncate ${isSelected ? 'text-coral-dark' : 'text-foreground'}`}>
                {hotel.name}
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); onViewDetail() }}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-card hover:text-primary transition-smooth"
                title="查看详情"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* Stars + Rating */}
            <div className="mt-0.5 flex items-center gap-1.5">
              {hotel.stars && (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: hotel.stars }).map((_, i) => (
                    <Star key={i} className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
              )}
              {hotel.rating && (
                <span className="text-[10px] font-semibold text-foreground">{hotel.rating.toFixed(1)}</span>
              )}
              {hotel.reviewCount && (
                <span className="text-[10px] text-muted-foreground">({hotel.reviewCount})</span>
              )}
            </div>
            {/* Amenity icons */}
            {hotel.amenities && hotel.amenities.length > 0 && (
              <div className="mt-1 flex items-center gap-1">
                {hotel.amenities.slice(0, 4).map((a) => {
                  const Icon = AMENITY_ICONS[a]
                  return Icon ? <Icon key={a} className="h-3 w-3 text-muted-foreground" /> : null
                })}
              </div>
            )}
            {/* Price */}
            {hotel.priceRange && (
              <div className="mt-1 flex items-baseline gap-0.5">
                <span className="text-sm font-bold text-primary">¥{hotel.priceRange[0]}</span>
                <span className="text-[10px] text-muted-foreground">起/晚</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Simple card for basic hotels */
        <div className="flex items-start gap-2.5 p-2.5">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${
            isSelected ? 'gradient-hero' : 'bg-secondary'
          }`}>
            🏨
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium truncate ${isSelected ? 'text-coral-dark' : 'text-foreground'}`}>{hotel.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{hotel.address}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onLocate() }}
            className="mt-1 shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-card hover:text-primary transition-smooth"
            title="在地图上查看"
          >
            <Navigation className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Mobile search overlay (shown on lg:hidden screens) ── */
function MobileSearchOverlay({ searchQuery, setSearchQuery, search, clearResults, searchLoading, searchResults, cityHotels, currentDayHotel, onSelectHotel, onLocate, onViewDetail, activeDayIdx, days, onRemoveHotel, onApplyAll, onApplyRemaining, serverLoading }: {
  searchQuery: string; setSearchQuery: (v: string) => void; search: (q: string) => void; clearResults: () => void
  searchLoading: boolean; searchResults: HotelPOI[]; cityHotels: HotelPOI[]
  currentDayHotel: HotelPOI | null | undefined; onSelectHotel: (h: HotelPOI) => void; onLocate: (h: HotelPOI) => void; onViewDetail: (h: HotelPOI) => void
  activeDayIdx: number; days: { dayNumber: number; hotel?: HotelPOI | null }[]
  onRemoveHotel: () => void; onApplyAll: () => void; onApplyRemaining: () => void; serverLoading: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="lg:hidden">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="absolute left-3 top-3 z-[500] flex items-center gap-1.5 rounded-xl glass border border-border px-3 py-2 text-xs font-medium text-foreground shadow-card"
      >
        <Search className="h-3.5 w-3.5" />
        搜索酒店
      </button>

      {/* Slide-up panel */}
      {open && (
        <div className="absolute inset-x-0 top-0 bottom-16 z-[600] flex flex-col rounded-b-2xl bg-card shadow-float animate-slide-up">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-foreground">搜索酒店</span>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button>
          </div>
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text" placeholder="搜索酒店名称或地址..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); clearResults() }}
                className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-8 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {searchQuery && <button onClick={() => { setSearchQuery(''); clearResults() }} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {searchLoading && searchQuery.trim() && cityHotels.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground animate-pulse-soft">搜索中...</div>}
            {searchResults.length > 0 && searchQuery.trim() && cityHotels.length === 0 && (
              <div className="mb-3">
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">地图位置搜索</p>
                {searchResults.map((h) => (
                  <HotelListItem key={h.id} hotel={h} isSelected={currentDayHotel?.id === h.id} onSelect={() => { onSelectHotel(h); setOpen(false) }} onLocate={() => { onLocate(h); setOpen(false) }} onViewDetail={() => { onViewDetail(h); setOpen(false) }} />
                ))}
              </div>
            )}
            {serverLoading && (
              <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span>加载推荐酒店中...</span>
              </div>
            )}
            {!serverLoading && (
              <>
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">推荐酒店</p>
                {cityHotels.map((h) => (
                  <HotelListItem key={h.id} hotel={h} isSelected={currentDayHotel?.id === h.id} onSelect={() => { onSelectHotel(h); setOpen(false) }} onLocate={() => { onLocate(h); setOpen(false) }} onViewDetail={() => { onViewDetail(h); setOpen(false) }} />
                ))}
              </>
            )}
          </div>
          {currentDayHotel && (
            <div className="shrink-0 border-t border-border p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground">第{days[activeDayIdx].dayNumber}天入住</p>
                  <p className="text-sm font-semibold text-foreground truncate">{currentDayHotel.name}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={onApplyAll} className="rounded-lg border border-border px-2 py-1 text-[10px] font-medium hover:bg-secondary">全部天</button>
                  <button onClick={onRemoveHotel} className="rounded-lg border border-border px-2 py-1 text-[10px] font-medium text-destructive hover:bg-secondary">移除</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
