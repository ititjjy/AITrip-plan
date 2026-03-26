import { useState, useMemo, useCallback, useEffect } from 'react'
import { useApp } from '@/context/AppContext'
import { popularCities } from '@/data/mock-data'
import { Button } from '@/components/ui/button'
import { Trip } from '@/types'
import {
  ArrowLeft, Search, MapPin, Calendar, Check,
  ArrowRight, X, Plane, Clock, Wallet, Sun, Sparkles,
  Minus, Plus, AlertCircle
} from 'lucide-react'

const MAX_DAYS = 30

const QUICK_DURATIONS = [
  { label: '短途', days: 3, emoji: '⚡' },
  { label: '小长假', days: 5, emoji: '🌿' },
  { label: '深度游', days: 7, emoji: '🗺️' },
  { label: '慢旅行', days: 10, emoji: '🌊' },
  { label: '长假', days: 14, emoji: '✈️' },
]

const citySeasonTips: Record<string, { bestSeason: string; weather: string; tip: string }> = {
  tokyo: { bestSeason: '3-5月 / 10-11月', weather: '春季赏樱，秋季赏红叶', tip: '建议购买东京地铁通票，出行更方便' },
  paris: { bestSeason: '4-6月 / 9-10月', weather: '温和舒适，适合步行游览', tip: '提前预约热门景点门票，避免排队' },
  bali: { bestSeason: '4-10月', weather: '旱季少雨，阳光充沛', tip: '建议包车游览，灵活自由' },
  kyoto: { bestSeason: '3-5月 / 10-11月', weather: '四季分明，春秋最宜', tip: '推荐体验和服漫步祇园' },
  santorini: { bestSeason: '5-9月', weather: '地中海气候，晴朗温暖', tip: '提前预订悬崖酒店，旺季一房难求' },
  bangkok: { bestSeason: '11-2月', weather: '凉季少雨，气温宜人', tip: '注意防晒和补水，尝试当地夜市' },
}

/* ── Helpers ── */

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

function diffDays(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `${d.getMonth() + 1}月${d.getDate()}日 周${weekdays[d.getDay()]}`
}

/* ── Component ── */

export default function CreateTripPage() {
  const { state, dispatch } = useApp()
  const [step, setStep] = useState<1 | 2>(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null)

  /* ── Pre-selected city from homepage ── */
  useEffect(() => {
    if (state.preSelectedCityId) {
      const cityExists = popularCities.some(c => c.id === state.preSelectedCityId)
      if (cityExists) {
        setSelectedCityId(state.preSelectedCityId)
        setStep(2)
      }
      dispatch({ type: 'PRE_SELECT_CITY', payload: null })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Date state: D+1 default
  const tomorrow = useMemo(() => addDays(toDateStr(new Date()), 1), [])
  const todayStr = useMemo(() => toDateStr(new Date()), [])

  const [startDate, setStartDate] = useState(tomorrow)
  const [endDate, setEndDate] = useState(tomorrow) // default: 1 day trip
  const [selectedDays, setSelectedDays] = useState(1) // tracks chosen travel days

  // Derived day count from actual dates (always correct)
  const dayCount = useMemo(() => {
    if (!startDate || !endDate) return 0
    const d = diffDays(startDate, endDate)
    return d > 0 ? d : 0
  }, [startDate, endDate])

  const isDateValid = useMemo(() => {
    return startDate && endDate && dayCount >= 1 && dayCount <= MAX_DAYS
  }, [startDate, endDate, dayCount])

  /* ── When user picks travel days (quick or stepper) ── */
  const handleSetDays = useCallback((days: number) => {
    const clamped = Math.max(1, Math.min(MAX_DAYS, days))
    setSelectedDays(clamped)
    // Auto-fill end date based on start + days
    setEndDate(addDays(startDate, clamped - 1))
  }, [startDate])

  /* ── When user changes start date ── */
  const handleStartDateChange = useCallback((newStart: string) => {
    setStartDate(newStart)
    // Keep previously chosen days, auto-update end date
    setEndDate(addDays(newStart, selectedDays - 1))
  }, [selectedDays])

  /* ── When user changes end date manually ── */
  const handleEndDateChange = useCallback((newEnd: string) => {
    // Clamp: end >= start, max 30 days
    if (new Date(newEnd) < new Date(startDate)) {
      // Don't allow end before start
      return
    }
    const newDays = diffDays(startDate, newEnd)
    if (newDays > MAX_DAYS) {
      // Cap at 30 days
      const capped = addDays(startDate, MAX_DAYS - 1)
      setEndDate(capped)
      setSelectedDays(MAX_DAYS)
      return
    }
    setEndDate(newEnd)
    setSelectedDays(newDays)
  }, [startDate])

  // Max end date based on start + 30 days
  const maxEndDate = useMemo(() => {
    if (!startDate) return ''
    return addDays(startDate, MAX_DAYS - 1)
  }, [startDate])

  const filteredCities = useMemo(() => {
    if (!searchQuery.trim()) return popularCities
    const q = searchQuery.toLowerCase()
    return popularCities.filter(
      (c) =>
        c.name.includes(q) ||
        c.nameEn.toLowerCase().includes(q) ||
        c.country.includes(q) ||
        c.tags.some((t) => t.includes(q))
    )
  }, [searchQuery])

  const selectedCity = popularCities.find((c) => c.id === selectedCityId)

  const handleCreateTrip = () => {
    if (!selectedCity || !isDateValid) return
    const trip: Trip = {
      id: `trip-${Date.now()}`,
      cityId: selectedCity.id,
      cityName: selectedCity.name,
      startDate,
      endDate,
      days: [],
      totalBudget: 0,
      createdAt: new Date().toISOString(),
    }
    dispatch({ type: 'CREATE_TRIP', payload: trip })
  }

  const seasonTip = selectedCityId ? citySeasonTips[selectedCityId] : null

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              step === 2
                ? setStep(1)
                : dispatch({ type: 'SET_VIEW', payload: 'home' })
            }
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {step === 2 ? '返回选择' : '返回首页'}
          </Button>

          {/* Step Indicator */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-500 ${
                step > 1
                  ? 'gradient-hero text-primary-foreground scale-90'
                  : step === 1
                  ? 'gradient-hero text-primary-foreground shadow-elegant'
                  : 'bg-secondary text-muted-foreground'
              }`}>
                {step > 1 ? <Check className="h-4 w-4" /> : '1'}
              </div>
              <span className={`hidden text-sm font-medium transition-colors sm:block ${
                step >= 1 ? 'text-foreground' : 'text-muted-foreground'
              }`}>
                选择目的地
              </span>
            </div>

            <div className="relative h-0.5 w-12 overflow-hidden rounded-full bg-border">
              <div
                className="absolute inset-y-0 left-0 gradient-hero rounded-full transition-all duration-700 ease-out"
                style={{ width: step >= 2 ? '100%' : '0%' }}
              />
            </div>

            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-500 ${
                step >= 2
                  ? 'gradient-hero text-primary-foreground shadow-elegant'
                  : 'bg-secondary text-muted-foreground'
              }`}>
                2
              </div>
              <span className={`hidden text-sm font-medium transition-colors sm:block ${
                step >= 2 ? 'text-foreground' : 'text-muted-foreground'
              }`}>
                选择日期
              </span>
            </div>
          </div>

          <div className="w-24" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* ===== STEP 1: Destination Selection ===== */}
        {step === 1 && (
          <div className="animate-fade-in">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full bg-coral-light px-4 py-1.5 text-xs font-semibold text-coral-dark">
                <Plane className="h-3.5 w-3.5" />
                第一步 · 选择你的目的地
              </div>
              <h1 className="mb-2 text-3xl font-bold text-foreground sm:text-4xl">你想去哪里？</h1>
              <p className="text-muted-foreground">从热门目的地中选择，或搜索你心仪的城市</p>
            </div>

            <div className="relative mx-auto mb-10 max-w-lg">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索城市、国家或标签..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 w-full rounded-2xl border border-input bg-card pl-12 pr-10 text-foreground shadow-card placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-smooth"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-smooth"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCities.map((city, index) => (
                <button
                  key={city.id}
                  onClick={() => {
                    setSelectedCityId(city.id)
                    setStep(2)
                  }}
                  className={`group relative overflow-hidden rounded-2xl border-2 text-left transition-all duration-300 hover:-translate-y-1 animate-fade-in ${
                    selectedCityId === city.id
                      ? 'border-primary shadow-elegant'
                      : 'border-transparent shadow-card hover:shadow-card-hover'
                  }`}
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <div className="relative h-44 overflow-hidden">
                    <img
                      src={city.image}
                      alt={city.name}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-foreground/10 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-primary-foreground">{city.name}</h3>
                        <span className="text-xs text-primary-foreground/70">{city.nameEn}</span>
                      </div>
                      <p className="flex items-center gap-1 text-xs text-primary-foreground/80">
                        <MapPin className="h-3 w-3" />
                        {city.country}
                      </p>
                    </div>
                    {selectedCityId === city.id && (
                      <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full gradient-hero animate-scale-in">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                    <div className="absolute right-3 top-3 rounded-full glass px-2.5 py-0.5 text-[10px] font-semibold text-foreground">
                      ¥{city.avgDailyBudget}/天
                    </div>
                  </div>
                  <div className="bg-card p-4">
                    <p className="mb-3 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                      {city.description}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {city.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {filteredCities.length === 0 && (
              <div className="py-20 text-center animate-fade-in">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
                  <MapPin className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <p className="text-foreground font-medium">没有找到匹配的城市</p>
                <p className="mt-1 text-sm text-muted-foreground">试试其他关键词，如 "日本"、"海滩"、"美食"</p>
              </div>
            )}
          </div>
        )}

        {/* ===== STEP 2: Date Selection ===== */}
        {step === 2 && selectedCity && (
          <div className="animate-fade-in">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full bg-coral-light px-4 py-1.5 text-xs font-semibold text-coral-dark">
                <Calendar className="h-3.5 w-3.5" />
                第二步 · 选择旅行日期
              </div>
              <h1 className="mb-2 text-3xl font-bold text-foreground sm:text-4xl">
                什么时候出发去<span className="gradient-text">{selectedCity.name}</span>？
              </h1>
              <p className="text-muted-foreground">选择出发日期和游玩天数，系统自动计算返回日期</p>
            </div>

            <div className="mx-auto max-w-xl">
              {/* Selected City Banner */}
              <div className="mb-8 overflow-hidden rounded-2xl shadow-card">
                <div className="relative h-40">
                  <img
                    src={selectedCity.image}
                    alt={selectedCity.name}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-foreground/20 to-transparent" />
                  <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-primary-foreground">{selectedCity.name}</h3>
                      <p className="flex items-center gap-1 text-sm text-primary-foreground/80">
                        <MapPin className="h-3.5 w-3.5" />
                        {selectedCity.country} · {selectedCity.nameEn}
                      </p>
                    </div>
                    <button
                      onClick={() => setStep(1)}
                      className="rounded-full glass px-3 py-1.5 text-xs font-medium text-foreground transition-smooth hover:bg-card"
                    >
                      更换城市
                    </button>
                  </div>
                </div>
              </div>

              {/* Travel Tips Card */}
              {seasonTip && (
                <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-card animate-fade-in">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    旅行小贴士
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
                      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                        <Sun className="h-3 w-3" />
                        最佳旅行季节
                      </div>
                      <p className="text-xs font-semibold text-foreground">{seasonTip.bestSeason}</p>
                    </div>
                    <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
                      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                        <Wallet className="h-3 w-3" />
                        日均预算
                      </div>
                      <p className="text-xs font-semibold text-foreground">¥{selectedCity.avgDailyBudget}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    💡 {seasonTip.tip}
                  </p>
                </div>
              )}

              {/* ── Start Date ── */}
              <div className="mb-5">
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md gradient-hero">
                    <Plane className="h-3 w-3 text-primary-foreground" />
                  </div>
                  出发日期
                  <span className="ml-auto text-[10px] text-muted-foreground font-normal">
                    默认为明天
                  </span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  min={todayStr}
                  className="h-12 w-full rounded-xl border border-input bg-card px-4 text-foreground shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-smooth"
                />
              </div>

              {/* ── Travel Days Selector ── */}
              <div className="mb-5">
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10">
                    <Clock className="h-3 w-3 text-primary" />
                  </div>
                  游玩天数
                  <span className="ml-auto text-[10px] text-muted-foreground font-normal">
                    最多 {MAX_DAYS} 天
                  </span>
                </label>

                {/* Quick Chips */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {QUICK_DURATIONS.map((d) => (
                    <button
                      key={d.days}
                      onClick={() => handleSetDays(d.days)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 ${
                        selectedDays === d.days
                          ? 'border-primary bg-coral-light text-coral-dark shadow-elegant'
                          : 'border-border bg-card text-foreground hover:border-primary/30 hover:shadow-card'
                      }`}
                    >
                      <span>{d.emoji}</span>
                      <span className="font-bold">{d.days}</span>天{d.label}
                    </button>
                  ))}
                </div>

                {/* Stepper */}
                <div className="flex items-center justify-between rounded-xl border border-input bg-card px-4 py-2.5 shadow-card">
                  <button
                    onClick={() => handleSetDays(selectedDays - 1)}
                    disabled={selectedDays <= 1}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground transition-smooth hover:bg-secondary/80 disabled:opacity-30"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="text-center">
                    <span className="text-3xl font-bold text-foreground">{selectedDays}</span>
                    <span className="ml-1 text-sm text-muted-foreground">天</span>
                    {selectedDays > 1 && (
                      <span className="ml-2 text-xs text-muted-foreground">{selectedDays - 1}晚</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleSetDays(selectedDays + 1)}
                    disabled={selectedDays >= MAX_DAYS}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground transition-smooth hover:bg-secondary/80 disabled:opacity-30"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* ── End Date ── */}
              <div className="mb-5">
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md gradient-sunset">
                    <Plane className="h-3 w-3 text-primary-foreground rotate-90" />
                  </div>
                  返回日期
                  <span className="ml-auto text-[10px] text-muted-foreground font-normal">
                    由天数自动计算，也可手动修改
                  </span>
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  min={startDate || todayStr}
                  max={maxEndDate}
                  className="h-12 w-full rounded-xl border border-input bg-card px-4 text-foreground shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-smooth"
                />
              </div>

              {/* Validation hint */}
              {dayCount > MAX_DAYS && (
                <div className="mb-4 flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  单次行程最多 {MAX_DAYS} 天，请调整日期
                </div>
              )}

              {/* Trip Summary */}
              {dayCount > 0 && dayCount <= MAX_DAYS && (
                <div className="overflow-hidden rounded-2xl border border-border shadow-card animate-scale-in">
                  <div className="gradient-warm p-5">
                    <div className="mb-3 text-center">
                      <p className="text-xs font-medium text-muted-foreground">你的旅行计划</p>
                      <p className="mt-1 text-2xl font-bold text-foreground">
                        {selectedCity.name} · {dayCount}天{dayCount > 1 ? `${dayCount - 1}晚` : ''}
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-4 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Plane className="h-3.5 w-3.5 text-primary" />
                        <span className="font-medium text-foreground">{formatDate(startDate)}</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-primary" />
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Plane className="h-3.5 w-3.5 text-primary rotate-90" />
                        <span className="font-medium text-foreground">{formatDate(endDate)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-border bg-card">
                    <div className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        旅行天数
                      </div>
                      <p className="mt-0.5 text-lg font-bold text-foreground">{dayCount}<span className="text-xs font-normal text-muted-foreground"> 天</span></p>
                    </div>
                    <div className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                        <Wallet className="h-3 w-3" />
                        预估费用
                      </div>
                      <p className="mt-0.5 text-lg font-bold text-foreground">¥{(dayCount * selectedCity.avgDailyBudget).toLocaleString()}</p>
                    </div>
                    <div className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        日均预算
                      </div>
                      <p className="mt-0.5 text-lg font-bold text-foreground">¥{selectedCity.avgDailyBudget}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* CTA Button */}
              <div className="mt-8 pb-8">
                <Button
                  variant="coral"
                  size="xl"
                  className="w-full group"
                  disabled={!isDateValid}
                  onClick={handleCreateTrip}
                >
                  开始规划行程
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
                {!isDateValid && startDate && endDate && dayCount < 1 && (
                  <p className="mt-2 text-center text-xs text-destructive">返回日期不能早于出发日期</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
