import { displayName } from '@/utils/poiName'
import { useApp } from '@/context/AppContext'
import { Attraction } from '@/types'
import { getAllAttractions, getAttractionTypeLabel, getAttractionTypeIcon } from '@/data/mock-data'
import { useState, useMemo } from 'react'
import { Search, Star, Clock, MapPin, Plus, X, Check, Flame, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AttractionsPanelProps {
  onClose: () => void
}

function SeasonalBadge({ value }: { value: number }) {
  if (!value || value <= 0) return null
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
      <Flame className="h-2.5 w-2.5 text-amber-500" />
      {value.toFixed(1)}
    </span>
  )
}

export default function AttractionsPanel({ onClose }: AttractionsPanelProps) {
  const { state, dispatch } = useApp()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('all')

  // Use full dataset for the panel
  const attractions = useMemo(() => {
    if (!state.currentTrip) return []
    return getAllAttractions(state.currentTrip.cityId)
  }, [state.currentTrip])

  // Track which POIs are already in current day
  const usedAttractionIds = useMemo(() => {
    const day = state.currentTrip?.days[state.selectedDayIndex]
    if (!day) return new Set<string>()
    return new Set(day.items.map(item => item.attractionId))
  }, [state.currentTrip, state.selectedDayIndex])

  // Track which POIs are in ANY day
  const allUsedIds = useMemo(() => {
    if (!state.currentTrip) return new Set<string>()
    const ids = new Set<string>()
    for (const day of state.currentTrip.days) {
      for (const item of day.items) {
        ids.add(item.attractionId)
      }
    }
    return ids
  }, [state.currentTrip])

  const filtered = useMemo(() => {
    let list = attractions.filter(a => a.type !== 'hotel')
    if (filterType !== 'all') {
      list = list.filter((a) => a.type === filterType)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tags.some((t) => t.includes(q)) ||
          a.description.includes(q)
      )
    }
    // Sort: seasonal index descending, then not-added first, then rating
    list.sort((a, b) => {
      const aUsed = usedAttractionIds.has(a.id) ? 1 : 0
      const bUsed = usedAttractionIds.has(b.id) ? 1 : 0
      if (aUsed !== bUsed) return aUsed - bUsed
      const aSeason = a.seasonalIndex || 0
      const bSeason = b.seasonalIndex || 0
      if (bSeason !== aSeason) return bSeason - aSeason
      return b.rating - a.rating
    })
    return list
  }, [attractions, filterType, searchQuery, usedAttractionIds])

  const addToDay = (attraction: Attraction) => {
    const dayItems = state.currentTrip?.days[state.selectedDayIndex]?.items || []
    const lastItem = dayItems[dayItems.length - 1]
    let startHour = 9
    let startMin = 0
    if (lastItem) {
      const [h, m] = lastItem.endTime.split(':').map(Number)
      startHour = h
      startMin = m + 30
      if (startMin >= 60) {
        startHour += 1
        startMin -= 60
      }
    }
    const endMin = startMin + attraction.duration
    let endHour = startHour + Math.floor(endMin / 60)
    const finalMin = endMin % 60
    if (endHour > 23) endHour = 23

    const item = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      attractionId: attraction.id,
      startTime: `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`,
      endTime: `${String(endHour).padStart(2, '0')}:${String(finalMin).padStart(2, '0')}`,
      notes: '',
      cost: attraction.cost,
      type: attraction.type,
    }

    dispatch({
      type: 'ADD_ITEM',
      payload: { dayIndex: state.selectedDayIndex, item },
    })
  }

  const filterTypes = [
    { key: 'all', label: '全部' },
    { key: 'scenic', label: '景点' },
    { key: 'food', label: '美食' },
    { key: 'activity', label: '体验' },
    { key: 'shopping', label: '购物' },
  ]

  const typeBadgeClass = (type: string) => {
    switch (type) {
      case 'scenic': return 'badge-spot'
      case 'food': return 'badge-food'
      case 'hotel': return 'badge-hotel'
      default: return 'gradient-hero'
    }
  }

  const isAddedToCurrentDay = (id: string) => usedAttractionIds.has(id)
  const isAddedToAnyDay = (id: string) => allUsedIds.has(id)

  return (
    <div className="flex h-full flex-col bg-card border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="text-base font-semibold text-foreground">景点推荐</h3>
        <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary transition-smooth">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="p-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索景点..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-smooth"
          />
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1.5 overflow-x-auto px-4 pb-3">
        {filterTypes.map((ft) => (
          <button
            key={ft.key}
            onClick={() => setFilterType(ft.key)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-smooth ${
              filterType === ft.key
                ? 'gradient-hero text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {ft.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {filtered.map((attraction) => {
          const addedCurrent = isAddedToCurrentDay(attraction.id)
          const addedOther = !addedCurrent && isAddedToAnyDay(attraction.id)

          return (
            <div
              key={attraction.id}
              className={`group overflow-hidden rounded-xl border transition-all duration-300 ${
                addedCurrent
                  ? 'border-primary/30 bg-primary/5 opacity-75'
                  : addedOther
                    ? 'border-amber-200 bg-amber-50/30'
                    : 'border-border bg-card hover:shadow-card-hover'
              }`}
            >
              <div className="relative h-32 overflow-hidden">
                <img
                  src={attraction.image}
                  alt={displayName(attraction)}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                {/* Status overlay */}
                {addedCurrent && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <span className="flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs font-bold shadow-lg">
                      <Check className="h-3 w-3" /> 已添加
                    </span>
                  </div>
                )}
                {addedOther && (
                  <div className="absolute inset-0 bg-amber-500/10 flex items-center justify-center">
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-[10px] font-bold shadow-lg">
                      已在其他日
                    </span>
                  </div>
                )}
                <div className="absolute left-2 top-2 flex items-center gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-primary-foreground ${typeBadgeClass(attraction.type)}`}>
                    {getAttractionTypeLabel(attraction.type)}
                  </span>
                  {/* Seasonal index badge */}
                  {attraction.seasonalIndex && attraction.seasonalIndex > 0 && (
                    <SeasonalBadge value={attraction.seasonalIndex} />
                  )}
                </div>
                <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full glass px-2 py-0.5">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  <span className="text-[10px] font-semibold text-foreground">{attraction.rating}</span>
                </div>
              </div>
              <div className="p-3">
                <h4 className="mb-1 text-sm font-semibold text-foreground">{displayName(attraction)}</h4>

                {/* Recommend reason */}
                {attraction.recommendReason && (
                  <div className="mb-2 flex items-start gap-1.5">
                    <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                    <p className="text-[10px] text-primary/80 leading-relaxed line-clamp-2">
                      {attraction.recommendReason}
                    </p>
                  </div>
                )}

                <p className="mb-2 text-xs text-muted-foreground line-clamp-2">{attraction.description}</p>
                <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {attraction.duration > 0 && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {attraction.duration >= 60
                        ? `${Math.floor(attraction.duration / 60)}h${attraction.duration % 60 > 0 ? `${attraction.duration % 60}m` : ''}`
                        : `${attraction.duration}m`}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {attraction.address.length > 15
                      ? attraction.address.slice(0, 15) + '...'
                      : attraction.address}
                  </span>
                  {attraction.cost > 0 && (
                    <span className="font-semibold text-primary">¥{attraction.cost}</span>
                  )}
                  {attraction.cost === 0 && (
                    <span className="font-semibold text-emerald-600">免费</span>
                  )}
                </div>
                <Button
                  variant={addedCurrent ? 'outline' : 'warm'}
                  size="sm"
                  className="w-full"
                  disabled={addedCurrent}
                  onClick={() => addToDay(attraction)}
                >
                  {addedCurrent ? (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" />
                      已在第 {state.selectedDayIndex + 1} 天
                    </>
                  ) : (
                    <>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      添加到第 {state.selectedDayIndex + 1} 天
                    </>
                  )}
                </Button>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="py-10 text-center">
            <MapPin className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">暂无匹配的景点</p>
          </div>
        )}
      </div>
    </div>
  )
}
