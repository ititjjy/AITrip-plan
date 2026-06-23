import { View, Text, Input, ScrollView, Image, Picker, Map } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useMemo, useCallback } from 'react'
import { allDestinations } from '../../data/destinations'
import { getState, setState, generateDays, getPoiById } from '../../store'
import { api } from '../../services/api'
import { generateItinerary } from '../../utils/routePlanner'
import type { Trip, Attraction, HotelPOI } from '../../types'
import './index.css'

const TOTAL_STEPS = 7
const STEP_LABELS = ['目的地', '日期', '住宿', '景点', '路线', '预览', '保存']
const STEP_ICONS = ['✈️', '📅', '🏨', '📍', '🗺️', '👁️', '💾']
const MAX_DAYS = 30

const QUICK_DURATIONS = [
  { label: '短途', days: 3, emoji: '⚡' },
  { label: '小长假', days: 5, emoji: '🌿' },
  { label: '深度游', days: 7, emoji: '🗺️' },
  { label: '长假', days: 14, emoji: '✈️' },
]

const typeEmoji: Record<string, string> = { scenic: '🏛️', food: '🍜', shopping: '🛍️', activity: '🎯', hotel: '🏨', transport: '🚗' }
const typeLabel: Record<string, string> = { scenic: '景点', food: '餐饮', shopping: '购物', activity: '娱乐', hotel: '住宿', transport: '交通' }

function toDateStr(d: Date) { return d.toISOString().split('T')[0] }
function addDays(s: string, n: number) { const d = new Date(s); d.setDate(d.getDate() + n); return toDateStr(d) }
function diffDays(a: string, b: string) { return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1 }
function formatDate(s: string) { if (!s) return ''; const d = new Date(s); return `${d.getMonth() + 1}月${d.getDate()}日` }

// 交通估算（小程序内联版）
function estimateTransport(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(toLat - fromLat), dLng = toRad(toLng - fromLng)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng/2)**2
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  if (dist < 0.8) return { emoji: '🚶', label: '步行', time: Math.max(5, Math.round(dist / 4.5 * 60)) + '分钟', cost: '' }
  if (dist < 5) return { emoji: '🚇', label: '地铁/公交', time: Math.round(dist / 20 * 60 + 8) + '分钟', cost: '¥5' }
  return { emoji: '🚕', label: '打车', time: Math.round(dist / 30 * 60 + 5) + '分钟', cost: '¥' + Math.round(5 + dist * 4) }
}

export default function CreateTripPage() {
  const [step, setStep] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null)

  Taro.useDidShow(() => {
    const preId = getState().preSelectedCityId
    if (preId) { setSelectedCityId(preId); setStep(2); setState({ preSelectedCityId: undefined }) }
  })

  const tomorrow = useMemo(() => addDays(toDateStr(new Date()), 1), [])
  const [startDate, setStartDate] = useState(tomorrow)
  const [endDate, setEndDate] = useState(tomorrow)
  const [selectedDays, setSelectedDays] = useState(1)
  const [hotels, setHotels] = useState<HotelPOI[]>([])
  const [selectedHotel, setSelectedHotel] = useState<HotelPOI | null>(null)
  const [pois, setPois] = useState<Attraction[]>([])
  const [selectedPoiIds, setSelectedPoiIds] = useState<Set<string>>(new Set())
  const [loadingStep, setLoadingStep] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [trip, setTrip] = useState<Trip | null>(null)
  // 步骤5 POI溢出确认
  const [pendingSkippedPOIs, setPendingSkippedPOIs] = useState<Attraction[]>([])
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [pendingTripResult, setPendingTripResult] = useState<{ newTrip: Trip; skipped: Attraction[] } | null>(null)
  // 必打卡标记
  const [mustVisitIds, setMustVisitIds] = useState<Set<string>>(new Set())
  // 延长天数输入
  const [extraDaysInput, setExtraDaysInput] = useState('')
  // 剔除确认弹窗
  const [removeConfirmPoi, setRemoveConfirmPoi] = useState<Attraction | null>(null)
  // 步骤6 预览行程专用状态
  const [previewMode, setPreviewMode] = useState<'overview' | 'day'>('overview')
  const [previewDayIdx, setPreviewDayIdx] = useState(0)
  const [previewMapMode, setPreviewMapMode] = useState(false)
  // 酒店选择增强状态
  const [perDayMode, setPerDayMode] = useState(false)
  const [selectedHotelPerDay, setSelectedHotelPerDay] = useState<Record<number, HotelPOI | null>>({})
  const [currentDayTab, setCurrentDayTab] = useState(0)
  const [hotelSearch, setHotelSearch] = useState('')
  const [filterStars, setFilterStars] = useState<number | null>(null)
  const [filterPriceRange, setFilterPriceRange] = useState<string>('all')
  const [filterArea, setFilterArea] = useState<string>('all')
  const [showFilter, setShowFilter] = useState(false)
  const [sortBy, setSortBy] = useState<'default' | 'price_asc' | 'rating_desc'>('default')
  const [hotelViewMode, setHotelViewMode] = useState<'list' | 'map'>('list')
  const [mapSelectedHotel, setMapSelectedHotel] = useState<HotelPOI | null>(null)
  const [hotelDetailItem, setHotelDetailItem] = useState<HotelPOI | null>(null)
  // 步骤4 POI选择增强状态
  const [poiCategoryTab, setPoiCategoryTab] = useState<string>('scenic')
  const [poiSearch, setPoiSearch] = useState('')
  const [poiSortBy, setPoiSortBy] = useState<'default' | 'seasonal' | 'rating' | 'duration'>('default')
  const [poiViewMode, setPoiViewMode] = useState<'list' | 'map'>('list')
  const [showPoiFilter, setShowPoiFilter] = useState(false)
  const [poiDetailItem, setPoiDetailItem] = useState<Attraction | null>(null)
  const [showPoiCart, setShowPoiCart] = useState(false)
  const [filterPoiTags, setFilterPoiTags] = useState<string[]>([])
  const [filterPoiRating, setFilterPoiRating] = useState<number | null>(null)
  const [filterPoiDuration, setFilterPoiDuration] = useState<string>('all')
  const [filterPoiCost, setFilterPoiCost] = useState<string>('all')
  const [poiMapSelected, setPoiMapSelected] = useState<Attraction | null>(null)
  const [filterPoiOpenTime, setFilterPoiOpenTime] = useState<string>('all')

  // ── 计算值 ──
  const dayCount = useMemo(() => { const d = diffDays(startDate, endDate); return d > 0 ? d : 0 }, [startDate, endDate])
  const isDateValid = dayCount >= 1 && dayCount <= MAX_DAYS
  const selectedCity = allDestinations.find(c => c.id === selectedCityId)
  const filteredCities = useMemo(() => {
    if (!searchQuery.trim()) return allDestinations
    const q = searchQuery.toLowerCase()
    return allDestinations.filter(c => c.name.toLowerCase().includes(q) || (c.nameEn || '').toLowerCase().includes(q) || (c.country || '').toLowerCase().includes(q))
  }, [searchQuery])

  const hotelAreas = useMemo(() => {
    const set = new Set<string>()
    hotels.forEach(h => {
      const addr = h.address || ''
      const dm = addr.match(/[^市省]+?[区县]/)
      if (dm) { set.add(dm[0]); return }
      const part = addr.split(/[,，\s]/)[0]?.trim().slice(0, 6)
      if (part) set.add(part)
    })
    return Array.from(set).slice(0, 8)
  }, [hotels])

  const filteredHotels = useMemo(() => {
    let list = hotels.filter(h => {
      if (hotelSearch && !h.name.includes(hotelSearch)) return false
      if (filterStars && h.stars !== filterStars) return false
      if (filterPriceRange !== 'all') {
        const price = h.priceRange ? h.priceRange[0] : 0
        if (filterPriceRange === 'budget' && price >= 300) return false
        if (filterPriceRange === 'mid' && (price < 300 || price >= 800)) return false
        if (filterPriceRange === 'luxury' && price < 800) return false
      }
      if (filterArea !== 'all') {
        const addr = h.address || ''
        const dm = addr.match(/[^市省]+?[区县]/)
        const area = dm ? dm[0] : addr.split(/[,，\s]/)[0]?.trim().slice(0, 6)
        if (!area || !area.includes(filterArea)) return false
      }
      return true
    })
    if (sortBy === 'price_asc') list = [...list].sort((a, b) => (a.priceRange?.[0] || 0) - (b.priceRange?.[0] || 0))
    if (sortBy === 'rating_desc') list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0))
    return list
  }, [hotels, hotelSearch, filterStars, filterPriceRange, filterArea, sortBy])

  const POI_CATEGORIES_CONFIG = useMemo(() => [
    { id: 'scenic', label: '景点', emoji: '🏛️' },
    { id: 'food', label: '餐饮', emoji: '🍜' },
    { id: 'shopping', label: '购物', emoji: '🛍️' },
    { id: 'activity', label: '娱乐', emoji: '🎯' },
  ], [])

  const poisByCategory = useMemo(() => {
    let list = pois.filter(p => p.type === poiCategoryTab)
    if (poiSearch.trim()) {
      const q = poiSearch.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.nameEn || '').toLowerCase().includes(q) || p.tags?.some(t => t.toLowerCase().includes(q)))
    }
    if (filterPoiRating) list = list.filter(p => p.rating >= filterPoiRating)
    if (filterPoiDuration !== 'all') {
      if (filterPoiDuration === 'short') list = list.filter(p => p.duration <= 60)
      if (filterPoiDuration === 'mid') list = list.filter(p => p.duration > 60 && p.duration <= 120)
      if (filterPoiDuration === 'long') list = list.filter(p => p.duration > 120)
    }
    if (filterPoiCost !== 'all') {
      if (filterPoiCost === 'free') list = list.filter(p => p.cost === 0)
      if (filterPoiCost === 'cheap') list = list.filter(p => p.cost > 0 && p.cost <= 50)
      if (filterPoiCost === 'mid') list = list.filter(p => p.cost > 50 && p.cost <= 200)
      if (filterPoiCost === 'expensive') list = list.filter(p => p.cost > 200)
    }
    if (filterPoiTags.length > 0) list = list.filter(p => filterPoiTags.every(t => p.tags?.includes(t)))
    if (poiSortBy === 'seasonal') list = [...list].sort((a, b) => (b.seasonalIndex || 0) - (a.seasonalIndex || 0))
    else if (poiSortBy === 'rating') list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0))
    else if (poiSortBy === 'duration') list = [...list].sort((a, b) => (b.duration || 0) - (a.duration || 0))
    return list.slice(0, 50)
  }, [pois, poiCategoryTab, poiSearch, filterPoiRating, filterPoiDuration, filterPoiCost, filterPoiTags, poiSortBy])

  const poiCategoryTags = useMemo(() => {
    const catPois = pois.filter(p => p.type === poiCategoryTab)
    const freq: Record<string, number> = {}
    catPois.forEach(p => (p.tags || []).forEach(t => { freq[t] = (freq[t] || 0) + 1 }))
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t)
  }, [pois, poiCategoryTab])

  const activePoiFilterCount = useMemo(() => {
    let n = 0
    if (filterPoiRating) n++
    if (filterPoiDuration !== 'all') n++
    if (filterPoiCost !== 'all') n++
    if (filterPoiTags.length > 0) n++
    return n
  }, [filterPoiRating, filterPoiDuration, filterPoiCost, filterPoiTags])

  const poiMapCenter = useMemo(() => {
    const catPois = pois.filter(p => p.type === poiCategoryTab && p.lat && p.lng)
    if (catPois.length === 0) return { lat: 35.6762, lng: 139.6503 }
    return { lat: catPois.reduce((s, p) => s + p.lat, 0) / catPois.length, lng: catPois.reduce((s, p) => s + p.lng, 0) / catPois.length }
  }, [pois, poiCategoryTab])

  const selectedPoisList = useMemo(() => pois.filter(p => selectedPoiIds.has(p.id)), [pois, selectedPoiIds])
  const resetPoiFilters = () => { setFilterPoiTags([]); setFilterPoiRating(null); setFilterPoiDuration('all'); setFilterPoiCost('all') }

  // ── canNext ──
  const canNext = useMemo(() => {
    switch (step) {
      case 1: return !!selectedCityId
      case 2: return isDateValid
      case 3: return true
      case 4: return selectedPoiIds.size > 0
      case 5: return !!trip
      case 6: return !!trip
      case 7: return !!trip
      default: return false
    }
  }, [step, selectedCityId, isDateValid, selectedPoiIds, trip])

  // ── handleNext ──
  const handleNext = useCallback(() => {
    if (!canNext) return
    const nextStep = step + 1
    if (nextStep > TOTAL_STEPS) return
    setStep(nextStep)
    if (nextStep === 3 && selectedCity && isDateValid) {
      const newTrip: Trip = {
        id: `trip-${Date.now()}`, cityId: selectedCity.id, cityName: selectedCity.name,
        startDate, endDate, days: generateDays(startDate, endDate), totalBudget: 0, createdAt: new Date().toISOString(),
      }
      setTrip(newTrip)
      setState({ currentTrip: newTrip, selectedDayIndex: 0, skippedPOIs: [] })
      loadHotels(selectedCity.id, selectedCity.name, selectedCity.nameEn)
    }
    if (nextStep === 4 && trip) {
      const updatedDays = trip.days.map((day, idx) => ({ ...day, hotel: perDayMode ? (selectedHotelPerDay[idx] || null) : (selectedHotel || null) }))
      const updatedTrip = { ...trip, days: updatedDays }
      setTrip(updatedTrip)
      setState({ currentTrip: updatedTrip })
    }
    if (nextStep === 4 && selectedCity) loadPOIs(selectedCity.id, selectedCity.name, selectedCity.nameEn)
    if (nextStep === 5) {
      // 步骤4→5：先把最新的酒店信息写入 trip 再生成路线
      // 注意：此处 trip state 已在上一个 nextStep===4 分支中被 setTrip 更新，
      // 但由于 React 批量更新机制，这里的 trip 仍是旧值。
      // 因此需要重新构建带酒店信息的 trip 并直接传给 doGenerateRoute。
      if (trip) {
        const updatedDays = trip.days.map((day, idx) => ({ ...day, hotel: perDayMode ? (selectedHotelPerDay[idx] || null) : (selectedHotel || null) }))
        const latestTrip = { ...trip, days: updatedDays }
        doGenerateRoute(undefined, latestTrip)
      } else {
        doGenerateRoute()
      }
    }
  }, [step, canNext, selectedCity, isDateValid, startDate, endDate, selectedPoiIds, trip, perDayMode, selectedHotel, selectedHotelPerDay])

  const handlePrev = () => {
    if (step === 6) {
      // 行程预览页返回，应回到步骤4（选择POI），跳过步骤5（路线规划中间态）
      setStep(4)
    } else if (step > 1) {
      setStep(step - 1)
    }
  }

  const loadHotels = async (cityId: string, cityName: string, nameEn: string) => {
    setLoadingStep(true)
    try {
      const res = await api.getHotels(cityId, cityName, nameEn)
      if (res.success && res.data) setHotels(res.data)
    } catch (e: any) {
      console.error('[loadHotels]', e?.message || e)
    }
    setLoadingStep(false)
  }

  const loadPOIs = async (cityId: string, cityName: string, nameEn: string) => {
    setLoadingStep(true)
    try {
      console.log(`[loadPOIs] 请求城市: cityId=${cityId}, cityName=${cityName}, nameEn=${nameEn}`)
      const res = await api.getPOIs(cityId, cityName, nameEn)
      console.log(`[loadPOIs] 响应: success=${res.success}, dataLength=${res.data?.length ?? 'undefined'}, fromCache=${res.fromCache}, generating=${res.generating}`)
      if (res.success && res.data) {
        const attrs: Attraction[] = res.data.map((p: any) => ({
          id: p.id,
          name: p.nameZh || p.name || p.namePrimary || '',
          nameLocal: p.nameLocal || p.name || '',
          nameEn: p.nameEn || '',
          nameZh: p.nameZh || p.name || '',
          type: p.type || 'scenic', image: p.image || p.photo || '',
          rating: p.rating || 4.0, duration: p.duration || p.visitDuration || 60,
          cost: p.cost || p.entranceFee || 0, description: p.description || '',
          address: p.address || '', lat: p.lat || p.latitude || 0, lng: p.lng || p.longitude || 0,
          tags: p.tags || [],
          openTime: String(p.openTime || p.openingHours || '09:00'),
          closeTime: String(p.closeTime || p.closingHours || '22:00'),
          mealType: p.mealType,
          recommendReason: p.recommendReason || p.reason || '',
          seasonalIndex: p.seasonalIndex || p.seasonScore || undefined,
        }))
        setPois(attrs)
        const map: Record<string, Attraction> = { ...getState().poiMap }
        for (const a of attrs) map[a.id] = a
        setState({ poiMap: map })
      }
    } catch (e: any) {
      console.error('[loadPOIs]', e?.message || e)
    }
    setLoadingStep(false)
  }

  const doGenerateRoute = (overrideIds?: Set<string>, tripOverride?: Trip, overrideMustVisit?: Set<string>) => {
    const idsToUse = overrideIds || selectedPoiIds
    const tripToUse = tripOverride || trip
    const mustIds = overrideMustVisit !== undefined ? overrideMustVisit : mustVisitIds
    if (!tripToUse || idsToUse.size === 0) return
    setGenerating(true)
    setShowSkipConfirm(false)
    setTimeout(() => {
      try {
        const selected = pois.filter(p => idsToUse.has(p.id))
        const result = generateItinerary(tripToUse, selected, pois, mustIds)
        const skipped = result.skippedPOIs || []
        const newTrip = {
          ...tripToUse,
          days: tripToUse.days.map((day, i) => ({ ...day, items: result.dayItems[i] || [] })),
          totalBudget: result.dayItems.flat().reduce((s, item) => s + item.cost, 0),
        }
        setGenerating(false)
        if (skipped.length > 0) {
          setPendingSkippedPOIs(skipped)
          setPendingTripResult({ newTrip, skipped })
          setExtraDaysInput('')
          setShowSkipConfirm(true)
        } else {
          setTrip(newTrip)
          setState({ currentTrip: newTrip, skippedPOIs: [] })
          setTimeout(() => setStep(6), 600)
        }
      } catch {
        Taro.showToast({ title: '路线生成失败', icon: 'none' })
        setGenerating(false)
      }
    }, 100)
  }

  // 计算被跳过的 POI 至少需要几天才能安排
  const estimateExtraDaysNeeded = (skipped: Attraction[]): number => {
    const DAY_MINUTES = (22 - 8) * 60 * 0.7 // ~588分钟有效游玩时间
    const totalMin = skipped.reduce((s, p) => s + p.duration + 30, 0) // +30交通缓冲
    return Math.ceil(totalMin / DAY_MINUTES)
  }

  /**
   * 当所有 skippedPOI 都是必打卡时，计算建议剔除建议：
   * 从已安排的非必打卡景点中，按评分从低到高排序，找出最少数量的廉兼组合腹出足够时间。
   */
  const computeSuggestedRemovals = (): Attraction[] => {
    if (!pendingTripResult) return []
    const skippedMustIds = pendingSkippedPOIs.filter(p => mustVisitIds.has(p.id))
    if (skippedMustIds.length === 0) return []
    // 必打卡点共需多少时间
    const neededMin = skippedMustIds.reduce((s, p) => s + p.duration + 30, 0)
    // 已安排的非食品、非必打卡的景点（即可抬爱剔除的候选）
    const scheduledAttractionIds = new Set(
      pendingTripResult.newTrip.days.flatMap(d => d.items.map(i => i.attractionId))
    )
    const candidates = pois.filter(p =>
      scheduledAttractionIds.has(p.id) &&
      !mustVisitIds.has(p.id) &&
      p.type !== 'food'
    )
    // 按评分从低到高排序（评分相同则时长短的优先剔除）
    candidates.sort((a, b) => {
      if (Math.abs((a.rating || 0) - (b.rating || 0)) > 0.1) return (a.rating || 0) - (b.rating || 0)
      return a.duration - b.duration
    })
    // 贪心选取最少数量直到腾出足够时间
    const result: Attraction[] = []
    let freed = 0
    for (const c of candidates) {
      result.push(c)
      freed += c.duration + 30
      if (freed >= neededMin) break
    }
    return result
  }

  // 采纳延长天数：顺延 endDate 并重新规划
  const handleAcceptExtraDays = () => {
    const n = parseInt(extraDaysInput)
    if (!n || n < 1 || !trip) return
    const newEndDate = addDays(trip.endDate, n)
    const newDays = generateDays(trip.startDate, newEndDate, trip.days)
    const newTrip = { ...trip, endDate: newEndDate, days: newDays }
    setEndDate(newEndDate)
    setTrip(newTrip)
    doGenerateRoute(undefined, newTrip)
  }

  // 必打卡切换
  const handleToggleMustVisit = (poiId: string) => {
    const next = new Set(mustVisitIds)
    if (next.has(poiId)) next.delete(poiId)
    else next.add(poiId)
    setMustVisitIds(next)
    // 立即重新规划，传入新的 mustVisitIds
    doGenerateRoute(undefined, undefined, next)
  }

  // 剔除确认：将该 POI 从 selectedPoiIds 移除并重新规划
  const handleConfirmRemovePoi = () => {
    if (!removeConfirmPoi) return
    const newIds = new Set(selectedPoiIds)
    newIds.delete(removeConfirmPoi.id)
    const newMust = new Set(mustVisitIds)
    newMust.delete(removeConfirmPoi.id)
    setSelectedPoiIds(newIds)
    setMustVisitIds(newMust)
    setRemoveConfirmPoi(null)
    doGenerateRoute(newIds, undefined, newMust)
  }

  const handleConfirmSkip = () => {
    if (!pendingTripResult) return
    const { newTrip, skipped } = pendingTripResult
    setTrip(newTrip); setState({ currentTrip: newTrip, skippedPOIs: skipped })
    setPendingTripResult(null); setShowSkipConfirm(false)
    setTimeout(() => setStep(6), 300)
  }

  const handleGoBackToAdjust = () => {
    setPendingTripResult(null); setShowSkipConfirm(false); setPendingSkippedPOIs([]); setStep(4)
  }

  const handleSave = async () => {
    if (!trip) return
    setSaving(true)
    try {
      const res = await api.createTrip({ tripData: trip, title: `${trip.cityName}自由行`, coverImage: '' })
      if (res.success) {
        Taro.showToast({ title: '行程已保存', icon: 'success' })
        setTimeout(() => Taro.switchTab({ url: '/pages/my-trips/index' }), 1500)
      } else {
        Taro.showToast({ title: '保存失败', icon: 'none' })
      }
    } catch {
      Taro.showToast({ title: '保存失败', icon: 'none' })
    }
    setSaving(false)
  }

  return (
    <View className='create-trip-page'>
      {/* ── 顶部步骤进度 ── */}
      <View className='step-header'>
        <View className='step-indicator'>
          {STEP_LABELS.map((_, i) => (
            <View key={i} className={`step-dot ${i + 1 === step ? 'step-dot-active' : i + 1 < step ? 'step-dot-done' : ''}`} />
          ))}
        </View>
        <Text style='font-size: 26rpx; color: #7A7068;'>{STEP_ICONS[step - 1]} 第{['一','二','三','四','五','六','七'][step-1]}步：{STEP_LABELS[step - 1]}</Text>
        <Text style='font-size: 26rpx; color: #C0B8B0;'>{step}/{TOTAL_STEPS}</Text>
      </View>

      <View className='step-body'>

        {/* ══════════════════ 步骤1：选目的地 ══════════════════ */}
        {step === 1 && (
          <View style='padding: 32rpx;'>
            <Text style='font-size: 40rpx; font-weight: 700; color: #2D2420; display: block; margin-bottom: 8rpx;'>选择目的地</Text>
            <Text style='font-size: 26rpx; color: #7A7068; display: block; margin-bottom: 32rpx;'>选一个你想探索的地方吧 ✈️</Text>
            <View style='background: #fff; border-radius: 20rpx; border: 1rpx solid #E7E0D8; padding: 20rpx 24rpx; display: flex; align-items: center; gap: 16rpx; margin-bottom: 32rpx;'>
              <Text style='font-size: 28rpx; color: #C0B8B0;'>🔍</Text>
              <Input
                style='flex: 1; font-size: 28rpx; color: #2D2420;'
                placeholder='搜索城市、国家...'
                placeholderStyle='color: #C0B8B0;'
                value={searchQuery}
                onInput={e => setSearchQuery(e.detail.value)}
              />
            </View>
            <ScrollView scrollY style='height: calc(100vh - 360rpx);'>
              <View style='display: flex; flex-wrap: wrap; gap: 20rpx;'>
                {filteredCities.map(city => (
                  <View
                    key={city.id}
                    onClick={() => setSelectedCityId(city.id)}
                    style={`width: calc(50% - 10rpx); border-radius: 20rpx; overflow: hidden; border: 2rpx solid ${selectedCityId === city.id ? '#E8735A' : '#E7E0D8'}; background: #fff; box-shadow: ${selectedCityId === city.id ? '0 4rpx 20rpx rgba(232,115,90,0.2)' : 'none'};`}
                  >
                    <View style='height: 160rpx; background: linear-gradient(135deg, #E8735A20, #E8735A10); display: flex; align-items: center; justify-content: center; font-size: 64rpx;'>
                      {city.tags?.[0] === '海岛' ? '🏝️' : city.isDomestic ? '🇨🇳' : '🌍'}
                    </View>
                    <View style='padding: 16rpx 20rpx;'>
                      <Text style='font-size: 28rpx; font-weight: 600; color: #2D2420; display: block;'>{city.name}</Text>
                      <Text style='font-size: 22rpx; color: #7A7068; display: block;'>{city.country || city.province}</Text>
                    </View>
                    {selectedCityId === city.id && (
                      <View style='position: absolute; top: 12rpx; right: 12rpx; background: #E8735A; border-radius: 50%; width: 32rpx; height: 32rpx; display: flex; align-items: center; justify-content: center;'>
                        <Text style='color: #fff; font-size: 20rpx;'>✓</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* ══════════════════ 步骤2：选日期 ══════════════════ */}
        {step === 2 && (
          <View style='padding: 32rpx;'>
            <Text style='font-size: 40rpx; font-weight: 700; color: #2D2420; display: block; margin-bottom: 8rpx;'>选择出行日期</Text>
            <Text style='font-size: 26rpx; color: #7A7068; display: block; margin-bottom: 32rpx;'>确定你的出行时间 📅</Text>
            <View style='display: flex; gap: 16rpx; margin-bottom: 24rpx;'>
              {QUICK_DURATIONS.map(qd => (
                <View
                  key={qd.days}
                  onClick={() => { setEndDate(addDays(startDate, qd.days - 1)); setSelectedDays(qd.days) }}
                  style={`flex: 1; background: ${selectedDays === qd.days ? '#E8735A' : '#fff'}; border: 1rpx solid ${selectedDays === qd.days ? '#E8735A' : '#E7E0D8'}; border-radius: 16rpx; padding: 16rpx 8rpx; text-align: center;`}
                >
                  <Text style='font-size: 28rpx; display: block;'>{qd.emoji}</Text>
                  <Text style={`font-size: 22rpx; font-weight: 600; display: block; color: ${selectedDays === qd.days ? '#fff' : '#2D2420'};`}>{qd.label}</Text>
                  <Text style={`font-size: 20rpx; display: block; color: ${selectedDays === qd.days ? '#fff' : '#7A7068'};`}>{qd.days}天</Text>
                </View>
              ))}
            </View>
            <View style='background: #fff; border-radius: 20rpx; border: 1rpx solid #E7E0D8; overflow: hidden; margin-bottom: 24rpx;'>
              <Picker mode='date' value={startDate} start={toDateStr(new Date())} onChange={e => { setStartDate(e.detail.value as string); setEndDate(e.detail.value as string); setSelectedDays(1) }}>
                <View style='padding: 28rpx 32rpx; display: flex; justify-content: space-between; align-items: center; border-bottom: 1rpx solid #F5F0EB;'>
                  <View>
                    <Text style='font-size: 24rpx; color: #7A7068; display: block;'>出发日期</Text>
                    <Text style='font-size: 32rpx; font-weight: 600; color: #2D2420; display: block; margin-top: 4rpx;'>{formatDate(startDate)}</Text>
                  </View>
                  <Text style='font-size: 24rpx; color: #E8735A;'>修改 ›</Text>
                </View>
              </Picker>
              <Picker mode='date' value={endDate} start={startDate} onChange={e => { setEndDate(e.detail.value as string); setSelectedDays(diffDays(startDate, e.detail.value as string)) }}>
                <View style='padding: 28rpx 32rpx; display: flex; justify-content: space-between; align-items: center;'>
                  <View>
                    <Text style='font-size: 24rpx; color: #7A7068; display: block;'>返回日期</Text>
                    <Text style='font-size: 32rpx; font-weight: 600; color: #2D2420; display: block; margin-top: 4rpx;'>{formatDate(endDate)}</Text>
                  </View>
                  <Text style='font-size: 24rpx; color: #E8735A;'>修改 ›</Text>
                </View>
              </Picker>
            </View>
            {isDateValid && (
              <View style='background: linear-gradient(135deg, #E8735A10, #E8735A05); border-radius: 16rpx; padding: 24rpx; text-align: center;'>
                <Text style='font-size: 48rpx; font-weight: 700; color: #E8735A;'>{dayCount}</Text>
                <Text style='font-size: 28rpx; color: #7A7068;'> 天行程</Text>
              </View>
            )}
          </View>
        )}

        {/* ══════════════════ 步骤3：选住宿 ══════════════════ */}
        {step === 3 && (
          <View style='padding: 0;'>

            {/* ── 酒店详情底部弹窗 ── */}
            {hotelDetailItem && (
              <View style='position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.5); display: flex; align-items: flex-end;'>
                <View style='background: #fff; border-radius: 32rpx 32rpx 0 0; width: 100%; max-height: 85vh; display: flex; flex-direction: column;'>
                  {/* 弹窗头部 */}
                  <View style='padding: 32rpx 32rpx 0; display: flex; justify-content: space-between; align-items: flex-start; flex-shrink: 0;'>
                    <View style='flex: 1;'>
                      <Text style='font-size: 36rpx; font-weight: 700; color: #2D2420; display: block; margin-bottom: 4rpx;'>{hotelDetailItem.name}</Text>
                      {hotelDetailItem.stars && <Text style='font-size: 28rpx; color: #F5A623;'>{'★'.repeat(hotelDetailItem.stars)}</Text>}
                    </View>
                    <View onClick={() => setHotelDetailItem(null)} style='width: 56rpx; height: 56rpx; background: #F5F0EB; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-left: 16rpx;'>
                      <Text style='font-size: 28rpx; color: #7A7068;'>✕</Text>
                    </View>
                  </View>
                  <ScrollView scrollY style='flex: 1; overflow: hidden;'>
                    <View style='padding: 24rpx 32rpx calc(280rpx + env(safe-area-inset-bottom));'>
                      {/* 封面图片 */}
                      <View style='height: 300rpx; border-radius: 20rpx; overflow: hidden; margin-bottom: 24rpx; background: linear-gradient(135deg, #E8735A30, #E8735A10);'>
                        {hotelDetailItem.images?.[0] ? (
                          <Image src={hotelDetailItem.images[0]} style='width: 100%; height: 300rpx; display: block;' mode='aspectFill' />
                        ) : (
                          <View style='width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 80rpx;'><Text>🏨</Text></View>
                        )}
                      </View>
                      {/* 核心指标 */}
                      <View style='display: flex; gap: 16rpx; margin-bottom: 24rpx; flex-wrap: wrap;'>
                        <View style='background: #FFF8E7; border-radius: 16rpx; padding: 12rpx 20rpx; display: flex; align-items: center; gap: 8rpx;'>
                          <Text style='font-size: 24rpx; color: #F5A623;'>⭐</Text>
                          <Text style='font-size: 24rpx; color: #2D2420; font-weight: 600;'>{hotelDetailItem.rating?.toFixed(1) || '--'}</Text>
                          {hotelDetailItem.reviewCount && <Text style='font-size: 20rpx; color: #7A7068;'>{hotelDetailItem.reviewCount}条评价</Text>}
                        </View>
                        {hotelDetailItem.priceRange && (
                          <View style='background: #FFF0ED; border-radius: 16rpx; padding: 12rpx 20rpx;'>
                            <Text style='font-size: 26rpx; font-weight: 700; color: #E8735A;'>¥{hotelDetailItem.priceRange[0]}<Text style='font-size: 20rpx; color: #7A7068; font-weight: 400;'>/晚起</Text></Text>
                          </View>
                        )}
                        {hotelDetailItem.checkInTime && (
                          <View style='background: #F5F0EB; border-radius: 16rpx; padding: 12rpx 20rpx;'>
                            <Text style='font-size: 22rpx; color: #7A7068;'>入住 {hotelDetailItem.checkInTime}  退房 {hotelDetailItem.checkOutTime}</Text>
                          </View>
                        )}
                      </View>
                      {/* 地址 */}
                      <Text style='font-size: 26rpx; color: #4A4440; display: block; margin-bottom: 20rpx;'>📍 {hotelDetailItem.address}</Text>
                      {/* 描述 */}
                      {hotelDetailItem.description && (
                        <Text style='font-size: 26rpx; color: #4A4440; line-height: 1.6; display: block; margin-bottom: 24rpx;'>{hotelDetailItem.description}</Text>
                      )}
                      {/* 设施标签 */}
                      {hotelDetailItem.amenities && hotelDetailItem.amenities.length > 0 && (
                        <View style='margin-bottom: 24rpx;'>
                          <Text style='font-size: 26rpx; font-weight: 600; color: #2D2420; display: block; margin-bottom: 16rpx;'>酒店设施</Text>
                          <View style='display: flex; flex-wrap: wrap; gap: 12rpx;'>
                            {hotelDetailItem.amenities.map(a => (
                              <View key={a} style='background: #F5F0EB; border-radius: 16rpx; padding: 8rpx 20rpx;'>
                                <Text style='font-size: 22rpx; color: #7A7068;'>{a}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}
                      {/* 房型 */}
                      {hotelDetailItem.roomTypes && hotelDetailItem.roomTypes.length > 0 && (
                        <View style='margin-bottom: 24rpx;'>
                          <Text style='font-size: 26rpx; font-weight: 600; color: #2D2420; display: block; margin-bottom: 16rpx;'>可选房型</Text>
                          {hotelDetailItem.roomTypes.map(room => (
                            <View key={room.id} style='background: #F9F6F3; border-radius: 16rpx; padding: 20rpx; margin-bottom: 12rpx; display: flex; justify-content: space-between; align-items: center;'>
                              <View>
                                <Text style='font-size: 26rpx; font-weight: 600; color: #2D2420; display: block;'>{room.name}</Text>
                                <Text style='font-size: 22rpx; color: #7A7068;'>{room.bedType}  {room.area}㎡  {room.breakfast ? '含早' : '不含早'}</Text>
                              </View>
                              <Text style='font-size: 28rpx; font-weight: 700; color: #E8735A;'>¥{room.price}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {/* 选择按钮 */}
                      <View
                        onClick={() => {
                          if (perDayMode) {
                            const nd = { ...selectedHotelPerDay }
                            nd[currentDayTab] = selectedHotelPerDay[currentDayTab]?.id === hotelDetailItem.id ? null : hotelDetailItem
                            setSelectedHotelPerDay(nd)
                          } else {
                            setSelectedHotel(selectedHotel?.id === hotelDetailItem.id ? null : hotelDetailItem)
                          }
                          setHotelDetailItem(null)
                        }}
                        style={`padding: 32rpx; border-radius: 24rpx; text-align: center; background: ${(perDayMode ? selectedHotelPerDay[currentDayTab]?.id : selectedHotel?.id) === hotelDetailItem.id ? '#F5F0EB' : 'linear-gradient(135deg, #E8735A, #D4553D)'}; color: ${(perDayMode ? selectedHotelPerDay[currentDayTab]?.id : selectedHotel?.id) === hotelDetailItem.id ? '#7A7068' : '#fff'};`}
                      >
                        <Text style='font-size: 30rpx; font-weight: 700;'>{(perDayMode ? selectedHotelPerDay[currentDayTab]?.id : selectedHotel?.id) === hotelDetailItem.id ? '取消选择' : '✓ 选择此酒店'}</Text>
                      </View>
                    </View>
                  </ScrollView>
                </View>
              </View>
            )}

            {/* ── 顶部工具栏 ── */}
            <View style='padding: 24rpx 32rpx 16rpx;'>
              <Text style='font-size: 36rpx; font-weight: 700; color: #2D2420; display: block; margin-bottom: 4rpx;'>选择住宿</Text>
              <Text style='font-size: 24rpx; color: #7A7068; display: block; margin-bottom: 20rpx;'>可跳过，稍后再选 · 已选{perDayMode ? Object.values(selectedHotelPerDay).filter(Boolean).length : (selectedHotel ? 1 : 0)}家</Text>

              {/* 整体/按天切换 */}
              <View style='display: flex; background: #F5F0EB; border-radius: 16rpx; padding: 4rpx; margin-bottom: 16rpx;'>
                <View onClick={() => setPerDayMode(false)} style={`flex: 1; padding: 12rpx; border-radius: 12rpx; text-align: center; background: ${!perDayMode ? '#fff' : 'transparent'}; box-shadow: ${!perDayMode ? '0 2rpx 6rpx rgba(0,0,0,0.08)' : 'none'};`}>
                  <Text style={`font-size: 24rpx; font-weight: ${!perDayMode ? '600' : '400'}; color: ${!perDayMode ? '#E8735A' : '#7A7068'};`}>整行程统一住宿</Text>
                </View>
                <View onClick={() => setPerDayMode(true)} style={`flex: 1; padding: 12rpx; border-radius: 12rpx; text-align: center; background: ${perDayMode ? '#fff' : 'transparent'}; box-shadow: ${perDayMode ? '0 2rpx 6rpx rgba(0,0,0,0.08)' : 'none'};`}>
                  <Text style={`font-size: 24rpx; font-weight: ${perDayMode ? '600' : '400'}; color: ${perDayMode ? '#E8735A' : '#7A7068'};`}>按天分别选择</Text>
                </View>
              </View>

              {/* 按天Tab（perDayMode时显示） */}
              {perDayMode && trip && (
                <ScrollView scrollX style='margin-bottom: 16rpx;'>
                  <View style='display: flex; gap: 12rpx;'>
                    {trip.days.map((day, idx) => {
                      const sel = selectedHotelPerDay[idx]
                      return (
                        <View
                          key={day.id}
                          onClick={() => setCurrentDayTab(idx)}
                          style={`padding: 10rpx 24rpx; border-radius: 20rpx; white-space: nowrap; border: 1rpx solid ${currentDayTab === idx ? '#E8735A' : '#E7E0D8'}; background: ${currentDayTab === idx ? '#E8735A' : '#fff'};`}
                        >
                          <Text style={`font-size: 24rpx; color: ${currentDayTab === idx ? '#fff' : '#7A7068'};`}>第{day.dayNumber}天{sel ? ' ✓' : ''}</Text>
                        </View>
                      )
                    })}
                  </View>
                </ScrollView>
              )}

              {/* 搜索 */}
              <View style='display: flex; gap: 12rpx; margin-bottom: 12rpx;'>
                <View style='flex: 1; background: #fff; border-radius: 16rpx; border: 1rpx solid #E7E0D8; padding: 14rpx 20rpx; display: flex; align-items: center; gap: 12rpx;'>
                  <Text style='font-size: 24rpx; color: #C0B8B0;'>🔍</Text>
                  <Input style='flex: 1; font-size: 26rpx;' placeholder='搜索酒店名称、商圈...' placeholderStyle='color: #C0B8B0;' value={hotelSearch} onInput={e => setHotelSearch(e.detail.value)} />
                </View>
                <View onClick={() => setShowFilter(!showFilter)} style={`background: ${showFilter ? '#E8735A' : '#fff'}; border-radius: 16rpx; border: 1rpx solid ${showFilter ? '#E8735A' : '#E7E0D8'}; padding: 14rpx 24rpx; display: flex; align-items: center;`}>
                  <Text style={`font-size: 24rpx; font-weight: 500; color: ${showFilter ? '#fff' : '#7A7068'};`}>筛选</Text>
                </View>
                <View onClick={() => setHotelViewMode(hotelViewMode === 'list' ? 'map' : 'list')} style={`background: ${hotelViewMode === 'map' ? '#E8735A' : '#fff'}; border-radius: 16rpx; border: 1rpx solid ${hotelViewMode === 'map' ? '#E8735A' : '#E7E0D8'}; padding: 14rpx 24rpx; display: flex; align-items: center;`}>
                  <Text style={`font-size: 24rpx; color: ${hotelViewMode === 'map' ? '#fff' : '#7A7068'};`}>{hotelViewMode === 'map' ? '🗺️' : '📋'}</Text>
                </View>
              </View>

              {/* 筛选面板 */}
              {showFilter && (
                <View style='background: #fff; border-radius: 16rpx; border: 1rpx solid #E7E0D8; padding: 20rpx 24rpx; margin-bottom: 12rpx;'>
                  {/* 星级 */}
                  <Text style='font-size: 22rpx; color: #7A7068; display: block; margin-bottom: 10rpx;'>星级</Text>
                  <View style='display: flex; gap: 10rpx; margin-bottom: 16rpx; flex-wrap: wrap;'>
                    {[null, 3, 4, 5].map(s => (
                      <View key={String(s)} onClick={() => setFilterStars(s)} style={`padding: 8rpx 20rpx; border-radius: 20rpx; border: 1rpx solid ${filterStars === s ? '#E8735A' : '#E7E0D8'}; background: ${filterStars === s ? '#E8735A' : '#fff'};`}>
                        <Text style={`font-size: 22rpx; color: ${filterStars === s ? '#fff' : '#7A7068'};`}>{s === null ? '全部' : `${s}星`}</Text>
                      </View>
                    ))}
                  </View>
                  {/* 价格区间 */}
                  <Text style='font-size: 22rpx; color: #7A7068; display: block; margin-bottom: 10rpx;'>价格区间</Text>
                  <View style='display: flex; gap: 10rpx; margin-bottom: 16rpx; flex-wrap: wrap;'>
                    {[{ v: 'all', l: '全部' }, { v: 'budget', l: '¥300以下' }, { v: 'mid', l: '¥300-800' }, { v: 'luxury', l: '¥800以上' }].map(p => (
                      <View key={p.v} onClick={() => setFilterPriceRange(p.v)} style={`padding: 8rpx 20rpx; border-radius: 20rpx; border: 1rpx solid ${filterPriceRange === p.v ? '#E8735A' : '#E7E0D8'}; background: ${filterPriceRange === p.v ? '#E8735A' : '#fff'};`}>
                        <Text style={`font-size: 22rpx; color: ${filterPriceRange === p.v ? '#fff' : '#7A7068'};`}>{p.l}</Text>
                      </View>
                    ))}
                  </View>
                  {/* 商圈 */}
                  {hotelAreas.length > 0 && (
                    <View>
                      <Text style='font-size: 22rpx; color: #7A7068; display: block; margin-bottom: 10rpx;'>商圈 / 片区</Text>
                      <View style='display: flex; gap: 10rpx; flex-wrap: wrap; margin-bottom: 8rpx;'>
                        <View onClick={() => setFilterArea('all')} style={`padding: 8rpx 20rpx; border-radius: 20rpx; border: 1rpx solid ${filterArea === 'all' ? '#E8735A' : '#E7E0D8'}; background: ${filterArea === 'all' ? '#E8735A' : '#fff'};`}>
                          <Text style={`font-size: 22rpx; color: ${filterArea === 'all' ? '#fff' : '#7A7068'};`}>全部</Text>
                        </View>
                        {hotelAreas.map(area => (
                          <View key={area} onClick={() => setFilterArea(area)} style={`padding: 8rpx 20rpx; border-radius: 20rpx; border: 1rpx solid ${filterArea === area ? '#E8735A' : '#E7E0D8'}; background: ${filterArea === area ? '#E8735A' : '#fff'};`}>
                            <Text style={`font-size: 22rpx; color: ${filterArea === area ? '#fff' : '#7A7068'};`}>{area}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  {/* 排序 */}
                  <Text style='font-size: 22rpx; color: #7A7068; display: block; margin-top: 16rpx; margin-bottom: 10rpx;'>排序方式</Text>
                  <View style='display: flex; gap: 10rpx; flex-wrap: wrap;'>
                    {[{ v: 'default', l: '综合推荐' }, { v: 'price_asc', l: '价格↑' }, { v: 'rating_desc', l: '评分↓' }].map(s => (
                      <View key={s.v} onClick={() => setSortBy(s.v as any)} style={`padding: 8rpx 20rpx; border-radius: 20rpx; border: 1rpx solid ${sortBy === s.v ? '#E8735A' : '#E7E0D8'}; background: ${sortBy === s.v ? '#E8735A' : '#fff'};`}>
                        <Text style={`font-size: 22rpx; color: ${sortBy === s.v ? '#fff' : '#7A7068'};`}>{s.l}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {loadingStep && <View style='text-align: center; padding: 64rpx; color: #7A7068;'><Text>加载酒店中...</Text></View>}

            {!loadingStep && (
              <View>
                {/* ── 地图模式 ── */}
                {hotelViewMode === 'map' && (() => {
                  const mapHotels = filteredHotels.filter(h => h.lat && h.lng)
                  const centerLat = mapHotels.length > 0 ? mapHotels.reduce((s, h) => s + h.lat, 0) / mapHotels.length : 35.6762
                  const centerLng = mapHotels.length > 0 ? mapHotels.reduce((s, h) => s + h.lng, 0) / mapHotels.length : 139.6503
                  const markers = mapHotels.map((h, idx) => {
                    const isSel = (perDayMode ? selectedHotelPerDay[currentDayTab]?.id : selectedHotel?.id) === h.id
                    return {
                      id: idx + 1,
                      latitude: h.lat,
                      longitude: h.lng,
                      iconPath: isSel ? '/assets/marker-hotel-sel.png' : '/assets/marker-hotel.png',
                      width: 36,
                      height: 43,
                      anchor: { x: 0.5, y: 1 },
                    }
                  })
                  return (
                    <View>
                      <Map
                        latitude={mapSelectedHotel ? mapSelectedHotel.lat : centerLat}
                        longitude={mapSelectedHotel ? mapSelectedHotel.lng : centerLng}
                        scale={14}
                        markers={markers}
                        style='width: 100%; height: 500rpx;'
                        onMarkerTap={e => {
                          const hit = mapHotels[e.detail.markerId - 1]
                          if (hit) { setMapSelectedHotel(hit); setHotelDetailItem(hit) }
                        }}
                      />
                      {/* 地图下方酒店横向列表 */}
                      <ScrollView scrollX style='padding: 20rpx 32rpx;'>
                        <View style='display: flex; gap: 16rpx;'>
                          {filteredHotels.map(hotel => {
                            const isSel = (perDayMode ? selectedHotelPerDay[currentDayTab]?.id : selectedHotel?.id) === hotel.id
                            const imgUrl = hotel.images?.[0] || ''
                            return (
                              <View
                                key={hotel.id}
                                onClick={() => { setMapSelectedHotel(hotel); setHotelDetailItem(hotel) }}
                                style={`width: 260rpx; background: #fff; border-radius: 16rpx; border: 2rpx solid ${isSel ? '#E8735A' : mapSelectedHotel?.id === hotel.id ? '#E8735A80' : '#E7E0D8'}; overflow: hidden; flex-shrink: 0;`}
                              >
                                <View style='height: 120rpx; position: relative; overflow: hidden;'>
                                  {imgUrl ? (
                                    <Image src={imgUrl} style='width: 260rpx; height: 120rpx; display: block;' mode='aspectFill' />
                                  ) : (
                                    <View style='width: 100%; height: 100%; background: linear-gradient(135deg, #E8735A30, #E8735A10); display: flex; align-items: center; justify-content: center; font-size: 48rpx;'>
                                      <Text>🏨</Text>
                                    </View>
                                  )}
                                  {isSel && <View style='position: absolute; top: 8rpx; right: 8rpx; background: #E8735A; border-radius: 20rpx; padding: 2rpx 12rpx;'><Text style='font-size: 18rpx; color: #fff;'>已选</Text></View>}
                                </View>
                                <View style='padding: 12rpx 16rpx;'>
                                  <Text style='font-size: 24rpx; font-weight: 600; color: #2D2420; display: block;' numberOfLines={1}>{hotel.name}</Text>
                                  <View style='display: flex; justify-content: space-between; align-items: center; margin-top: 4rpx;'>
                                    <Text style='font-size: 20rpx; color: #7A7068;'>⭐{hotel.rating?.toFixed(1)}</Text>
                                    {hotel.priceRange && <Text style='font-size: 22rpx; font-weight: 700; color: #E8735A;'>¥{hotel.priceRange[0]}</Text>}
                                  </View>
                                </View>
                              </View>
                            )
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  )
                })()}

                {/* ── 列表模式 ── */}
                {hotelViewMode === 'list' && (
                  <ScrollView scrollY style='height: calc(100vh - 500rpx);'>
                    <View style='padding: 0 32rpx;'>
                    {filteredHotels.length === 0 && (
                      <View style='text-align: center; padding: 64rpx; color: #C0B8B0;'><Text>暂无符合条件的酒店</Text></View>
                    )}
                    {filteredHotels.map(hotel => {
                      const isSel = (perDayMode ? selectedHotelPerDay[currentDayTab]?.id : selectedHotel?.id) === hotel.id
                      return (
                        <View
                          key={hotel.id}
                          style={`background: #fff; border-radius: 20rpx; border: 2rpx solid ${isSel ? '#E8735A' : '#E7E0D8'}; margin-bottom: 20rpx; overflow: hidden; display: flex; flex-direction: row;`}
                        >
                          {/* 图片/图标区 */}
                          <View
                            onClick={() => setHotelDetailItem(hotel)}
                            style='width: 160rpx; height: 160rpx; flex-shrink: 0; overflow: hidden; position: relative;'
                          >
                            {hotel.images?.[0] ? (
                              <Image src={hotel.images[0]} style='width: 160rpx; height: 160rpx; display: block;' mode='aspectFill' />
                            ) : (
                              <View style='width: 160rpx; height: 160rpx; background: linear-gradient(135deg, #E8735A30, #E8735A10); display: flex; align-items: center; justify-content: center; font-size: 52rpx;'>🏨</View>
                            )}
                            {isSel && <View style='position: absolute; top: 8rpx; left: 8rpx; background: #E8735A; border-radius: 20rpx; padding: 2rpx 10rpx;'><Text style='font-size: 18rpx; color: #fff;'>✓</Text></View>}
                          </View>
                          {/* 信息区 - 点击看详情 */}
                          <View style='flex: 1; overflow: hidden; padding: 16rpx 16rpx;' onClick={() => setHotelDetailItem(hotel)}>
                            <View style='display: flex; flex-direction: row; align-items: flex-start; margin-bottom: 6rpx;'>
                              <Text style='font-size: 26rpx; font-weight: 600; color: #2D2420; flex: 1; overflow: hidden;' numberOfLines={1}>{hotel.name}</Text>
                              {hotel.stars && <Text style='font-size: 20rpx; color: #F5A623; flex-shrink: 0; margin-left: 8rpx;'>{'★'.repeat(hotel.stars)}</Text>}
                            </View>
                            <Text style='font-size: 20rpx; color: #7A7068; display: block; margin-bottom: 8rpx; overflow: hidden;' numberOfLines={1}>📍 {hotel.address}</Text>
                            <View style='display: flex; flex-direction: row; align-items: center; margin-bottom: 8rpx;'>
                              <Text style='font-size: 20rpx; color: #F5A623; flex: 1;'>⭐ {hotel.rating?.toFixed(1) || '--'}</Text>
                              {hotel.priceRange && (
                                <Text style='font-size: 22rpx; font-weight: 700; color: #E8735A;'>¥{hotel.priceRange[0]}<Text style='font-size: 18rpx; color: #7A7068; font-weight: 400;'>/晚起</Text></Text>
                              )}
                            </View>
                            {hotel.tags && hotel.tags.length > 0 && (
                              <View style='display: flex; flex-direction: row; flex-wrap: nowrap; overflow: hidden;'>
                                {hotel.tags.slice(0, 3).map((tag, ti) => (
                                  <View key={tag} style={`background: #F5F0EB; border-radius: 12rpx; padding: 4rpx 12rpx; flex-shrink: 0; ${ti > 0 ? 'margin-left: 8rpx;' : ''}`}>
                                    <Text style='font-size: 18rpx; color: #7A7068;'>{tag}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                          {/* 选择按钮 */}
                          <View
                            onClick={() => {
                              if (perDayMode) {
                                const nd = { ...selectedHotelPerDay }
                                nd[currentDayTab] = nd[currentDayTab]?.id === hotel.id ? null : hotel
                                setSelectedHotelPerDay(nd)
                              } else {
                                setSelectedHotel(selectedHotel?.id === hotel.id ? null : hotel)
                              }
                            }}
                            style={`width: 80rpx; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: ${isSel ? '#E8735A' : '#F5F0EB'};`}
                          >
                            <Text style={`font-size: 32rpx; color: ${isSel ? '#fff' : '#C0B8B0'};`}>{isSel ? '✓' : '+'}</Text>
                            <Text style={`font-size: 18rpx; color: ${isSel ? '#fff' : '#C0B8B0'};`}>{isSel ? '已选' : '选择'}</Text>
                          </View>
                        </View>
                      )
                    })}
                    </View>
                  </ScrollView>
                )}
              </View>
            )}
          </View>
        )}
        
        {/* ══════════════════ 步骤4：想去打卡的地方 ══════════════════ */}
        {step === 4 && (
          <View style='padding: 0;'>

            {/* ── POI购物车底部弹窗 ── */}
            {showPoiCart && (
              <View style='position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.5); display: flex; align-items: flex-end;'>
                <View style='background: #fff; border-radius: 32rpx 32rpx 0 0; width: 100%;'>
                  <View style='padding: 28rpx 32rpx 16rpx; display: flex; justify-content: space-between; align-items: center; border-bottom: 1rpx solid #F5F0EB;'>
                    <Text style='font-size: 32rpx; font-weight: 700; color: #2D2420;'>🛒 已添加 {selectedPoiIds.size} 个地点</Text>
                    <View onClick={() => setShowPoiCart(false)} style='width: 52rpx; height: 52rpx; background: #F5F0EB; border-radius: 50%; display: flex; align-items: center; justify-content: center;'>
                      <Text style='font-size: 28rpx; color: #7A7068;'>✕</Text>
                    </View>
                  </View>
                  <ScrollView scrollY style='max-height: 60vh;'>
                    <View style='padding: 20rpx 32rpx 40rpx;'>
                      {selectedPoiIds.size === 0 && (
                        <View style='text-align: center; padding: 80rpx 0; color: #C0B8B0;'>
                          <Text style='font-size: 64rpx; display: block; margin-bottom: 16rpx;'>📍</Text>
                          <Text style='font-size: 26rpx;'>还没有添加任何地点</Text>
                        </View>
                      )}
                      {selectedPoisList.map((poi, idx) => (
                        <View key={poi.id} style='background: #fff; border-radius: 16rpx; border: 1rpx solid #E7E0D8; margin-bottom: 16rpx; padding: 20rpx; display: flex; align-items: center; gap: 16rpx;'>
                          <View style='width: 40rpx; height: 40rpx; background: #E8735A; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;'>
                            <Text style='font-size: 20rpx; color: #fff; font-weight: 700;'>{idx + 1}</Text>
                          </View>
                          <Text style='font-size: 28rpx;'>{typeEmoji[poi.type] || '📍'}</Text>
                          <View style='flex: 1;'>
                            <Text style='font-size: 26rpx; font-weight: 600; color: #2D2420; display: block;'>{poi.name}</Text>
                            <Text style='font-size: 22rpx; color: #7A7068;'>⭐{poi.rating?.toFixed(1)}  ⏱{poi.duration >= 60 ? Math.floor(poi.duration / 60) + 'h' : poi.duration + 'm'}  {poi.cost === 0 ? '免费' : '¥' + poi.cost}</Text>
                          </View>
                          <View
                            onClick={() => { const n = new Set(selectedPoiIds); n.delete(poi.id); setSelectedPoiIds(n) }}
                            style='width: 48rpx; height: 48rpx; background: #F5F0EB; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;'
                          >
                            <Text style='font-size: 24rpx; color: #E8735A;'>✕</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </View>
            )}

            {/* ── POI详情弹窗 ── */}
            {poiDetailItem && (
              <View style='position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.5); display: flex; align-items: flex-end;'>
                <View style='background: #fff; border-radius: 32rpx 32rpx 0 0; width: 100%; max-height: 85vh; display: flex; flex-direction: column;'>
                  <View style='height: 280rpx; background: linear-gradient(135deg, #E8735A30, #E8735A10); display: flex; align-items: center; justify-content: center; font-size: 80rpx; position: relative; flex-shrink: 0;'>
                    {typeEmoji[poiDetailItem.type] || '📍'}
                    <View onClick={() => setPoiDetailItem(null)} style='position: absolute; top: 24rpx; right: 24rpx; background: rgba(0,0,0,0.3); border-radius: 50%; width: 52rpx; height: 52rpx; display: flex; align-items: center; justify-content: center;'>
                      <Text style='color: #fff; font-size: 28rpx;'>✕</Text>
                    </View>
                  </View>
                  <ScrollView scrollY style='flex: 1; overflow: hidden;'>
                    <View style='padding: 28rpx 32rpx calc(260rpx + env(safe-area-inset-bottom));'>
                      <Text style='font-size: 36rpx; font-weight: 700; color: #2D2420; display: block; margin-bottom: 4rpx;'>{poiDetailItem.name}</Text>
                      {poiDetailItem.nameLocal && poiDetailItem.nameLocal !== poiDetailItem.name && (
                        <Text style='font-size: 24rpx; color: #7A7068; display: block; margin-bottom: 12rpx;'>{poiDetailItem.nameLocal}</Text>
                      )}
                      <View style='display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 16rpx;'>
                        <Text style='font-size: 22rpx; color: #F5A623; background: #FFF8E7; padding: 6rpx 16rpx; border-radius: 12rpx;'>⭐ {poiDetailItem.rating?.toFixed(1)}</Text>
                        <Text style='font-size: 22rpx; color: #7A7068; background: #F5F0EB; padding: 6rpx 16rpx; border-radius: 12rpx;'>⏱ {poiDetailItem.duration >= 60 ? Math.floor(poiDetailItem.duration / 60) + 'h' + (poiDetailItem.duration % 60 > 0 ? poiDetailItem.duration % 60 + 'm' : '') : poiDetailItem.duration + 'm'}</Text>
                        <Text style='font-size: 22rpx; color: #7A7068; background: #F5F0EB; padding: 6rpx 16rpx; border-radius: 12rpx;'>{poiDetailItem.cost === 0 ? '🆓 免费' : '¥' + poiDetailItem.cost}</Text>
                        {poiDetailItem.seasonalIndex !== undefined && (
                          <Text style='font-size: 22rpx; color: #4CAF50; background: #E8F5E9; padding: 6rpx 16rpx; border-radius: 12rpx;'>🌿 当季{Math.round(poiDetailItem.seasonalIndex * 10)}</Text>
                        )}
                      </View>
                      {poiDetailItem.recommendReason && (
                        <Text style='font-size: 26rpx; color: #E8735A; display: block; margin-bottom: 16rpx; background: #E8735A10; padding: 16rpx 20rpx; border-radius: 12rpx;'>💡 {poiDetailItem.recommendReason}</Text>
                      )}
                      <Text style='font-size: 26rpx; color: #4A4440; line-height: 1.6; display: block; margin-bottom: 16rpx;'>{poiDetailItem.description}</Text>
                      {poiDetailItem.openTime && (
                        <Text style='font-size: 24rpx; color: #7A7068; display: block; margin-bottom: 16rpx;'>🕐 {poiDetailItem.openTime}{poiDetailItem.closeTime ? ` - ${poiDetailItem.closeTime}` : ''}</Text>
                      )}
                      {poiDetailItem.address && (
                        <Text style='font-size: 24rpx; color: #7A7068; display: block; margin-bottom: 16rpx;'>📍 {poiDetailItem.address}</Text>
                      )}
                      {poiDetailItem.tags && poiDetailItem.tags.length > 0 && (
                        <View style='display: flex; flex-wrap: wrap; gap: 10rpx; margin-bottom: 16rpx;'>
                          {poiDetailItem.tags.map(tag => (
                            <View key={tag} style='background: #F5F0EB; border-radius: 20rpx; padding: 8rpx 20rpx;'>
                              <Text style='font-size: 22rpx; color: #7A7068;'>{tag}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      <View
                        onClick={() => {
                          const n = new Set(selectedPoiIds)
                          if (n.has(poiDetailItem.id)) { n.delete(poiDetailItem.id) } else { n.add(poiDetailItem.id) }
                          setSelectedPoiIds(n)
                          setPoiDetailItem(null)
                        }}
                        style={`padding: 32rpx; border-radius: 24rpx; text-align: center; background: ${selectedPoiIds.has(poiDetailItem.id) ? '#F5F0EB' : 'linear-gradient(135deg, #E8735A, #D4553D)'}; color: ${selectedPoiIds.has(poiDetailItem.id) ? '#7A7068' : '#fff'};`}
                      >
                        <Text style='font-size: 30rpx; font-weight: 700;'>{selectedPoiIds.has(poiDetailItem.id) ? '取消添加' : '+ 加入行程'}</Text>
                      </View>
                    </View>
                  </ScrollView>
                </View>
              </View>
            )}

            {/* ── 页头：标题 + 搜索 + 购物车入口 ── */}
            <View style='padding: 24rpx 32rpx 0;'>
              <View style='display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16rpx;'>
                <View>
                  <Text style='font-size: 36rpx; font-weight: 700; color: #2D2420; display: block;'>想去打卡的地方</Text>
                  <Text style='font-size: 24rpx; color: #7A7068; display: block; margin-top: 4rpx;'>已选 {selectedPoiIds.size} 个地点</Text>
                </View>
                {/* 购物车入口 */}
                <View
                  onClick={() => setShowPoiCart(true)}
                  style={`background: ${selectedPoiIds.size > 0 ? '#E8735A' : '#F5F0EB'}; border-radius: 20rpx; padding: 14rpx 24rpx; display: flex; align-items: center; gap: 10rpx;`}
                >
                  <Text style='font-size: 28rpx;'>🛒</Text>
                  <Text style={`font-size: 24rpx; font-weight: 600; color: ${selectedPoiIds.size > 0 ? '#fff' : '#7A7068'};`}>{selectedPoiIds.size > 0 ? selectedPoiIds.size + ' 个' : '已选'}</Text>
                </View>
              </View>

              {/* 搜索框 + 地图/列表切换 */}
              <View style='display: flex; gap: 12rpx; margin-bottom: 16rpx;'>
                <View style='flex: 1; background: #fff; border-radius: 16rpx; border: 1rpx solid #E7E0D8; padding: 14rpx 20rpx; display: flex; align-items: center; gap: 12rpx;'>
                  <Text style='font-size: 24rpx; color: #C0B8B0;'>🔍</Text>
                  <Input style='flex: 1; font-size: 26rpx;' placeholder='搜索地点名称、标签...' placeholderStyle='color: #C0B8B0;' value={poiSearch} onInput={e => setPoiSearch(e.detail.value)} />
                </View>
                <View
                  onClick={() => setPoiViewMode(poiViewMode === 'list' ? 'map' : 'list')}
                  style={`background: ${poiViewMode === 'map' ? '#E8735A' : '#fff'}; border-radius: 16rpx; border: 1rpx solid ${poiViewMode === 'map' ? '#E8735A' : '#E7E0D8'}; padding: 14rpx 20rpx; display: flex; align-items: center;`}
                >
                  <Text style={`font-size: 24rpx; color: ${poiViewMode === 'map' ? '#fff' : '#7A7068'};`}>{poiViewMode === 'map' ? '🗺️ 地图' : '📋 列表'}</Text>
                </View>
              </View>

              {/* 一级类目 Tab */}
              <ScrollView scrollX style='margin-bottom: 0;'>
                <View style='display: flex; gap: 12rpx;'>
                  {POI_CATEGORIES_CONFIG.map(cat => {
                    const catCount = pois.filter(p => p.type === cat.id && selectedPoiIds.has(p.id)).length
                    return (
                      <View
                        key={cat.id}
                        onClick={() => { setPoiCategoryTab(cat.id); setShowPoiFilter(false); resetPoiFilters() }}
                        style={`padding: 12rpx 24rpx; border-radius: 24rpx; white-space: nowrap; border: 1rpx solid ${poiCategoryTab === cat.id ? '#E8735A' : '#E7E0D8'}; background: ${poiCategoryTab === cat.id ? '#E8735A' : '#fff'}; position: relative;`}
                      >
                        <Text style={`font-size: 26rpx; color: ${poiCategoryTab === cat.id ? '#fff' : '#7A7068'};`}>{cat.emoji} {cat.label}</Text>
                        {catCount > 0 && (
                          <View style='position: absolute; top: -8rpx; right: -8rpx; background: #E8735A; border-radius: 20rpx; min-width: 32rpx; height: 32rpx; display: flex; align-items: center; justify-content: center; border: 2rpx solid #fff;'>
                            <Text style='font-size: 18rpx; color: #fff; font-weight: 700; padding: 0 6rpx;'>{catCount}</Text>
                          </View>
                        )}
                      </View>
                    )
                  })}
                </View>
              </ScrollView>

              {/* 排序 + 筛选工具栏 */}
              <View style='display: flex; gap: 12rpx; margin-top: 16rpx; margin-bottom: 4rpx; align-items: center;'>
                <ScrollView scrollX style='flex: 1;'>
                  <View style='display: flex; gap: 10rpx;'>
                    {[
                      { v: 'default', l: '综合推荐' },
                      { v: 'seasonal', l: '🌿 当季指数' },
                      { v: 'rating', l: '⭐ 评分' },
                      { v: 'duration', l: '⏱ 时长' },
                    ].map(s => (
                      <View
                        key={s.v}
                        onClick={() => setPoiSortBy(s.v as any)}
                        style={`padding: 8rpx 20rpx; border-radius: 20rpx; border: 1rpx solid ${poiSortBy === s.v ? '#E8735A' : '#E7E0D8'}; background: ${poiSortBy === s.v ? '#FFF0ED' : '#fff'}; white-space: nowrap; flex-shrink: 0;`}
                      >
                        <Text style={`font-size: 22rpx; color: ${poiSortBy === s.v ? '#E8735A' : '#7A7068'};`}>{s.l}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
                <View
                  onClick={() => setShowPoiFilter(!showPoiFilter)}
                  style={`background: ${showPoiFilter || activePoiFilterCount > 0 ? '#E8735A' : '#fff'}; border-radius: 16rpx; border: 1rpx solid ${showPoiFilter || activePoiFilterCount > 0 ? '#E8735A' : '#E7E0D8'}; padding: 8rpx 20rpx; flex-shrink: 0; display: flex; align-items: center; gap: 6rpx;`}
                >
                  <Text style={`font-size: 22rpx; color: ${showPoiFilter || activePoiFilterCount > 0 ? '#fff' : '#7A7068'};`}>筛选{activePoiFilterCount > 0 ? ` · ${activePoiFilterCount}` : ''}</Text>
                </View>
              </View>
            </View>

            {/* ── 筛选面板（按类目分层展开） ── */}
            {showPoiFilter && (
              <View style='background: #fff; border: 1rpx solid #E7E0D8; border-radius: 0; margin: 0; padding: 20rpx 32rpx;'>

                {/* 共同筛选项：二级标签 */}
                {poiCategoryTags.length > 0 && (
                  <View style='margin-bottom: 16rpx;'>
                    <Text style='font-size: 22rpx; color: #7A7068; display: block; margin-bottom: 10rpx;'>
                      {poiCategoryTab === 'scenic' ? '景点类型' : poiCategoryTab === 'food' ? '美食类目' : poiCategoryTab === 'shopping' ? '购物类型' : '游玩类型'}
                    </Text>
                    <View style='display: flex; flex-wrap: wrap; gap: 10rpx;'>
                      {poiCategoryTags.map(tag => (
                        <View
                          key={tag}
                          onClick={() => {
                            const n = filterPoiTags.includes(tag) ? filterPoiTags.filter(t => t !== tag) : [...filterPoiTags, tag]
                            setFilterPoiTags(n)
                          }}
                          style={`padding: 8rpx 20rpx; border-radius: 20rpx; border: 1rpx solid ${filterPoiTags.includes(tag) ? '#E8735A' : '#E7E0D8'}; background: ${filterPoiTags.includes(tag) ? '#E8735A' : '#F9F6F3'};`}
                        >
                          <Text style={`font-size: 22rpx; color: ${filterPoiTags.includes(tag) ? '#fff' : '#7A7068'};`}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* 评分筛选（各类目共有） */}
                <View style='margin-bottom: 16rpx;'>
                  <Text style='font-size: 22rpx; color: #7A7068; display: block; margin-bottom: 10rpx;'>综合评分</Text>
                  <View style='display: flex; gap: 10rpx;'>
                    {[null, 4.5, 4.0, 3.5].map(r => (
                      <View key={String(r)} onClick={() => setFilterPoiRating(r)} style={`padding: 8rpx 20rpx; border-radius: 20rpx; border: 1rpx solid ${filterPoiRating === r ? '#E8735A' : '#E7E0D8'}; background: ${filterPoiRating === r ? '#E8735A' : '#F9F6F3'};`}>
                        <Text style={`font-size: 22rpx; color: ${filterPoiRating === r ? '#fff' : '#7A7068'};`}>{r === null ? '全部' : `${r}分+`}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* 景点：门票价格 / 游玩时长 / 开放时间 / 当季指数 */}
                {poiCategoryTab === 'scenic' && (
                  <View>
                    <View style='margin-bottom: 16rpx;'>
                      <Text style='font-size: 22rpx; color: #7A7068; display: block; margin-bottom: 10rpx;'>门票价格</Text>
                      <View style='display: flex; gap: 10rpx; flex-wrap: wrap;'>
                        {[{ v: 'all', l: '全部' }, { v: 'free', l: '免费' }, { v: 'cheap', l: '¥50以内' }, { v: 'mid', l: '¥50-200' }, { v: 'expensive', l: '¥200+' }].map(p => (
                          <View key={p.v} onClick={() => setFilterPoiCost(p.v)} style={`padding: 8rpx 20rpx; border-radius: 20rpx; border: 1rpx solid ${filterPoiCost === p.v ? '#E8735A' : '#E7E0D8'}; background: ${filterPoiCost === p.v ? '#E8735A' : '#F9F6F3'};`}>
                            <Text style={`font-size: 22rpx; color: ${filterPoiCost === p.v ? '#fff' : '#7A7068'};`}>{p.l}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <View style='margin-bottom: 16rpx;'>
                      <Text style='font-size: 22rpx; color: #7A7068; display: block; margin-bottom: 10rpx;'>游玩时长</Text>
                      <View style='display: flex; gap: 10rpx; flex-wrap: wrap;'>
                        {[{ v: 'all', l: '全部' }, { v: 'short', l: '1小时内' }, { v: 'mid', l: '1-2小时' }, { v: 'long', l: '2小时+' }].map(d => (
                          <View key={d.v} onClick={() => setFilterPoiDuration(d.v)} style={`padding: 8rpx 20rpx; border-radius: 20rpx; border: 1rpx solid ${filterPoiDuration === d.v ? '#E8735A' : '#E7E0D8'}; background: ${filterPoiDuration === d.v ? '#E8735A' : '#F9F6F3'};`}>
                            <Text style={`font-size: 22rpx; color: ${filterPoiDuration === d.v ? '#fff' : '#7A7068'};`}>{d.l}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <View style='margin-bottom: 16rpx;'>
                      <Text style='font-size: 22rpx; color: #7A7068; display: block; margin-bottom: 10rpx;'>开放时间</Text>
                      <View style='display: flex; gap: 10rpx; flex-wrap: wrap;'>
                        {[{ v: 'all', l: '全部' }, { v: 'early', l: '早开放（8点前）' }, { v: 'late', l: '晚关闭（20点后）' }, { v: 'allday', l: '全天开放' }].map(o => (
                          <View key={o.v} onClick={() => setFilterPoiOpenTime(o.v)} style={`padding: 8rpx 20rpx; border-radius: 20rpx; border: 1rpx solid ${filterPoiOpenTime === o.v ? '#E8735A' : '#E7E0D8'}; background: ${filterPoiOpenTime === o.v ? '#E8735A' : '#F9F6F3'};`}>
                            <Text style={`font-size: 22rpx; color: ${filterPoiOpenTime === o.v ? '#fff' : '#7A7068'};`}>{o.l}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                )}

                {/* 餐饮：人均消费 / 营业时间 */}
                {(poiCategoryTab === 'food' || poiCategoryTab === 'shopping' || poiCategoryTab === 'activity') && (
                  <View style='margin-bottom: 16rpx;'>
                    <Text style='font-size: 22rpx; color: #7A7068; display: block; margin-bottom: 10rpx;'>人均消费</Text>
                    <View style='display: flex; gap: 10rpx; flex-wrap: wrap;'>
                      {[{ v: 'all', l: '全部' }, { v: 'free', l: '免费' }, { v: 'cheap', l: '¥50以内' }, { v: 'mid', l: '¥50-200' }, { v: 'expensive', l: '¥200+' }].map(p => (
                        <View key={p.v} onClick={() => setFilterPoiCost(p.v)} style={`padding: 8rpx 20rpx; border-radius: 20rpx; border: 1rpx solid ${filterPoiCost === p.v ? '#E8735A' : '#E7E0D8'}; background: ${filterPoiCost === p.v ? '#E8735A' : '#F9F6F3'};`}>
                          <Text style={`font-size: 22rpx; color: ${filterPoiCost === p.v ? '#fff' : '#7A7068'};`}>{p.l}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* 驾乐：游玩时长 */}
                {poiCategoryTab === 'activity' && (
                  <View style='margin-bottom: 16rpx;'>
                    <Text style='font-size: 22rpx; color: #7A7068; display: block; margin-bottom: 10rpx;'>游玩时长</Text>
                    <View style='display: flex; gap: 10rpx; flex-wrap: wrap;'>
                      {[{ v: 'all', l: '全部' }, { v: 'short', l: '2小时内' }, { v: 'mid', l: '2-4小时' }, { v: 'long', l: '4小时+' }].map(d => (
                        <View key={d.v} onClick={() => setFilterPoiDuration(d.v)} style={`padding: 8rpx 20rpx; border-radius: 20rpx; border: 1rpx solid ${filterPoiDuration === d.v ? '#E8735A' : '#E7E0D8'}; background: ${filterPoiDuration === d.v ? '#E8735A' : '#F9F6F3'};`}>
                          <Text style={`font-size: 22rpx; color: ${filterPoiDuration === d.v ? '#fff' : '#7A7068'};`}>{d.l}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* 重置按钮 */}
                {(activePoiFilterCount > 0 || filterPoiOpenTime !== 'all') && (
                  <View
                    onClick={() => { resetPoiFilters(); setFilterPoiOpenTime('all') }}
                    style='margin-top: 8rpx; padding: 12rpx; border-radius: 16rpx; text-align: center; background: #F5F0EB;'
                  >
                    <Text style='font-size: 24rpx; color: #7A7068;'>清除全部筛选</Text>
                  </View>
                )}
              </View>
            )}

            {/* ── POI 地图模式 ── */}
            {!loadingStep && poiViewMode === 'map' && (() => {
              const catPois = poisByCategory.filter(p => p.lat && p.lng)
              const cLat = catPois.length > 0 ? catPois.reduce((s, p) => s + p.lat, 0) / catPois.length : 35.6762
              const cLng = catPois.length > 0 ? catPois.reduce((s, p) => s + p.lng, 0) / catPois.length : 139.6503
              const markers = catPois.map((p, idx) => {
                const isSel = selectedPoiIds.has(p.id)
                const typeToIcon: Record<string, string> = {
                  scenic: 'scenic',
                  food: 'food',
                  shopping: 'shopping',
                  entertainment: 'entertainment',
                  hotel: 'hotel',
                }
                const iconKey = typeToIcon[p.type] || 'default'
                return {
                  id: idx + 1,
                  latitude: p.lat,
                  longitude: p.lng,
                  iconPath: isSel ? `/assets/marker-${iconKey}-sel.png` : `/assets/marker-${iconKey}.png`,
                  width: 36,
                  height: 43,
                  anchor: { x: 0.5, y: 1 },
                }
              })
              return (
                <View>
                  <Map
                    latitude={poiMapSelected ? poiMapSelected.lat : cLat}
                    longitude={poiMapSelected ? poiMapSelected.lng : cLng}
                    scale={14}
                    markers={markers}
                    style='width: 100%; height: 520rpx;'
                    onMarkerTap={e => {
                      const hit = catPois[e.detail.markerId - 1]
                      if (hit) { setPoiMapSelected(hit); setPoiDetailItem(hit) }
                    }}
                  />
                  {/* 地图下方横向缩略图列表 */}
                  <ScrollView scrollX style='padding: 16rpx 32rpx;'>
                    <View style='display: flex; gap: 16rpx;'>
                      {poisByCategory.map(poi => (
                        <View
                          key={poi.id}
                          onClick={() => { setPoiMapSelected(poi); setPoiDetailItem(poi) }}
                          style={`width: 200rpx; background: #fff; border-radius: 16rpx; border: 2rpx solid ${selectedPoiIds.has(poi.id) ? '#E8735A' : '#E7E0D8'}; overflow: hidden; flex-shrink: 0;`}
                        >
                          <View style='height: 100rpx; background: linear-gradient(135deg, #E8735A30, #E8735A10); display: flex; align-items: center; justify-content: center; font-size: 40rpx; position: relative;'>
                            {typeEmoji[poi.type] || '📍'}
                            {selectedPoiIds.has(poi.id) && (
                              <View style='position: absolute; top: 8rpx; right: 8rpx; background: #E8735A; border-radius: 20rpx; width: 28rpx; height: 28rpx; display: flex; align-items: center; justify-content: center;'>
                                <Text style='font-size: 16rpx; color: #fff;'>✓</Text>
                              </View>
                            )}
                          </View>
                          <View style='padding: 10rpx 12rpx;'>
                            <Text style='font-size: 22rpx; font-weight: 600; color: #2D2420; display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;'>{poi.name}</Text>
                            <Text style='font-size: 20rpx; color: #7A7068;'>⭐{poi.rating?.toFixed(1)}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )
            })()}

            {/* ── POI 列表模式 ── */}
            {loadingStep && <View style='text-align: center; padding: 64rpx; color: #7A7068;'><Text>加载地点中...</Text></View>}
            {!loadingStep && poiViewMode === 'list' && (
              <ScrollView scrollY style='height: calc(100vh - 520rpx); margin-top: 12rpx;'>
                <View style='padding: 0 32rpx;'>
                {poisByCategory.length === 0 && (
                  <View style='text-align: center; padding: 64rpx; color: #C0B8B0;'><Text>暂无匹配的地点</Text></View>
                )}
                {poisByCategory.map(poi => (
                  <View
                    key={poi.id}
                    style={`background: #fff; border-radius: 20rpx; border: 2rpx solid ${selectedPoiIds.has(poi.id) ? '#E8735A' : '#E7E0D8'}; margin-bottom: 16rpx; overflow: hidden; display: flex; flex-direction: row;`}
                  >
                    {/* 左侧图片区 */}
                    <View
                      onClick={() => setPoiDetailItem(poi)}
                      style='width: 160rpx; height: 160rpx; flex-shrink: 0; overflow: hidden; position: relative;'
                    >
                      {poi.image ? (
                        <Image src={poi.image} style='width: 160rpx; height: 160rpx; display: block;' mode='aspectFill' />
                      ) : (
                        <View style='width: 160rpx; height: 160rpx; background: linear-gradient(135deg, #E8735A25, #E8735A10); display: flex; align-items: center; justify-content: center; font-size: 52rpx;'>{typeEmoji[poi.type] || '📍'}</View>
                      )}
                    </View>
                    {/* 中间信息区 */}
                    <View style='flex: 1; overflow: hidden; padding: 16rpx 12rpx;' onClick={() => setPoiDetailItem(poi)}>
                      <Text style='font-size: 26rpx; font-weight: 600; color: #2D2420; display: block; margin-bottom: 2rpx; overflow: hidden;' numberOfLines={1}>{poi.name}</Text>
                      {poi.nameLocal && poi.nameLocal !== poi.name && (
                        <Text style='font-size: 20rpx; color: #7A7068; display: block; margin-bottom: 6rpx; overflow: hidden;' numberOfLines={1}>{poi.nameLocal}</Text>
                      )}
                      <View style='display: flex; flex-direction: row; flex-wrap: wrap; margin-bottom: 6rpx;'>
                        <Text style='font-size: 20rpx; color: #F5A623; margin-right: 10rpx;'>⭐{poi.rating?.toFixed(1)}</Text>
                        <Text style='font-size: 20rpx; color: #7A7068; margin-right: 10rpx;'>⏱{poi.duration >= 60 ? Math.floor(poi.duration / 60) + 'h' : poi.duration + 'm'}</Text>
                        <Text style='font-size: 20rpx; color: #7A7068; margin-right: 10rpx;'>{poi.cost === 0 ? '免费' : '¥' + poi.cost}</Text>
                        {poi.seasonalIndex !== undefined && <Text style='font-size: 20rpx; color: #4CAF50;'>🌿{Math.round(poi.seasonalIndex * 10)}</Text>}
                      </View>
                      {poi.recommendReason && (
                        <Text style='font-size: 20rpx; color: #E8735A; display: block; overflow: hidden;' numberOfLines={1}>💡 {poi.recommendReason}</Text>
                      )}
                      {poi.tags && poi.tags.length > 0 && (
                        <View style='display: flex; flex-direction: row; overflow: hidden; margin-top: 6rpx;'>
                          {poi.tags.slice(0, 3).map((tag, ti) => (
                            <View key={tag} style={`background: #F5F0EB; border-radius: 12rpx; padding: 2rpx 10rpx; flex-shrink: 0; ${ti > 0 ? 'margin-left: 8rpx;' : ''}`}>
                              <Text style='font-size: 18rpx; color: #7A7068;'>{tag}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    {/* 右侧选择按钮 */}
                    <View
                      onClick={() => {
                        const n = new Set(selectedPoiIds)
                        if (n.has(poi.id)) { n.delete(poi.id) } else { n.add(poi.id) }
                        setSelectedPoiIds(n)
                      }}
                      style={`width: 80rpx; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: ${selectedPoiIds.has(poi.id) ? '#E8735A' : '#F5F0EB'};`}
                    >
                      <Text style={`font-size: 32rpx; color: ${selectedPoiIds.has(poi.id) ? '#fff' : '#C0B8B0'};`}>{selectedPoiIds.has(poi.id) ? '✓' : '+'}</Text>
                      <Text style={`font-size: 18rpx; color: ${selectedPoiIds.has(poi.id) ? '#fff' : '#C0B8B0'};`}>{selectedPoiIds.has(poi.id) ? '已选' : '添加'}</Text>
                    </View>
                  </View>
                ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}


        {/* ══════════════════ 步骤5：智能路线生成（过渡页） ══════════════════ */}
        {step === 5 && (
          <View style='min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64rpx;'>
            {/* 生成中等待状态 */}
            {generating && !showSkipConfirm && (
              <View style='text-align: center;'>
                <View style='font-size: 120rpx; margin-bottom: 40rpx;'>🗺️</View>
                <Text style='font-size: 36rpx; font-weight: 700; color: #2D2420; display: block; margin-bottom: 16rpx;'>正在智能规划路线</Text>
                <Text style='font-size: 26rpx; color: #7A7068; display: block; margin-bottom: 48rpx;'>为你量身定制最优行程安排...</Text>
                <View style='width: 400rpx; height: 8rpx; background: #E7E0D8; border-radius: 4rpx; overflow: hidden;'>
                  <View style='height: 100%; background: linear-gradient(90deg, #E8735A, #D4553D); border-radius: 4rpx; animation: progress 1.5s ease-in-out infinite;' />
                </View>
              </View>
            )}

            {/* POI溢出确认状态 */}
            {!generating && showSkipConfirm && (() => {
              const suggestDays = estimateExtraDaysNeeded(pendingSkippedPOIs)
              const inputDays = parseInt(extraDaysInput) || 0
              const canAccept = inputDays >= suggestDays
              return (
              <View style='width: 100%;'>
                {/* 标题 */}
                <View style='text-align: center; margin-bottom: 28rpx;'>
                  <View style='font-size: 72rpx; margin-bottom: 16rpx;'>⚠️</View>
                  <Text style='font-size: 34rpx; font-weight: 700; color: #2D2420; display: block; margin-bottom: 8rpx;'>部分景点无法安排</Text>
                  <Text style='font-size: 24rpx; color: #7A7068; display: block;'>以下 {pendingSkippedPOIs.length} 个地点因时间不足无法加入行程</Text>
                </View>

                {/* 区域一：建议延长游玩天数 */}
                <View style='background: #FFF8F0; border-radius: 20rpx; border: 2rpx solid #FDDCB5; padding: 24rpx 28rpx; margin-bottom: 20rpx;'>
                  <View style='display: flex; flex-direction: row; align-items: center; margin-bottom: 16rpx;'>
                    <Text style='font-size: 28rpx; font-weight: 700; color: #E8735A;'>📅 建议延长游玩天数</Text>
                  </View>
                  <Text style='font-size: 24rpx; color: #7A7068; display: block; margin-bottom: 16rpx;'>将这 {pendingSkippedPOIs.length} 个地点安排进去，至少需再延长 <Text style='color: #E8735A; font-weight: 700;'>{suggestDays} 天</Text></Text>
                  <View style='display: flex; flex-direction: row; align-items: center;'>
                    <Input
                      type='number'
                      value={extraDaysInput}
                      onInput={e => setExtraDaysInput(e.detail.value)}
                      placeholder={`输入延长天数（≥${suggestDays}）`}
                      style='flex: 1; background: #fff; border-radius: 12rpx; border: 2rpx solid #E7E0D8; padding: 16rpx 20rpx; font-size: 26rpx; height: 72rpx;'
                    />
                    <View
                      onClick={canAccept ? handleAcceptExtraDays : undefined}
                      style={`margin-left: 16rpx; padding: 16rpx 28rpx; border-radius: 12rpx; background: ${canAccept ? 'linear-gradient(135deg, #E8735A, #D4553D)' : '#E7E0D8'}; height: 72rpx; display: flex; align-items: center; justify-content: center;`}
                    >
                      <Text style={`font-size: 26rpx; font-weight: 600; color: ${canAccept ? '#fff' : '#B0A8A0'};`}>采纳</Text>
                    </View>
                  </View>
                  {inputDays > 0 && inputDays < suggestDays && (
                    <Text style='font-size: 22rpx; color: #E8735A; display: block; margin-top: 10rpx;'>⚠️ 天数不够，建议至少延长 {suggestDays} 天</Text>
                  )}
                </View>

                {/* 区域二：被跳过 POI 列表 + 必打卡标记 + 剔除按钮 */}
                <View style='background: #fff; border-radius: 20rpx; border: 2rpx solid #E7E0D8; padding: 20rpx 20rpx 8rpx; margin-bottom: 20rpx;'>
                  <Text style='font-size: 26rpx; font-weight: 700; color: #2D2420; display: block; margin-bottom: 16rpx;'>🗺️ 无法安排的地点</Text>
                  {pendingSkippedPOIs.map(poi => {
                    const isMust = mustVisitIds.has(poi.id)
                    return (
                      <View key={poi.id} style={`background: ${isMust ? '#FFF3E0' : '#F9F6F3'}; border-radius: 16rpx; border: 2rpx solid ${isMust ? '#FDDCB5' : '#E7E0D8'}; margin-bottom: 14rpx; padding: 18rpx 16rpx; display: flex; flex-direction: row; align-items: center;`}>
                        <Text style='font-size: 36rpx; margin-right: 14rpx;'>{typeEmoji[poi.type] || '📍'}</Text>
                        <View style='flex: 1; overflow: hidden;'>
                          <View style='display: flex; flex-direction: row; align-items: center;'>
                            <Text style='font-size: 26rpx; font-weight: 600; color: #2D2420;' numberOfLines={1}>{poi.name}</Text>
                            {isMust && <Text style='margin-left: 8rpx; font-size: 20rpx; color: #E8735A; flex-shrink: 0;'>必打卡</Text>}
                          </View>
                          <Text style='font-size: 22rpx; color: #7A7068;'>⏱ {poi.duration >= 60 ? Math.floor(poi.duration / 60) + 'h' : poi.duration + 'm'}  ⭐ {poi.rating?.toFixed(1)}</Text>
                        </View>
                        {/* 必打卡按钮 */}
                        <View
                          onClick={() => handleToggleMustVisit(poi.id)}
                          style={`flex-shrink: 0; margin-left: 10rpx; padding: 10rpx 16rpx; border-radius: 10rpx; border: 2rpx solid ${isMust ? '#E8735A' : '#C0B8B0'}; background: ${isMust ? '#FFF3E0' : '#fff'};`}
                        >
                          <Text style={`font-size: 22rpx; color: ${isMust ? '#E8735A' : '#7A7068'};`}>{isMust ? '⭐已标记' : '⭐必打卡'}</Text>
                        </View>
                        {/* 剔除按钮：必打卡的不允许直接剔除 */}
                        {!isMust && (
                          <View
                            onClick={() => setRemoveConfirmPoi(poi)}
                            style='flex-shrink: 0; margin-left: 10rpx; padding: 10rpx 16rpx; border-radius: 10rpx; background: #FFF0EC; border: 2rpx solid #F5C4B8;'
                          >
                            <Text style='font-size: 22rpx; color: #E8735A;'>剔除</Text>
                          </View>
                        )}
                      </View>
                    )
                  })}
                </View>

                {/* 区域三：所有 skipped POI 都是必打卡时，提示需要剔除哪些已安排的点 */}
                {(() => {
                  const allSkippedAreMust = pendingSkippedPOIs.length > 0 && pendingSkippedPOIs.every(p => mustVisitIds.has(p.id))
                  if (!allSkippedAreMust) return null
                  const suggestedRemovals = computeSuggestedRemovals()
                  if (suggestedRemovals.length === 0) return null
                  return (
                    <View style='background: #FFF0EC; border-radius: 20rpx; border: 2rpx solid #F5C4B8; padding: 20rpx 20rpx 8rpx; margin-bottom: 20rpx;'>
                      <View style='display: flex; flex-direction: row; align-items: center; margin-bottom: 8rpx;'>
                        <Text style='font-size: 26rpx; font-weight: 700; color: #E8735A;'>✂️ 建议从已安排地点中剔除</Text>
                      </View>
                      <Text style='font-size: 22rpx; color: #7A7068; display: block; margin-bottom: 16rpx;'>将以下地点剔除后，可在当前天数内安排所有必打卡点</Text>
                      {suggestedRemovals.map(poi => (
                        <View key={poi.id} style='background: #fff; border-radius: 16rpx; border: 2rpx solid #F5C4B8; margin-bottom: 14rpx; padding: 18rpx 16rpx; display: flex; flex-direction: row; align-items: center;'>
                          <Text style='font-size: 36rpx; margin-right: 14rpx;'>{typeEmoji[poi.type] || '📍'}</Text>
                          <View style='flex: 1; overflow: hidden;'>
                            <Text style='font-size: 26rpx; font-weight: 600; color: #2D2420;' numberOfLines={1}>{poi.name}</Text>
                            <Text style='font-size: 22rpx; color: #7A7068;'>⏱ {poi.duration >= 60 ? Math.floor(poi.duration / 60) + 'h' : poi.duration + 'm'}  ⭐ {poi.rating?.toFixed(1)}</Text>
                          </View>
                          <View
                            onClick={() => setRemoveConfirmPoi(poi)}
                            style='flex-shrink: 0; margin-left: 10rpx; padding: 10rpx 20rpx; border-radius: 10rpx; background: #E8735A; border: 2rpx solid #D4553D;'
                          >
                            <Text style='font-size: 22rpx; color: #fff; font-weight: 600;'>剔除</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )
                })()}

                {/* 底部按钮区 */}
                <View style='display: flex; flex-direction: row;'>
                  <View
                    onClick={handleGoBackToAdjust}
                    style='flex: 1; padding: 28rpx; border-radius: 24rpx; text-align: center; background: #F5F0EB; margin-right: 16rpx;'
                  >
                    <Text style='font-size: 28rpx; font-weight: 600; color: #7A7068;'>返回选点</Text>
                  </View>
                  <View
                    onClick={pendingSkippedPOIs.length === 0 ? handleConfirmSkip : undefined}
                    style={`flex: 1; padding: 28rpx; border-radius: 24rpx; text-align: center; background: ${pendingSkippedPOIs.length === 0 ? 'linear-gradient(135deg, #E8735A, #D4553D)' : '#E7E0D8'};`}
                  >
                    <Text style={`font-size: 28rpx; font-weight: 600; color: ${pendingSkippedPOIs.length === 0 ? '#fff' : '#B0A8A0'};`}>下一步</Text>
                  </View>
                </View>

                {pendingSkippedPOIs.length > 0 && (
                  <Text style='font-size: 22rpx; color: #B0A8A0; text-align: center; display: block; margin-top: 16rpx;'>将所有无法安排的地点剔除或采纳延长方案，即可继续</Text>
                )}
              </View>
              )
            })()}
          </View>
        )}


        {/* ══════════════════ 步骤6：行程预览 ══════════════════ */}
        {step === 6 && trip && (
          <View style='padding: 0;'>
            {/* 顶部摘要卡 */}
            <View style='background: linear-gradient(135deg, #E8735A, #D4553D); padding: 32rpx; margin: 24rpx 32rpx; border-radius: 24rpx;'>
              <Text style='font-size: 36rpx; font-weight: 700; color: #fff; display: block; margin-bottom: 8rpx;'>{trip.cityName} 行程</Text>
              <Text style='font-size: 24rpx; color: rgba(255,255,255,0.85); display: block;'>
                {formatDate(trip.startDate)} — {formatDate(trip.endDate)}  ·  {trip.days.length}天
                {trip.totalBudget > 0 && `  ·  ¥${trip.totalBudget}`}
              </Text>
            </View>

            {/* 整体/按天 Tab */}
            <View style='display: flex; background: #F5F0EB; border-radius: 20rpx; margin: 0 32rpx 24rpx; padding: 6rpx;'>
              <View
                onClick={() => setPreviewMode('overview')}
                style={`flex: 1; padding: 16rpx; border-radius: 16rpx; text-align: center; background: ${previewMode === 'overview' ? '#fff' : 'transparent'}; box-shadow: ${previewMode === 'overview' ? '0 2rpx 8rpx rgba(0,0,0,0.1)' : 'none'};`}
              >
                <Text style={`font-size: 26rpx; font-weight: ${previewMode === 'overview' ? '600' : '400'}; color: ${previewMode === 'overview' ? '#E8735A' : '#7A7068'};`}>整体行程</Text>
              </View>
              <View
                onClick={() => setPreviewMode('day')}
                style={`flex: 1; padding: 16rpx; border-radius: 16rpx; text-align: center; background: ${previewMode === 'day' ? '#fff' : 'transparent'}; box-shadow: ${previewMode === 'day' ? '0 2rpx 8rpx rgba(0,0,0,0.1)' : 'none'};`}
              >
                <Text style={`font-size: 26rpx; font-weight: ${previewMode === 'day' ? '600' : '400'}; color: ${previewMode === 'day' ? '#E8735A' : '#7A7068'};`}>按天查看</Text>
              </View>
            </View>

            {/* ─── 整体行程视图 ─── */}
            {previewMode === 'overview' && (
              <ScrollView scrollY style='height: calc(100vh - 760rpx); padding: 0 32rpx;'>
                {trip.days.map((day, dIdx) => {
                  const dayItems = day.items || []
                  const dayPois = dayItems.map(item => getPoiById(item.attractionId)).filter(Boolean) as Attraction[]
                  return (
                    <View
                      key={day.id}
                      onClick={() => { setPreviewDayIdx(dIdx); setPreviewMode('day') }}
                      style='background: #fff; border-radius: 20rpx; border: 1rpx solid #E7E0D8; margin-bottom: 24rpx; overflow: hidden;'
                    >
                      {/* 天标题 */}
                      <View style='background: linear-gradient(90deg, #E8735A10, transparent); padding: 24rpx 28rpx; display: flex; justify-content: space-between; align-items: center; border-bottom: 1rpx solid #F5F0EB;'>
                        <View>
                          <Text style='font-size: 30rpx; font-weight: 700; color: #2D2420;'>第{day.dayNumber}天</Text>
                          <Text style='font-size: 22rpx; color: #7A7068; margin-left: 12rpx;'>{formatDate(day.date)}</Text>
                        </View>
                        <Text style='font-size: 24rpx; color: #E8735A;'>{dayPois.length} 个景点 ›</Text>
                      </View>
                      {/* POI预览条 */}
                      <View style='padding: 20rpx 28rpx;'>
                        <ScrollView scrollX>
                          <View style='display: flex; gap: 16rpx; white-space: nowrap;'>
                            {dayPois.slice(0, 6).map((poi, pIdx) => (
                              <View key={poi.id} style='display: flex; align-items: center; gap: 8rpx; white-space: nowrap;'>
                                <View style='width: 40rpx; height: 40rpx; border-radius: 50%; background: #E8735A; display: flex; align-items: center; justify-content: center;'>
                                  <Text style='font-size: 20rpx; color: #fff; font-weight: 700;'>{pIdx + 1}</Text>
                                </View>
                                <Text style='font-size: 24rpx; color: #4A4440; max-width: 140rpx; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;'>{poi.name}</Text>
                                {pIdx < dayPois.length - 1 && <Text style='font-size: 24rpx; color: #C0B8B0;'>→</Text>}
                              </View>
                            ))}
                            {dayPois.length > 6 && <Text style='font-size: 24rpx; color: #C0B8B0;'>+{dayPois.length - 6}</Text>}
                          </View>
                        </ScrollView>
                      </View>
                    </View>
                  )
                })}
              </ScrollView>
            )}

            {/* ─── 按天查看视图 ─── */}
            {previewMode === 'day' && (
              <View>
                {/* 天选择 Tab（横向滚动） */}
                <ScrollView scrollX style='margin-bottom: 20rpx; padding: 0 32rpx;'>
                  <View style='display: flex; gap: 12rpx;'>
                    {trip.days.map((day, dIdx) => (
                      <View
                        key={day.id}
                        onClick={() => { setPreviewDayIdx(dIdx); setPreviewMapMode(false) }}
                        style={`padding: 14rpx 28rpx; border-radius: 24rpx; white-space: nowrap; border: 1rpx solid ${previewDayIdx === dIdx ? '#E8735A' : '#E7E0D8'}; background: ${previewDayIdx === dIdx ? '#E8735A' : '#fff'};`}
                      >
                        <Text style={`font-size: 26rpx; font-weight: ${previewDayIdx === dIdx ? '600' : '400'}; color: ${previewDayIdx === dIdx ? '#fff' : '#7A7068'};`}>第{day.dayNumber}天</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>

                {/* 列表/地图 切换 */}
                <View style='display: flex; background: #F5F0EB; border-radius: 20rpx; margin: 0 32rpx 20rpx; padding: 6rpx;'>
                  <View
                    onClick={() => setPreviewMapMode(false)}
                    style={`flex: 1; padding: 14rpx; border-radius: 16rpx; text-align: center; background: ${!previewMapMode ? '#fff' : 'transparent'};`}
                  >
                    <Text style={`font-size: 26rpx; font-weight: ${!previewMapMode ? '600' : '400'}; color: ${!previewMapMode ? '#E8735A' : '#7A7068'};`}>📋 列表</Text>
                  </View>
                  <View
                    onClick={() => setPreviewMapMode(true)}
                    style={`flex: 1; padding: 14rpx; border-radius: 16rpx; text-align: center; background: ${previewMapMode ? '#fff' : 'transparent'};`}
                  >
                    <Text style={`font-size: 26rpx; font-weight: ${previewMapMode ? '600' : '400'}; color: ${previewMapMode ? '#E8735A' : '#7A7068'};`}>🗺️ 地图</Text>
                  </View>
                </View>

                {(() => {
                  const currentDay = trip.days[previewDayIdx]
                  if (!currentDay) return null
                  const dayItems = currentDay.items || []
                  const dayPois = dayItems.map(item => ({
                    poi: getPoiById(item.attractionId) as Attraction | undefined,
                    item,
                  })).filter(x => x.poi)

                  // 地图模式
                  if (previewMapMode) {
                    const validPois = dayPois.filter(x => x.poi!.lat && x.poi!.lng)
                    const centerLat = validPois.length > 0 ? validPois.reduce((s, x) => s + x.poi!.lat, 0) / validPois.length : 35.6762
                    const centerLng = validPois.length > 0 ? validPois.reduce((s, x) => s + x.poi!.lng, 0) / validPois.length : 139.6503
                    const markers = validPois.map((x, idx) => {
                      const typeToIcon: Record<string, string> = {
                        scenic: 'scenic', food: 'food', shopping: 'shopping',
                        entertainment: 'entertainment', hotel: 'hotel',
                      }
                      const iconKey = typeToIcon[x.poi!.type] || 'default'
                      return {
                        id: idx + 1,
                        latitude: x.poi!.lat,
                        longitude: x.poi!.lng,
                        iconPath: `/assets/marker-${iconKey}-sel.png`,
                        width: 32,
                        height: 38,
                        anchor: { x: 0.5, y: 1 },
                        callout: {
                          content: `${idx + 1}`,
                          color: '#ffffff',
                          fontSize: 11,
                          bgColor: '#E8735A',
                          borderRadius: 10,
                          padding: 3,
                          display: 'ALWAYS',
                          anchorX: 0,
                          anchorY: -2,
                        },
                      }
                    })
                    const polylinePoints = validPois.map(x => ({ latitude: x.poi!.lat, longitude: x.poi!.lng }))

                    return (
                      <View>
                        <Map
                          latitude={centerLat}
                          longitude={centerLng}
                          scale={13}
                          markers={markers}
                          polyline={polylinePoints.length >= 2 ? [{ points: polylinePoints, color: '#E8735A', width: 4, arrowLine: true }] : []}
                          style='width: 100%; height: 550rpx;'
                        />
                        {/* 地图下方缩略图列表 */}
                        <ScrollView scrollX style='padding: 20rpx 32rpx;'>
                          <View style='display: flex; gap: 16rpx;'>
                            {dayPois.map((x, idx) => {
                              const imgUrl = x.poi!.image || (x.poi! as any).images?.[0] || ''
                              return (
                              <View key={x.poi!.id} style='width: 200rpx; background: #fff; border-radius: 16rpx; border: 1rpx solid #E7E0D8; overflow: hidden; flex-shrink: 0;'>
                                <View style='height: 120rpx; background: linear-gradient(135deg, #E8735A30, #E8735A10); position: relative; overflow: hidden;'>
                                  {imgUrl ? (
                                    <Image src={imgUrl} style='width: 200rpx; height: 120rpx; display: block;' mode='aspectFill' />
                                  ) : (
                                    <View style='width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;'>
                                      <Text style='font-size: 40rpx;'>{typeEmoji[x.poi!.type] || '📍'}</Text>
                                    </View>
                                  )}
                                  <View style='position: absolute; top: 8rpx; left: 8rpx; width: 32rpx; height: 32rpx; background: #E8735A; border-radius: 50%; display: flex; align-items: center; justify-content: center;'>
                                    <Text style='font-size: 18rpx; color: #fff; font-weight: 700;'>{idx + 1}</Text>
                                  </View>
                                </View>
                                <View style='padding: 12rpx;'>
                                  <Text style='font-size: 22rpx; font-weight: 600; color: #2D2420; display: block;' numberOfLines={1}>{x.poi!.name}</Text>
                                  <Text style='font-size: 20rpx; color: #7A7068;'>{x.item.startTime} - {x.item.endTime}</Text>
                                </View>
                              </View>
                              )
                            })}
                          </View>
                        </ScrollView>
                      </View>
                    )
                  }

                  // 列表模式：富信息 POI 卡片 + 交通段 + 酒店节点
                  const startHotelForDay: HotelPOI | null = previewDayIdx > 0
                    ? (trip.days[previewDayIdx - 1].hotel ?? null)
                    : (currentDay.hotel ?? null)
                  const endHotelForDay: HotelPOI | null = currentDay.hotel ?? null

                  const getMealSlotTag = (slot?: string) => {
                    if (slot === 'breakfast') return { label: '🌅 早餐', color: '#F5A623', bg: '#FFF8E7' }
                    if (slot === 'lunch')     return { label: '☀️ 午餐', color: '#E8735A', bg: '#FFF0EC' }
                    if (slot === 'dinner')    return { label: '🌙 晚餐', color: '#7B68EE', bg: '#F0EEFF' }
                    if (slot === 'snack')     return { label: '🍰 下午茶', color: '#4CAF50', bg: '#E8F5E9' }
                    return null
                  }

                  const renderHotelNode = (hotel: HotelPOI | null, label: string) => (
                    <View style='background: #F0EEFF; border-radius: 16rpx; border: 2rpx dashed #BDB0E8; padding: 20rpx 24rpx; display: flex; flex-direction: row; align-items: center;'>
                      <View style='width: 48rpx; height: 48rpx; background: #7B68EE; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 16rpx;'>
                        <Text style='font-size: 24rpx;'>🏨</Text>
                      </View>
                      <View style='flex: 1; overflow: hidden;'>
                        <Text style='font-size: 20rpx; color: #9B8ECC; display: block;'>{label}</Text>
                        <Text style='font-size: 26rpx; font-weight: 600; color: #3D2D8A; overflow: hidden;' numberOfLines={1}>{hotel ? hotel.name : '未选择酒店'}</Text>
                      </View>
                    </View>
                  )

                  const renderTransitRow = (fromLat: number, fromLng: number, toLat: number, toLng: number) => {
                    const t = estimateTransport(fromLat, fromLng, toLat, toLng)
                    return (
                      <View style='display: flex; flex-direction: row; align-items: center; padding: 10rpx 28rpx;'>
                        <View style='width: 2rpx; height: 32rpx; background: #E7E0D8; margin-left: 23rpx; flex-shrink: 0;' />
                        <View style='flex: 1; background: #F5F0EB; border-radius: 20rpx; padding: 10rpx 20rpx; display: flex; flex-direction: row; align-items: center; margin-left: 16rpx;'>
                          <Text style='font-size: 24rpx; margin-right: 8rpx;'>{t.emoji}</Text>
                          <Text style='font-size: 22rpx; color: #7A7068;'>{t.label} 约{t.time}</Text>
                          {t.cost ? <Text style='font-size: 22rpx; color: #E8735A; margin-left: auto;'>{t.cost}</Text> : null}
                        </View>
                      </View>
                    )
                  }

                  return (
                    <ScrollView scrollY style='height: calc(100vh - 800rpx); padding: 0 32rpx;'>
                      {/* 出发酒店 */}
                      {renderHotelNode(startHotelForDay, previewDayIdx === 0 ? '出发酒店' : '从昨晚酒店出发')}

                      {/* 出发酒店→第一个POI的交通 */}
                      {dayPois.length > 0 && startHotelForDay?.lat && dayPois[0].poi?.lat && (
                        renderTransitRow(startHotelForDay.lat, startHotelForDay.lng, dayPois[0].poi!.lat, dayPois[0].poi!.lng)
                      )}

                      {dayPois.map((x, idx) => {
                        const poi = x.poi!
                        const item = x.item
                        const nextPoi = idx < dayPois.length - 1 ? dayPois[idx + 1].poi : null
                        const transport = (poi.lat && poi.lng && nextPoi?.lat && nextPoi?.lng)
                          ? estimateTransport(poi.lat, poi.lng, nextPoi.lat, nextPoi.lng)
                          : null
                        const mealTag = getMealSlotTag(item.mealSlot)

                        return (
                          <View key={poi.id}>
                            {/* POI 富信息卡片 */}
                            <View style={`background: ${mealTag ? '#FFFDF5' : '#fff'}; border-radius: 20rpx; border: 1rpx solid ${mealTag ? '#FDDCB5' : '#E7E0D8'}; overflow: hidden; margin-bottom: 0;`}>
                              {/* 序号+时间+餐类标签 */}
                              <View style='background: linear-gradient(90deg, #E8735A10, transparent); padding: 14rpx 24rpx; display: flex; flex-direction: row; align-items: center; border-bottom: 1rpx solid #F5F0EB;'>
                                <View style={`width: 40rpx; height: 40rpx; background: ${mealTag ? mealTag.color : '#E8735A'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 12rpx;`}>
                                  <Text style='font-size: 20rpx; color: #fff; font-weight: 700;'>{idx + 1}</Text>
                                </View>
                                {mealTag && (
                                  <View style={`background: ${mealTag.bg}; border-radius: 20rpx; padding: 4rpx 16rpx; flex-shrink: 0; margin-right: 12rpx;`}>
                                    <Text style={`font-size: 20rpx; font-weight: 700; color: ${mealTag.color};`}>{mealTag.label}</Text>
                                  </View>
                                )}
                                <Text style='font-size: 24rpx; color: #7A7068; flex: 1;'>{item.startTime} — {item.endTime}</Text>
                                {item.isAutoFilled && (
                                  <View style='background: #EDE9FF; border-radius: 20rpx; padding: 4rpx 14rpx; flex-shrink: 0;'>
                                    <Text style='font-size: 18rpx; color: #7B68EE;'>✨ AI推荐</Text>
                                  </View>
                                )}
                              </View>
                              {/* 卡片内容 */}
                              <View style='display: flex; flex-direction: row;'>
                                {/* 图片/图标 */}
                                <View style='width: 180rpx; background: linear-gradient(135deg, #E8735A25, #E8735A10); display: flex; align-items: center; justify-content: center; font-size: 56rpx; flex-shrink: 0;'>
                                  {poi.image ? (
                                    <Image src={poi.image} style='width: 180rpx; height: 180rpx; object-fit: cover;' mode='aspectFill' />
                                  ) : (
                                    typeEmoji[poi.type] || '📍'
                                  )}
                                </View>
                                {/* 信息区 */}
                                <View style='flex: 1; padding: 20rpx;'>
                                  <Text style='font-size: 28rpx; font-weight: 700; color: #2D2420; display: block; margin-bottom: 4rpx;'>{poi.name}</Text>
                                  {poi.nameLocal && poi.nameLocal !== poi.name && (
                                    <Text style='font-size: 22rpx; color: #7A7068; display: block; margin-bottom: 8rpx;'>{poi.nameLocal}</Text>
                                  )}
                                  <View style='display: flex; flex-direction: row; flex-wrap: wrap; margin-bottom: 10rpx;'>
                                    <Text style='font-size: 22rpx; color: #F5A623; background: #FFF8E7; padding: 4rpx 12rpx; border-radius: 12rpx; margin-right: 8rpx; margin-bottom: 6rpx;'>⭐ {poi.rating?.toFixed(1)}</Text>
                                    <Text style='font-size: 22rpx; color: #7A7068; background: #F5F0EB; padding: 4rpx 12rpx; border-radius: 12rpx; margin-right: 8rpx; margin-bottom: 6rpx;'>⏱ {poi.duration >= 60 ? Math.floor(poi.duration / 60) + 'h' : poi.duration + 'm'}</Text>
                                    <Text style='font-size: 22rpx; color: #7A7068; background: #F5F0EB; padding: 4rpx 12rpx; border-radius: 12rpx; margin-right: 8rpx; margin-bottom: 6rpx;'>{poi.cost === 0 ? '🆓 免费' : `¥${poi.cost}`}</Text>
                                    {poi.seasonalIndex !== undefined && (
                                      <Text style='font-size: 22rpx; color: #4CAF50; background: #E8F5E9; padding: 4rpx 12rpx; border-radius: 12rpx; margin-bottom: 6rpx;'>🌿 当季{Math.round(poi.seasonalIndex * 10)}</Text>
                                    )}
                                  </View>
                                  {poi.recommendReason && (
                                    <Text style='font-size: 22rpx; color: #E8735A; display: block; margin-bottom: 8rpx;' numberOfLines={2}>💡 {poi.recommendReason}</Text>
                                  )}
                                  {poi.openTime && (
                                    <Text style='font-size: 20rpx; color: #7A7068; display: block; margin-bottom: 8rpx;'>🕐 {poi.openTime}{poi.closeTime ? ` - ${poi.closeTime}` : ''}</Text>
                                  )}
                                  {poi.tags && poi.tags.length > 0 && (
                                    <View style='display: flex; flex-direction: row; flex-wrap: wrap;'>
                                      {poi.tags.slice(0, 3).map(tag => (
                                        <View key={tag} style='background: #F5F0EB; border-radius: 16rpx; padding: 4rpx 14rpx; margin-right: 8rpx; margin-bottom: 4rpx;'>
                                          <Text style='font-size: 20rpx; color: #7A7068;'>{tag}</Text>
                                        </View>
                                      ))}
                                    </View>
                                  )}
                                </View>
                              </View>
                            </View>

                            {/* 交通段（POI之间） */}
                            {transport && (
                              <View style='display: flex; flex-direction: row; align-items: center; padding: 10rpx 28rpx;'>
                                <View style='width: 2rpx; height: 32rpx; background: #E7E0D8; margin-left: 19rpx; flex-shrink: 0;' />
                                <View style='flex: 1; background: #F5F0EB; border-radius: 20rpx; padding: 10rpx 20rpx; display: flex; flex-direction: row; align-items: center; margin-left: 16rpx;'>
                                  <Text style='font-size: 24rpx; margin-right: 8rpx;'>{transport.emoji}</Text>
                                  <Text style='font-size: 22rpx; color: #7A7068; font-weight: 500;'>{transport.label}</Text>
                                  <Text style='font-size: 22rpx; color: #7A7068; margin-left: 8rpx;'>约{transport.time}</Text>
                                  {transport.cost && <Text style='font-size: 22rpx; color: #E8735A; margin-left: auto;'>{transport.cost}</Text>}
                                </View>
                              </View>
                            )}
                          </View>
                        )
                      })}

                      {/* 最后一个POI→当晚酒店的交通 */}
                      {dayPois.length > 0 && endHotelForDay?.lat && dayPois[dayPois.length-1].poi?.lat && (
                        renderTransitRow(
                          dayPois[dayPois.length-1].poi!.lat,
                          dayPois[dayPois.length-1].poi!.lng,
                          endHotelForDay.lat,
                          endHotelForDay.lng,
                        )
                      )}

                      {/* 当晚入住酒店 */}
                      {renderHotelNode(endHotelForDay, '当晚入住酒店')}

                      {dayPois.length === 0 && (
                        <View style='text-align: center; padding: 64rpx; color: #C0B8B0;'><Text>当天暂无安排</Text></View>
                      )}
                      {/* 底部安全间距，防止被按钮遮挡 */}
                      <View style='height: 40rpx;' />
                    </ScrollView>
                  )
                })()}
              </View>
            )}
          </View>
        )}


        {/* ══════════════════ 步骤7：保存行程 ══════════════════ */}
        {step === 7 && trip && (
          <View style='padding: 32rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh;'>
            <View style='font-size: 100rpx; text-align: center; margin-bottom: 32rpx;'>🎉</View>
            <Text style='font-size: 40rpx; font-weight: 700; color: #2D2420; display: block; margin-bottom: 16rpx; text-align: center;'>行程规划完成！</Text>
            <Text style='font-size: 26rpx; color: #7A7068; display: block; margin-bottom: 48rpx; text-align: center;'>点击保存，你的{trip.cityName}行程将保存到「我的行程」</Text>
            <View style='background: #fff; border-radius: 20rpx; border: 1rpx solid #E7E0D8; padding: 32rpx; width: 100%; margin-bottom: 40rpx;'>
              <View style='display: flex; justify-content: space-between; margin-bottom: 20rpx;'>
                <Text style='font-size: 26rpx; color: #7A7068;'>目的地</Text>
                <Text style='font-size: 26rpx; color: #2D2420; font-weight: 600;'>{trip.cityName}</Text>
              </View>
              <View style='display: flex; justify-content: space-between; margin-bottom: 20rpx;'>
                <Text style='font-size: 26rpx; color: #7A7068;'>出发日期</Text>
                <Text style='font-size: 26rpx; color: #2D2420; font-weight: 600;'>{formatDate(trip.startDate)}</Text>
              </View>
              <View style='display: flex; justify-content: space-between; margin-bottom: 20rpx;'>
                <Text style='font-size: 26rpx; color: #7A7068;'>行程天数</Text>
                <Text style='font-size: 26rpx; color: #2D2420; font-weight: 600;'>{trip.days.length} 天</Text>
              </View>
              {trip.totalBudget > 0 && (
                <View style='display: flex; justify-content: space-between;'>
                  <Text style='font-size: 26rpx; color: #7A7068;'>预计费用</Text>
                  <Text style='font-size: 26rpx; color: #E8735A; font-weight: 700;'>¥{trip.totalBudget}</Text>
                </View>
              )}
            </View>
            <View
              onClick={handleSave}
              style='width: 100%; padding: 32rpx; border-radius: 24rpx; text-align: center; background: linear-gradient(135deg, #E8735A, #D4553D);'
            >
              <Text style='font-size: 32rpx; font-weight: 700; color: #fff;'>{saving ? '保存中...' : '💾 保存行程'}</Text>
            </View>
          </View>
        )}

      </View>{/* /step-body */}

      {/* ══════════════════ 底部导航 ══════════════════ */}
      {step !== 5 && (
        <View className='step-nav-bar'>
          {step > 1 && step !== 6 && (
            <View className='step-nav-btn step-nav-prev' onClick={handlePrev}>
              <Text>← 上一步</Text>
            </View>
          )}
          {/* 步骤6：左"返回修改" + 右"保存行程" */}
          {step === 6 ? (
            <>
              <View className='step-nav-btn step-nav-prev' onClick={handlePrev}>
                <Text>← 返回修改</Text>
              </View>
              <View className='step-nav-btn step-nav-next' onClick={handleSave}>
                <Text>{saving ? '保存中...' : '💾 保存行程'}</Text>
              </View>
            </>
          ) : step < TOTAL_STEPS && step !== 6 ? (
            <View
              className={`step-nav-btn ${canNext ? 'step-nav-next' : 'step-nav-next-disabled'}`}
              onClick={canNext ? handleNext : undefined}
            >
              <Text>{step === 4 ? '智能规划路线 →' : '下一步 →'}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* 剔除确认弹窗 */}
      {removeConfirmPoi && (
        <View style='position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 0 48rpx;'>
          <View style='background: #fff; border-radius: 24rpx; padding: 40rpx 32rpx; width: 100%;'>
            <Text style='font-size: 32rpx; font-weight: 700; color: #2D2420; display: block; margin-bottom: 16rpx; text-align: center;'>确认剔除</Text>
            <Text style='font-size: 26rpx; color: #7A7068; display: block; text-align: center; margin-bottom: 32rpx;'>剔除「{removeConfirmPoi.name}」后将重新规划行程，确认剔除吗？</Text>
            <View style='display: flex; flex-direction: row;'>
              <View
                onClick={() => setRemoveConfirmPoi(null)}
                style='flex: 1; padding: 26rpx; border-radius: 16rpx; background: #F5F0EB; text-align: center; margin-right: 16rpx;'
              >
                <Text style='font-size: 28rpx; font-weight: 600; color: #7A7068;'>取消</Text>
              </View>
              <View
                onClick={handleConfirmRemovePoi}
                style='flex: 1; padding: 26rpx; border-radius: 16rpx; background: linear-gradient(135deg, #E8735A, #D4553D); text-align: center;'
              >
                <Text style='font-size: 28rpx; font-weight: 600; color: #fff;'>确认剔除</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
