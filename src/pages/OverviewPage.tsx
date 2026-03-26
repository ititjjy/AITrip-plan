import { useApp } from '@/context/AppContext'
import { displayName } from '@/utils/poiName'
import { useAuth } from '@/context/AuthContext'
import { popularCities, getAllAttractions, getAttractionTypeLabel, getAttractionTypeIcon } from '@/data/mock-data'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, MapPin, Calendar, Clock, Star, Wallet,
  Download, Share2, ChevronRight, ChevronLeft, Compass, Sparkles,
  Flame, Eye, LayoutGrid, Save, Loader2 as Spinner, BookOpen, Hotel, Phone, Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import RouteMap from '@/components/RouteMap'
import TransportSegmentCard from '@/components/TransportSegment'

type ViewMode = 'overview' | 'daily'

function SeasonalBadge({ value }: { value: number }) {
  if (!value || value <= 0) return null
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
      <Flame className="h-2.5 w-2.5 text-amber-500" />
      {value.toFixed(1)}
    </span>
  )
}

export default function OverviewPage() {
  const { state, dispatch } = useApp()
  const { user, requireAuth, getAuthHeaders } = useAuth()
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const savedTripId = state.savedTripId
  const isSavedTrip = !!savedTripId

  const doSaveTrip = async () => {
    if (!trip) return
    setSaving(true)
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripData: trip, title: `${trip.cityName}自由行` }),
      })
      const data = await res.json()
      if (data.success) {
        setSaved(true)
        if (data.id || data.tripId) dispatch({ type: 'SET_SAVED_TRIP_ID', payload: String(data.id || data.tripId) })
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  const handleSaveTrip = async () => {
    if (!trip) return
    if (!requireAuth('保存行程需要先登录', doSaveTrip)) return
    await doSaveTrip()
  }

  const handleDeleteTrip = async () => {
    if (!savedTripId) return
    if (!confirm('确定要删除这个行程吗？此操作不可撤销。')) return
    setDeleting(true)
    try {
      await fetch(`/api/trips/${savedTripId}`, { method: 'DELETE', headers: getAuthHeaders() })
      dispatch({ type: 'SET_SAVED_TRIP_ID', payload: null })
      dispatch({ type: 'SET_VIEW', payload: 'profile' })
    } catch { /* ignore */ }
    setDeleting(false)
  }
  const [selectedDay, setSelectedDay] = useState(0)

  const trip = state.currentTrip
  if (!trip) return null

  const city = popularCities.find((c) => c.id === trip.cityId)
  const attractions = useMemo(() => getAllAttractions(trip.cityId), [trip.cityId])
  const getAttraction = (id: string) => attractions.find((a) => a.id === id)

  const totalItems = trip.days.reduce((sum, d) => sum + d.items.length, 0)
  const totalCost = trip.totalBudget

  const typeBreakdown = useMemo(() => {
    const map: Record<string, { count: number; cost: number }> = {}
    trip.days.forEach((day) =>
      day.items.forEach((item) => {
        if (!map[item.type]) map[item.type] = { count: 0, cost: 0 }
        map[item.type].count++
        map[item.type].cost += item.cost
      })
    )
    return map
  }, [trip])

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    })

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

  const openDetail = (attractionId: string) => {
    dispatch({ type: 'VIEW_DETAIL', payload: attractionId })
  }

  /* ─── Daily View ─── */
  const renderDailyView = () => {
    const day = trip.days[selectedDay]
    if (!day) return null
    const dayCost = day.items.reduce((s, i) => s + i.cost, 0)

    return (
      <div className="animate-fade-in">
        {/* Day navigation */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => setSelectedDay(Math.max(0, selectedDay - 1))}
            disabled={selectedDay === 0}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-secondary disabled:opacity-30 transition-smooth"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            {trip.days.map((d, idx) => (
              <button
                key={d.id}
                onClick={() => setSelectedDay(idx)}
                className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold transition-all duration-200 ${
                  idx === selectedDay
                    ? 'gradient-hero text-primary-foreground shadow-elegant'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                }`}
              >
                D{d.dayNumber}
              </button>
            ))}
          </div>

          <button
            onClick={() => setSelectedDay(Math.min(trip.days.length - 1, selectedDay + 1))}
            disabled={selectedDay >= trip.days.length - 1}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-secondary disabled:opacity-30 transition-smooth"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Day header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">第 {day.dayNumber} 天</h2>
            <p className="text-sm text-muted-foreground">{formatDate(day.date)}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">活动数</p>
              <p className="text-lg font-bold text-foreground">{day.items.length}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">当日花费</p>
              <p className="text-lg font-bold text-primary">¥{dayCost}</p>
            </div>
          </div>
        </div>

        {/* Hotel Card (Daily View) */}
        {day.hotel && (
          <div
            onClick={() => dispatch({ type: 'VIEW_HOTEL_DETAIL', payload: JSON.stringify(day.hotel) })}
            className="mb-5 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all sm:p-4"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-11 sm:w-11">
              <Hotel className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-foreground truncate sm:text-sm">{day.hotel.name}</p>
                {day.hotel.stars && (
                  <span className="shrink-0 text-[9px] text-amber-600 font-medium">{day.hotel.stars}★</span>
                )}
              </div>
              {day.hotel.address && (
                <p className="mt-0.5 text-[10px] text-muted-foreground truncate sm:text-xs">
                  <MapPin className="mr-0.5 inline h-2.5 w-2.5" />{day.hotel.address}
                </p>
              )}
            </div>
            {day.hotel.priceRange && (
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold text-primary sm:text-sm">¥{day.hotel.priceRange[0]}</p>
                <p className="text-[9px] text-muted-foreground">起/晚</p>
              </div>
            )}
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        )}

        {/* Route Map */}
        {day.items.length > 0 && (
          <div className="mb-5">
            <RouteMap
              items={day.items}
              hotel={day.hotel}
              cityId={trip.cityId}
              onMarkerClick={openDetail}
              className="h-[220px] sm:h-[280px]"
            />
          </div>
        )}

        {/* Detailed item list */}
        {day.items.length > 0 ? (
          <div className="space-y-0">
            {day.items.map((item, itemIdx) => {
              const attraction = getAttraction(item.attractionId)
              const prevItem = itemIdx > 0 ? day.items[itemIdx - 1] : null
              const prevAttraction = prevItem ? getAttraction(prevItem.attractionId) : null
              const fromLat = prevAttraction?.lat ?? day.hotel?.lat
              const fromLng = prevAttraction?.lng ?? day.hotel?.lng

              return (
                <div key={item.id}>
                  {/* Transport segment */}
                  {attraction && fromLat != null && fromLng != null && (
                    <div className="ml-6 sm:ml-8">
                      <TransportSegmentCard
                        fromLat={fromLat}
                        fromLng={fromLng}
                        toLat={attraction.lat}
                        toLng={attraction.lng}
                        cityId={trip.cityId}
                      />
                    </div>
                  )}

                  {/* POI card - enhanced with seasonal index */}
                  <div
                    className={`flex items-start gap-2.5 rounded-xl p-2.5 sm:gap-3 sm:p-3 transition-smooth cursor-pointer group ${
                      item.isAutoFilled
                        ? item.type === 'food'
                          ? 'bg-gradient-to-r from-amber-50/60 to-orange-50/60 hover:from-amber-50/80 hover:to-orange-50/80 border border-amber-200/60'
                          : 'bg-gradient-to-r from-violet-50/50 to-indigo-50/50 hover:from-violet-50/70 hover:to-indigo-50/70 border border-violet-200/60'
                        : 'hover:bg-secondary/50'
                    }`}
                    onClick={() => attraction && openDetail(attraction.id)}
                  >
                    <span className="mt-1 text-[10px] font-medium text-muted-foreground w-10 sm:text-xs sm:w-12 shrink-0">
                      {item.startTime}
                    </span>
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg sm:h-14 sm:w-14 ring-0 group-hover:ring-2 group-hover:ring-primary/20 transition-all">
                      {attraction && (
                        <img
                          src={attraction.image}
                          alt={displayName(attraction)}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold sm:text-[9px] ${typeBadgeClass(item.type)}`}>
                          {getAttractionTypeLabel(item.type)}
                        </span>
                        <span className="text-xs font-semibold text-foreground truncate sm:text-sm">
                          {displayName(attraction)}
                        </span>
                        {/* Seasonal index */}
                        {attraction?.seasonalIndex && attraction.seasonalIndex > 0 && (
                          <SeasonalBadge value={attraction.seasonalIndex} />
                        )}
                        {/* AI badge */}
                        {item.isAutoFilled && (
                          <span className="flex items-center gap-0.5 rounded-full bg-violet-100 text-violet-700 px-1.5 py-0.5 text-[9px] font-medium">
                            <Sparkles className="h-2.5 w-2.5" />
                            AI
                          </span>
                        )}
                      </div>
                      {/* Recommend reason */}
                      {attraction?.recommendReason && (
                        <div className="mt-1 flex items-start gap-1">
                          <Sparkles className="h-2.5 w-2.5 text-primary shrink-0 mt-0.5" />
                          <p className="text-[10px] text-primary/70 line-clamp-2 sm:text-[11px]">
                            {attraction.recommendReason}
                          </p>
                        </div>
                      )}
                      {item.notes && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground truncate sm:text-xs">
                          📝 {item.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="text-[10px] font-semibold text-primary sm:text-xs">
                        {item.cost > 0 ? `¥${item.cost}` : '免费'}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {item.startTime}-{item.endTime}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-border py-12 text-center">
            <p className="text-sm text-muted-foreground">暂无行程安排</p>
          </div>
        )}

        {/* Edit this day button */}
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              dispatch({ type: 'SELECT_DAY', payload: selectedDay })
              dispatch({ type: 'SET_VIEW', payload: 'planner' })
            }}
          >
            <ChevronRight className="mr-1 h-3.5 w-3.5" />
            编辑第 {day.dayNumber} 天
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-safe">
      {/* Hero */}
      <div className="relative h-48 overflow-hidden sm:h-64">
        {city && (
          <img src={city.image} alt={city.name} className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/30 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-primary-foreground hover:bg-primary-foreground/10 sm:px-3"
              onClick={() => dispatch({ type: 'SET_VIEW', payload: 'planner' })}
            >
              <ArrowLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">返回编辑</span>
            </Button>
            <div className="flex gap-2">
              <button className="flex h-8 w-8 items-center justify-center rounded-full glass text-foreground transition-smooth hover:bg-card sm:h-9 sm:w-9">
                <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
              <button className="flex h-8 w-8 items-center justify-center rounded-full glass text-foreground transition-smooth hover:bg-card sm:h-9 sm:w-9">
                <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
              {isSavedTrip ? (
                <button
                  onClick={handleDeleteTrip}
                  disabled={deleting}
                  className="flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs font-semibold text-red-300 transition-smooth hover:bg-red-500/20 disabled:opacity-70 sm:px-4 sm:py-2 sm:text-sm"
                >
                  {deleting ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {deleting ? '删除中' : '删除行程'}
                </button>
              ) : (
                <button
                  onClick={handleSaveTrip}
                  disabled={saving || saved}
                  className="flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs font-semibold text-foreground transition-smooth hover:bg-card disabled:opacity-70 sm:px-4 sm:py-2 sm:text-sm"
                >
                  {saving ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : saved ? <BookOpen className="h-3.5 w-3.5 text-emerald-500" /> : <Save className="h-3.5 w-3.5" />}
                  {saved ? '已保存' : '保存行程'}
                </button>
              )}
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary-foreground sm:text-3xl">
              {trip.cityName}自由行
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-primary-foreground/80 sm:mt-2 sm:gap-4 sm:text-sm">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">{formatDate(trip.startDate)} - {formatDate(trip.endDate)}</span>
                <span className="sm:hidden">
                  {new Date(trip.startDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })} - {new Date(trip.endDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {trip.days.length} 天
              </span>
              <span className="flex items-center gap-1">
                <Compass className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {totalItems} 个活动
              </span>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {/* View mode toggle */}
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-border bg-card p-1 w-fit">
          <button
            onClick={() => setViewMode('overview')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              viewMode === 'overview'
                ? 'gradient-hero text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            总览
          </button>
          <button
            onClick={() => setViewMode('daily')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              viewMode === 'daily'
                ? 'gradient-hero text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            分天预览
          </button>
        </div>

        {viewMode === 'daily' ? renderDailyView() : (
          <>
            {/* Stats Row */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:mb-10 sm:gap-4 md:grid-cols-4">
              {[
                { label: '旅行天数', value: `${trip.days.length} 天`, icon: Calendar },
                { label: '活动总数', value: `${totalItems} 个`, icon: Star },
                { label: '总预算', value: `¥${totalCost.toLocaleString()}`, icon: Wallet },
                {
                  label: '日均花费',
                  value: `¥${trip.days.length > 0 ? Math.round(totalCost / trip.days.length).toLocaleString() : 0}`,
                  icon: Clock,
                },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-xl border border-border bg-card p-3 shadow-card sm:p-4">
                  <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-coral-light sm:mb-2 sm:h-9 sm:w-9">
                    <Icon className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
                  </div>
                  <p className="text-[10px] text-muted-foreground sm:text-xs">{label}</p>
                  <p className="text-lg font-bold text-foreground sm:text-xl">{value}</p>
                </div>
              ))}
            </div>

            {/* Type Breakdown */}
            {Object.keys(typeBreakdown).length > 0 && (
              <div className="mb-6 sm:mb-10">
                <h2 className="mb-3 text-base font-semibold text-foreground sm:mb-4 sm:text-lg">活动分布</h2>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  {Object.entries(typeBreakdown).map(([type, data]) => (
                    <div
                      key={type}
                      className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-card sm:gap-3 sm:px-4 sm:py-3"
                    >
                      <span className="text-lg sm:text-xl">{getAttractionTypeIcon(type as any)}</span>
                      <div>
                        <p className="text-xs font-medium text-foreground sm:text-sm">
                          {getAttractionTypeLabel(type as any)}
                        </p>
                        <p className="text-[10px] text-muted-foreground sm:text-xs">
                          {data.count} 次 · ¥{data.cost.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Daily Overview */}
            <div>
              <h2 className="mb-4 text-base font-semibold text-foreground sm:mb-6 sm:text-lg">每日行程</h2>
              <div className="space-y-6 sm:space-y-8">
                {trip.days.map((day, dayIdx) => {
                  const dayCost = day.items.reduce((s, i) => s + i.cost, 0)
                  return (
                    <div key={day.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-card sm:rounded-2xl">
                      {/* Day Header */}
                      <div className="flex items-center justify-between gradient-warm px-4 py-3 sm:px-6 sm:py-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-hero text-xs font-bold text-primary-foreground sm:h-10 sm:w-10 sm:rounded-xl sm:text-sm">
                            D{day.dayNumber}
                          </div>
                          <div>
                            <h3 className="text-xs font-semibold text-foreground sm:text-sm">
                              第 {day.dayNumber} 天
                            </h3>
                            <p className="text-[10px] text-muted-foreground sm:text-xs">{formatDate(day.date)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] sm:gap-4 sm:text-xs">
                          <span className="hidden text-muted-foreground sm:inline">{day.items.length} 个活动</span>
                          <span className="font-semibold text-primary">¥{dayCost}</span>
                          <button
                            onClick={() => {
                              dispatch({ type: 'SELECT_DAY', payload: dayIdx })
                              dispatch({ type: 'SET_VIEW', payload: 'planner' })
                            }}
                            className="flex items-center gap-0.5 text-primary hover:underline"
                          >
                            编辑
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Hotel Info */}
                      {day.hotel && (
                        <div
                          onClick={() => dispatch({ type: 'VIEW_HOTEL_DETAIL', payload: JSON.stringify(day.hotel) })}
                          className="mx-4 mt-3 flex items-center gap-2.5 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all sm:mx-6 sm:mt-4 sm:px-4 sm:py-2.5"
                        >
                          <Hotel className="h-4 w-4 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <span className="text-[11px] font-semibold text-foreground truncate block sm:text-xs">{day.hotel.name}</span>
                          </div>
                          {day.hotel.stars && (
                            <span className="shrink-0 text-[9px] text-amber-600 font-medium">{day.hotel.stars}★</span>
                          )}
                          {day.hotel.priceRange && (
                            <span className="shrink-0 text-[11px] font-semibold text-primary sm:text-xs">¥{day.hotel.priceRange[0]}起</span>
                          )}
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </div>
                      )}

                      {/* Route Map for this day */}
                      {day.items.length > 1 && (
                        <div className="px-4 pt-4 sm:px-6">
                          <RouteMap
                            items={day.items}
                            hotel={day.hotel}
                            cityId={trip.cityId}
                            onMarkerClick={openDetail}
                            className="h-[180px] sm:h-[220px]"
                          />
                        </div>
                      )}

                      {/* Items */}
                      {day.items.length > 0 ? (
                        <div className="px-4 py-3 sm:px-6 sm:py-4 space-y-0">
                          {day.items.map((item, itemIdx) => {
                            const attraction = getAttraction(item.attractionId)
                            const prevItem = itemIdx > 0 ? day.items[itemIdx - 1] : null
                            const prevAttraction = prevItem ? getAttraction(prevItem.attractionId) : null
                            const fromLat = prevAttraction?.lat ?? day.hotel?.lat
                            const fromLng = prevAttraction?.lng ?? day.hotel?.lng

                            return (
                              <div key={item.id}>
                                {/* Transport segment */}
                                {attraction && fromLat != null && fromLng != null && (
                                  <div className="ml-6 sm:ml-8">
                                    <TransportSegmentCard
                                      fromLat={fromLat}
                                      fromLng={fromLng}
                                      toLat={attraction.lat}
                                      toLng={attraction.lng}
                                      cityId={trip.cityId}
                                    />
                                  </div>
                                )}

                                {/* POI card */}
                                <div
                                  className={`flex items-start gap-2.5 rounded-xl p-2.5 sm:gap-3 sm:p-3 transition-smooth cursor-pointer ${
                                    item.isAutoFilled
                                      ? item.type === 'food'
                                        ? 'bg-gradient-to-r from-amber-50/60 to-orange-50/60 hover:from-amber-50/80 hover:to-orange-50/80 border border-amber-200/60'
                                        : 'bg-gradient-to-r from-violet-50/50 to-indigo-50/50 hover:from-violet-50/70 hover:to-indigo-50/70 border border-violet-200/60'
                                      : 'hover:bg-secondary/50'
                                  }`}
                                  onClick={() => attraction && openDetail(attraction.id)}
                                >
                                  <span className="mt-1 text-[10px] font-medium text-muted-foreground w-10 sm:text-xs sm:w-12 shrink-0">
                                    {item.startTime}
                                  </span>
                                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg sm:h-12 sm:w-12">
                                    {attraction && (
                                      <img
                                        src={attraction.image}
                                        alt={displayName(attraction)}
                                        className="h-full w-full object-cover"
                                      />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                      <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold sm:text-[9px] ${typeBadgeClass(item.type)}`}>
                                        {getAttractionTypeLabel(item.type)}
                                      </span>
                                      <span className="text-xs font-semibold text-foreground truncate sm:text-sm">
                                        {displayName(attraction)}
                                      </span>
                                      {/* Seasonal index */}
                                      {attraction?.seasonalIndex && attraction.seasonalIndex > 0 && (
                                        <SeasonalBadge value={attraction.seasonalIndex} />
                                      )}
                                      {item.isAutoFilled && (
                                        <span className="flex items-center gap-0.5 rounded-full bg-violet-100 text-violet-700 px-1.5 py-0.5 text-[9px] font-medium">
                                          <Sparkles className="h-2.5 w-2.5" />
                                          AI
                                        </span>
                                      )}
                                    </div>
                                    {/* Recommend reason */}
                                    {attraction?.recommendReason && (
                                      <div className="mt-1 flex items-start gap-1">
                                        <Sparkles className="h-2.5 w-2.5 text-primary shrink-0 mt-0.5" />
                                        <p className="text-[10px] text-primary/70 line-clamp-1 sm:text-[11px]">
                                          {attraction.recommendReason}
                                        </p>
                                      </div>
                                    )}
                                    {item.notes && (
                                      <p className="mt-0.5 text-[10px] text-muted-foreground truncate sm:text-xs">
                                        📝 {item.notes}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                                    <span className="text-[10px] font-semibold text-primary sm:text-xs">
                                      {item.cost > 0 ? `¥${item.cost}` : '免费'}
                                    </span>
                                    <span className="text-[9px] text-muted-foreground">
                                      {item.startTime}-{item.endTime}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="px-4 py-6 text-center text-xs text-muted-foreground sm:px-6 sm:py-8 sm:text-sm">
                          暂无行程安排
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* Journal entry card for saved trips */}
        {isSavedTrip && (
          <div className="mt-8 sm:mt-10">
            <button
              onClick={() => dispatch({ type: 'SET_VIEW', payload: 'journal' })}
              className="w-full rounded-2xl border border-journal/20 gradient-note-card p-4 shadow-note transition-all duration-300 hover:shadow-note-hover hover:border-journal/40 sm:p-5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-journal text-primary-foreground sm:h-12 sm:w-12">
                  <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-foreground sm:text-base">旅行游记</p>
                  <p className="text-[11px] text-muted-foreground sm:text-xs">
                    查看或编辑在各景点记录的微游记
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </button>
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
            继续编辑行程
          </Button>
          {isSavedTrip && (
            <Button
              variant="coral"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => dispatch({ type: 'SET_VIEW', payload: 'profile' })}
            >
              返回我的行程
            </Button>
          )}
        </div>
      </main>
    </div>
  )
}
