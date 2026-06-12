import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { popularCities } from '@/data/mock-data'
import { Button } from '@/components/ui/button'
import DayTimeline from '@/components/DayTimeline'
import AttractionsPanel from '@/components/AttractionsPanel'
import BudgetPanel from '@/components/BudgetPanel'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Eye,
  PanelRightOpen, PanelRightClose, Compass, Wallet,
  Plus, X, Save, Loader2, Check
} from 'lucide-react'
import { useState, useCallback } from 'react'

export default function PlannerPage() {
  const { state, dispatch } = useApp()
  const { requireAuth, getAuthHeaders } = useAuth()
  const [showPanel, setShowPanel] = useState(false) // default closed on mobile
  const [sideTab, setSideTab] = useState<'attractions' | 'budget'>('attractions')
  const [mobileSheet, setMobileSheet] = useState<'attractions' | 'budget' | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const trip = state.currentTrip

  const doSaveTrip = useCallback(async () => {
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
        // 保存成功后自动跳转到行程总览页
        setTimeout(() => {
          dispatch({ type: 'SET_VIEW', payload: 'overview' })
        }, 600)
      }
    } catch { /* ignore */ }
    setSaving(false)
  }, [trip, getAuthHeaders, dispatch])

  const handleSaveTrip = useCallback(async () => {
    if (!trip) return
    if (!requireAuth('保存行程需要先登录', doSaveTrip)) return
    await doSaveTrip()
  }, [trip, requireAuth, doSaveTrip])

  if (!trip) return null

  const city = popularCities.find((c) => c.id === trip.cityId)

  return (
    <div className="flex h-[100svh] flex-col bg-background">
      {/* Top Bar */}
      <header className="z-50 flex h-12 items-center justify-between border-b border-border bg-card px-3 sm:h-14 sm:px-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 sm:px-3"
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'place-selection' })}
          >
            <ArrowLeft className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">上一步</span>
          </Button>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2 min-w-0">
            {city && (
              <img
                src={city.image}
                alt={city.name}
                className="h-6 w-6 rounded-md object-cover sm:h-7 sm:w-7"
              />
            )}
            <div className="min-w-0">
              <h1 className="text-xs font-semibold text-foreground leading-tight truncate sm:text-sm">
                {trip.cityName}之旅
              </h1>
              <p className="text-[9px] text-muted-foreground truncate sm:text-[10px]">
                {new Date(trip.startDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                {' - '}
                {new Date(trip.endDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                {' · '}
                {trip.days.length}天
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-1 rounded-lg bg-secondary px-3 py-1.5 text-xs md:flex">
            <Wallet className="h-3 w-3 text-primary" />
            <span className="text-muted-foreground">总计</span>
            <span className="font-semibold text-foreground">¥{trip.totalBudget.toLocaleString()}</span>
          </div>
          {/* Mobile: show budget badge */}
          <div className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-1 text-[10px] md:hidden">
            <Wallet className="h-3 w-3 text-primary" />
            <span className="font-semibold text-foreground">¥{trip.totalBudget.toLocaleString()}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs sm:px-3 sm:text-sm"
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'overview' })}
          >
            <Eye className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">总览</span>
          </Button>
          <Button
            variant={saved ? 'default' : 'outline'}
            size="sm"
            className={`h-8 px-2 text-xs sm:px-3 sm:text-sm transition-smooth ${saved ? 'bg-emerald-600 hover:bg-emerald-600 text-white border-emerald-600' : ''}`}
            onClick={handleSaveTrip}
            disabled={saving || saved}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" />
            ) : saved ? (
              <Check className="h-3.5 w-3.5 sm:mr-1" />
            ) : (
              <Save className="h-3.5 w-3.5 sm:mr-1" />
            )}
            <span className="hidden sm:inline">{saving ? '保存中' : saved ? '已保存' : '保存'}</span>
          </Button>
          {/* Desktop panel toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 lg:flex"
            onClick={() => setShowPanel(!showPanel)}
          >
            {showPanel ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Day Selector - horizontal on mobile, vertical on desktop */}
        {/* Mobile: horizontal day strip */}
        <div className="flex flex-col flex-1 overflow-hidden md:flex-row">
          {/* Mobile horizontal day selector */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2 md:hidden scrollbar-hide">
            {trip.days.map((day, idx) => {
              const isActive = idx === state.selectedDayIndex
              const hasItems = day.items.length > 0
              return (
                <button
                  key={day.id}
                  onClick={() => dispatch({ type: 'SELECT_DAY', payload: idx })}
                  className={`flex flex-shrink-0 flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-all duration-200 ${
                    isActive
                      ? 'gradient-hero text-primary-foreground shadow-elegant'
                      : 'text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  <span className="text-[9px] font-medium">
                    {new Date(day.date).toLocaleDateString('zh-CN', { weekday: 'short' })}
                  </span>
                  <span className={`text-base font-bold ${isActive ? '' : 'text-foreground'}`}>
                    {new Date(day.date).getDate()}
                  </span>
                  {hasItems && (
                    <span className={`text-[8px] ${isActive ? 'text-primary-foreground/80' : 'text-primary'}`}>
                      {day.items.length}项
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Desktop: vertical day selector */}
            <aside className="hidden w-16 flex-col items-center border-r border-border bg-card py-3 md:flex md:w-20">
              <div className="mb-3 flex flex-col items-center gap-1">
                <button
                  onClick={() => {
                    if (state.selectedDayIndex > 0) {
                      dispatch({ type: 'SELECT_DAY', payload: state.selectedDayIndex - 1 })
                    }
                  }}
                  disabled={state.selectedDayIndex === 0}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary disabled:opacity-30 transition-smooth"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
                {trip.days.map((day, idx) => {
                  const isActive = idx === state.selectedDayIndex
                  const hasItems = day.items.length > 0
                  return (
                    <button
                      key={day.id}
                      onClick={() => dispatch({ type: 'SELECT_DAY', payload: idx })}
                      className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 transition-all duration-200 ${
                        isActive
                          ? 'gradient-hero text-primary-foreground shadow-elegant'
                          : 'text-muted-foreground hover:bg-secondary'
                      }`}
                    >
                      <span className="text-[10px] font-medium">
                        {new Date(day.date).toLocaleDateString('zh-CN', { weekday: 'short' })}
                      </span>
                      <span className={`text-lg font-bold ${isActive ? '' : 'text-foreground'}`}>
                        {new Date(day.date).getDate()}
                      </span>
                      {hasItems && !isActive && (
                        <div className="h-1 w-1 rounded-full bg-primary" />
                      )}
                      {hasItems && isActive && (
                        <span className="text-[9px]">{day.items.length}项</span>
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="mt-3 flex flex-col items-center gap-1">
                <button
                  onClick={() => {
                    if (state.selectedDayIndex < trip.days.length - 1) {
                      dispatch({ type: 'SELECT_DAY', payload: state.selectedDayIndex + 1 })
                    }
                  }}
                  disabled={state.selectedDayIndex >= trip.days.length - 1}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary disabled:opacity-30 transition-smooth"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </aside>

            {/* Main Timeline Area */}
            <DayTimeline />

            {/* Desktop Right Panel */}
            {showPanel && (
              <aside className="hidden w-[340px] flex-col border-l border-border lg:flex">
                <div className="flex border-b border-border">
                  <button
                    onClick={() => setSideTab('attractions')}
                    className={`flex-1 py-3 text-xs font-medium transition-smooth ${
                      sideTab === 'attractions'
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Compass className="mx-auto mb-1 h-4 w-4" />
                    景点推荐
                  </button>
                  <button
                    onClick={() => setSideTab('budget')}
                    className={`flex-1 py-3 text-xs font-medium transition-smooth ${
                      sideTab === 'budget'
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Wallet className="mx-auto mb-1 h-4 w-4" />
                    预算管理
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {sideTab === 'attractions' ? (
                    <AttractionsPanel onClose={() => setShowPanel(false)} />
                  ) : (
                    <div className="p-4">
                      <BudgetPanel />
                    </div>
                  )}
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Action Bar */}
      <div className="flex items-center justify-around border-t border-border bg-card px-2 py-2 safe-bottom lg:hidden">
        <button
          onClick={() => setMobileSheet(mobileSheet === 'attractions' ? null : 'attractions')}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-4 py-1.5 text-[10px] font-medium transition-smooth ${
            mobileSheet === 'attractions' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Plus className="h-5 w-5" />
          添加景点
        </button>
        <button
          onClick={() => setMobileSheet(mobileSheet === 'budget' ? null : 'budget')}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-4 py-1.5 text-[10px] font-medium transition-smooth ${
            mobileSheet === 'budget' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Wallet className="h-5 w-5" />
          预算
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_VIEW', payload: 'overview' })}
          className="flex flex-col items-center gap-0.5 rounded-lg px-4 py-1.5 text-[10px] font-medium text-muted-foreground transition-smooth"
        >
          <Eye className="h-5 w-5" />
          总览
        </button>
        <button
          onClick={handleSaveTrip}
          disabled={saving || saved}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-4 py-1.5 text-[10px] font-medium transition-smooth ${
            saved ? 'text-emerald-600' : saving ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : saved ? <Check className="h-5 w-5" /> : <Save className="h-5 w-5" />}
          {saving ? '保存中' : saved ? '已保存' : '保存'}
        </button>
      </div>

      {/* Mobile Bottom Sheet */}
      {mobileSheet && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-foreground/30"
            onClick={() => setMobileSheet(null)}
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 max-h-[75svh] overflow-hidden rounded-t-2xl bg-card shadow-float animate-slide-up">
            {/* Handle */}
            <div className="flex items-center justify-center py-2">
              <div className="h-1 w-10 rounded-full bg-border" />
            </div>
            {/* Sheet Tabs */}
            <div className="flex border-b border-border px-4">
              <button
                onClick={() => setMobileSheet('attractions')}
                className={`flex-1 py-2.5 text-xs font-medium transition-smooth ${
                  mobileSheet === 'attractions'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                景点推荐
              </button>
              <button
                onClick={() => setMobileSheet('budget')}
                className={`flex-1 py-2.5 text-xs font-medium transition-smooth ${
                  mobileSheet === 'budget'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                预算管理
              </button>
              <button
                onClick={() => setMobileSheet(null)}
                className="px-3 py-2.5 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Sheet Content */}
            <div className="overflow-y-auto max-h-[calc(75svh-80px)]">
              {mobileSheet === 'attractions' ? (
                <AttractionsPanel onClose={() => setMobileSheet(null)} />
              ) : (
                <div className="p-4">
                  <BudgetPanel />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}