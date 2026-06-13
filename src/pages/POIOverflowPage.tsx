import { useState, useCallback, useMemo, useEffect } from 'react'
import { useApp } from '@/context/AppContext'
import { popularCities, getAttractions } from '@/data/mock-data'
import { displayName } from '@/utils/poiName'
import { handleImgError } from '@/utils/imageProxy'
import { Attraction } from '@/types'
import { generateItinerary } from '@/utils/routePlanner'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, ArrowRight, Star, Clock, MapPin,
  AlertTriangle, Plus, Minus, Calendar, X, Loader2,
  Heart, Check, Trash2,
} from 'lucide-react'

/* ── Format helpers ── */
function formatDuration(min: number) {
  if (min < 60) return `${min}分钟`
  const h = Math.floor(min / 60); const m = min % 60
  return m > 0 ? `${h}小时${m}分` : `${h}小时`
}

/**
 * POIOverflowPage – 当用户选择的POI点超过当前天数能容纳的范围时，
 * 引导用户通过调整天数、标记必打卡、或剔除POI来解决问题。
 *
 * 交互流程：
 * 1. 展示排不下的POI列表
 * 2. 建议延长天数（至少N天）
 * 3. 用户可接受延长时间 或 拒绝
 * 4. 拒绝时，引导标记必打卡/剔除POI
 * 5. 必打卡POI在规划时优先安排
 * 6. 所有剔除需用户确认
 * 7. 当POI可排下时，允许下一步
 */
export default function POIOverflowPage() {
  const { state, dispatch } = useApp()
  const trip = state.currentTrip
  const city = popularCities.find((c) => c.id === trip?.cityId)

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [extendAccepted, setExtendAccepted] = useState(false)
  const [extendRejected, setExtendRejected] = useState(false)
  const [isProceeding, setIsProceeding] = useState(false)
  const [confirmBatchRemove, setConfirmBatchRemove] = useState(false)

  // All user-selected attractions (reactive to removals)
  const selectedAttractions = useMemo(() => {
    if (!city) return []
    const all = getAttractions(city.id)
    return all.filter((a) => state.selectedPlaceIds.includes(a.id))
  }, [city, state.selectedPlaceIds])

  // Original trip days
  const originalDays = trip?.days.length || 0

  // Calculate minimum extra days needed based on skipped POIs
  const minExtraDays = useMemo(() => {
    if (!state.skippedPOIs || state.skippedPOIs.length === 0) return 0
    const minsPerDay = (22 * 60 - 8 * 60) * 0.85 // ~714 min
    const skippedDuration = state.skippedPOIs.reduce((sum, a) => sum + a.duration + 30, 0)
    return Math.max(1, Math.ceil(skippedDuration / minsPerDay))
  }, [state.skippedPOIs])

  const [extendDays, setExtendDays] = useState(minExtraDays || 1)

  // Reset extendDays when minExtraDays changes
  useEffect(() => {
    if (minExtraDays > 0) setExtendDays(minExtraDays)
  }, [minExtraDays])

  // Re-run planning whenever selectedPlaceIds, mustVisitIds, or extendDays change
  // This updates the skippedPOIs list in real-time
  const planResult = useMemo(() => {
    if (!trip || !city || selectedAttractions.length === 0) return { skipped: [], dayItems: [] as any[] }
    const days = extendAccepted && extendDays > 0
      ? (() => {
          const newDays = [...trip.days]
          const lastDay = newDays[newDays.length - 1]
          let dayNum = newDays.length + 1
          const current = new Date(lastDay.date)
          current.setDate(current.getDate() + 1)
          for (let i = 0; i < extendDays; i++) {
            newDays.push({
              id: `day-${dayNum}`,
              date: current.toISOString().split('T')[0],
              dayNumber: dayNum,
              items: [],
              notes: '',
              hotel: lastDay.hotel || null,
            })
            dayNum++
            current.setDate(current.getDate() + 1)
          }
          return newDays
        })()
      : trip.days

    const result = generateItinerary(selectedAttractions, days, city.id, state.mustVisitIds)
    return {
      skipped: result.skippedPOIs || [],
      dayItems: result.dayItems,
    }
  }, [trip, city, selectedAttractions, state.mustVisitIds, extendAccepted, extendDays])

  const currentSkipped = planResult.skipped
  const canProceed = currentSkipped.length === 0

  // Current skipped POI names
  const skippedNames = useMemo(
    () => currentSkipped.map(a => a.nameZh || a.name),
    [currentSkipped]
  )

  // Already-scheduled POIs
  const scheduledPOIs = useMemo(
    () => selectedAttractions.filter(a => !currentSkipped.some(s => s.id === a.id)),
    [selectedAttractions, currentSkipped]
  )

  // 必打卡仍排不下的POI（极端情况：时间冲突即使必打卡也无法安排）
  const mustVisitSkipped = useMemo(
    () => currentSkipped.filter(a => state.mustVisitIds.includes(a.id)),
    [currentSkipped, state.mustVisitIds]
  )

  // 非必打卡但被排下的POI（需要剔除以腾出时间给必打卡）
  const sacrificePOIs = useMemo(
    () => currentSkipped.filter(a => !state.mustVisitIds.includes(a.id)),
    [currentSkipped, state.mustVisitIds]
  )

  // 已安排的必打卡POI
  const scheduledMustVisit = useMemo(
    () => scheduledPOIs.filter(a => state.mustVisitIds.includes(a.id)),
    [scheduledPOIs, state.mustVisitIds]
  )

  if (!trip || !city) return null

  /* ── Handlers ── */

  const handleBack = () => {
    dispatch({ type: 'SET_VIEW', payload: 'place-selection' })
  }

  const handleAcceptExtend = () => {
    setExtendDays(minExtraDays)
    setExtendAccepted(true)
    setExtendRejected(false)
  }

  const handleRejectExtend = () => {
    setExtendRejected(true)
    setExtendAccepted(false)
  }

  const handleExtendDaysChange = (delta: number) => {
    const newVal = Math.max(minExtraDays, extendDays + delta)
    setExtendDays(newVal)
  }

  const handleToggleMustVisit = (id: string) => {
    dispatch({ type: 'TOGGLE_MUST_VISIT', payload: id })
  }

  const handleRemovePOI = (id: string) => {
    setConfirmRemoveId(id)
  }

  const handleConfirmRemove = () => {
    if (!confirmRemoveId) return
    dispatch({ type: 'REMOVE_PLACES', payload: [confirmRemoveId] })
    setConfirmRemoveId(null)
  }

  const handleCancelRemove = () => {
    setConfirmRemoveId(null)
  }

  const handleBatchRemoveSacrifices = () => {
    setConfirmBatchRemove(true)
  }

  const handleConfirmBatchRemove = () => {
    const sacrificeIds = sacrificePOIs.map(a => a.id)
    dispatch({ type: 'REMOVE_PLACES', payload: sacrificeIds })
    setConfirmBatchRemove(false)
  }

  const handleCancelBatchRemove = () => {
    setConfirmBatchRemove(false)
  }

  const handleNext = useCallback(() => {
    if (!trip || !city || !canProceed) return

    setIsProceeding(true)

    // Apply day extension to global state
    if (extendAccepted && extendDays > 0) {
      dispatch({ type: 'EXTEND_TRIP_DAYS', payload: extendDays })
    }

    // Dispatch the final plan result
    setTimeout(() => {
      dispatch({
        type: 'SET_ALL_DAYS_ITEMS',
        payload: { dayItems: planResult.dayItems, skippedPOIs: [] },
      })
      setIsProceeding(false)
      dispatch({ type: 'SET_VIEW', payload: 'planner' })
    }, 100)
  }, [trip, city, canProceed, extendAccepted, extendDays, planResult, dispatch])

  /* ── Render POI card ── */
  function renderSkippedPOICard(a: Attraction) {
    const isMustVisit = state.mustVisitIds.includes(a.id)
    const isConfirming = confirmRemoveId === a.id

    return (
      <div
        key={a.id}
        className={`relative rounded-xl border-2 p-3 transition-all duration-300 ${
          isMustVisit
            ? 'border-rose-300 bg-rose-50/50'
            : 'border-border bg-card'
        } ${isConfirming ? 'ring-2 ring-red-400 ring-offset-2' : ''}`}
      >
        <div className="flex gap-3">
          {/* Image */}
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
            <img
              src={a.image}
              alt={displayName(a)}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={handleImgError}
            />
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground leading-tight">
                {a.nameZh || a.name}
              </h3>
              {/* Must-visit toggle */}
              <button
                onClick={() => handleToggleMustVisit(a.id)}
                className={`flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
                  isMustVisit
                    ? 'bg-rose-100 text-rose-600 border border-rose-300'
                    : 'bg-secondary text-muted-foreground border border-transparent hover:bg-rose-50 hover:text-rose-500'
                }`}
                title={isMustVisit ? '取消必打卡' : '标记为必打卡'}
              >
                <Heart className={`h-3 w-3 ${isMustVisit ? 'fill-current' : ''}`} />
                必打卡
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Star className="h-3 w-3 text-sunset" fill="currentColor" />
                <span className="font-medium text-foreground">{a.rating}</span>
              </span>
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {formatDuration(a.duration)}
              </span>
              <span className="flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />
                {a.address?.split('·')[0] || ''}
              </span>
            </div>
          </div>

          {/* Remove button / confirm dialog — 必打卡POI不允许剔除，只能取消必打卡标记 */}
          {!isMustVisit && !isConfirming && (
            <button
              onClick={() => handleRemovePOI(a.id)}
              className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-400 shadow-sm transition-all hover:bg-red-100 hover:text-red-600"
              title="剔除"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          {!isMustVisit && isConfirming && (
            <div className="absolute -top-3 -right-2 flex items-center gap-1 rounded-full border border-red-400 bg-white px-2 py-1 shadow-lg z-10">
              <button
                onClick={handleConfirmRemove}
                className="text-[10px] font-bold text-red-600 hover:text-red-800"
              >
                确认剔除
              </button>
              <span className="text-[10px] text-gray-300">|</span>
              <button
                onClick={handleCancelRemove}
                className="text-[10px] font-bold text-gray-500 hover:text-gray-700"
              >
                取消
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── Render selected (non-skipped) POI as compact badge ── */
  function renderScheduledBadge(a: Attraction) {
    const isMustVisit = state.mustVisitIds.includes(a.id)
    return (
      <span
        key={a.id}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          isMustVisit
            ? 'bg-rose-100 text-rose-600 border border-rose-200'
            : 'bg-secondary text-muted-foreground'
        }`}
      >
        {isMustVisit && <Heart className="h-2.5 w-2.5 fill-current" />}
        {a.nameZh || a.name}
      </span>
    )
  }

  /* ═════════════════════════ MAIN RENDER ═════════════════════════ */
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-[1000] glass border-b border-border">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            <span>返回选点</span>
          </Button>
          <span className="text-sm font-semibold text-foreground">调整行程</span>
          <div className="w-20" />
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
        {/* ── Success state ── */}
        {canProceed && (
          <div className="mb-6 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <h2 className="mb-1 text-sm font-bold text-emerald-800">
                  所有地点已可排入行程
                </h2>
                <p className="text-xs text-emerald-700">
                  {extendAccepted
                    ? `行程已延长至 ${originalDays + extendDays} 天，所有 ${selectedAttractions.length} 个地点均可安排。`
                    : `${originalDays} 天行程可容纳所有 ${selectedAttractions.length} 个地点。`
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Warning: POIs still don't fit ── */}
        {!canProceed && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <h2 className="mb-1 text-sm font-bold text-amber-800">
                  部分地点无法排入当前行程
                </h2>
                <p className="text-xs leading-relaxed text-amber-700">
                  您选择了 <span className="font-semibold">{selectedAttractions.length}</span> 个地点，
                  但当前 <span className="font-semibold">{originalDays}{extendAccepted ? `+${extendDays}` : ''}</span> 天行程无法容纳以下{' '}
                  <span className="font-semibold">{currentSkipped.length}</span> 个地点：
                </p>
                <p className="mt-1 text-xs font-semibold text-amber-800">
                  {skippedNames.join('、')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Already scheduled POIs (compact badges) */}
        {scheduledPOIs.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              ✅ 已可排入行程的地点（{scheduledPOIs.length}个）
            </p>
            <div className="flex flex-wrap gap-1.5">
              {scheduledPOIs.map(renderScheduledBadge)}
            </div>
          </div>
        )}

        {/* ── 必打卡引导交互 ── */}
        {state.mustVisitIds.length > 0 && !canProceed && (
          <div className="mb-6 space-y-3">
            {/* 已成功安排的必打卡 */}
            {scheduledMustVisit.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
                <p className="mb-1.5 text-xs font-semibold text-rose-700">
                  💗 必打卡已安排（{scheduledMustVisit.length}个）
                </p>
                <div className="flex flex-wrap gap-1">
                  {scheduledMustVisit.map(a => (
                    <span key={a.id} className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-600 border border-rose-200">
                      <Heart className="h-2.5 w-2.5 fill-current" />
                      {a.nameZh || a.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 必打卡仍排不下：必须延长天数 */}
            {mustVisitSkipped.length > 0 && (
              <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="mb-1 text-sm font-bold text-red-800">
                      必打卡地点无法安排
                    </h3>
                    <p className="text-xs leading-relaxed text-red-700">
                      以下必打卡地点在当前 {originalDays} 天行程内无法排入：
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {mustVisitSkipped.map(a => (
                        <span key={a.id} className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 border border-red-300">
                          <Heart className="h-2.5 w-2.5 fill-current" />
                          {a.nameZh || a.name}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-red-700">
                      必打卡地点为行程刚需，必须延长行程天数才能安排。如果不延长，只能取消必打卡标记。
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 需要剔除的POI提示：只有必打卡全部能排入时才显示剔除建议 */}
            {sacrificePOIs.length > 0 && mustVisitSkipped.length === 0 && scheduledMustVisit.length > 0 && (
              <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="mb-1 text-sm font-bold text-amber-800">
                      为了安排必打卡地点，需要剔除以下地点
                    </h3>
                    <p className="mb-2 text-xs leading-relaxed text-amber-700">
                      为优先安排必打卡
                      <span className="font-semibold">
                        {scheduledMustVisit.map(a => a.nameZh || a.name).join('、')}
                      </span>
                      ，以下 {sacrificePOIs.length} 个地点需要被剔除：
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {sacrificePOIs.map(a => (
                        <span key={a.id} className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                          {a.nameZh || a.name}
                        </span>
                      ))}
                    </div>

                    {/* 一键剔除按钮 */}
                    {!confirmBatchRemove ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleBatchRemoveSacrifices}
                        className="mt-3 gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        一键剔除以上 {sacrificePOIs.length} 个地点
                      </Button>
                    ) : (
                      <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-300 bg-white p-2">
                        <p className="text-xs text-red-700">
                          确认剔除 <span className="font-bold">{sacrificePOIs.length}</span> 个地点？
                        </p>
                        <Button
                          size="sm"
                          onClick={handleConfirmBatchRemove}
                          className="h-7 bg-red-600 hover:bg-red-700 text-white text-xs px-2"
                        >
                          确认剔除
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancelBatchRemove}
                          className="h-7 text-xs px-2"
                        >
                          取消
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Option 1: Extend trip days (only show if not yet accepted AND there are still skipped POIs) ── */}
        {!extendAccepted && currentSkipped.length > 0 && (
          <div className="mb-6 rounded-2xl border-2 border-blue-200 bg-blue-50/50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                <Calendar className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="mb-1 text-sm font-bold text-blue-800">
                  建议延长行程天数
                </h3>
                <p className="mb-3 text-xs leading-relaxed text-blue-700">
                  {mustVisitSkipped.length > 0
                    ? <>必打卡地点 <span className="font-bold text-red-700">{mustVisitSkipped.map(a => a.nameZh || a.name).join('、')}</span> 必须延长天数才能安排，建议至少增加 <span className="font-bold text-blue-900">{minExtraDays}</span> 天。</>
                    : <>按照您选择的地点，建议至少增加 <span className="font-bold text-blue-900">{minExtraDays}</span> 天，即可容纳所有地点。</>
                  }
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    size="sm"
                    onClick={handleAcceptExtend}
                    className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    延长 {minExtraDays} 天
                  </Button>
                  {/* 有必打卡排不下时，不提供"不延长"选项——必须延长或取消必打卡 */}
                  {mustVisitSkipped.length === 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRejectExtend}
                      className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                    >
                      不延长，我来调整
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Extended days accepted – show day selector */}
        {extendAccepted && (
          <div className={`mb-6 rounded-2xl border-2 p-4 ${
            canProceed ? 'border-emerald-200 bg-emerald-50/50' : 'border-blue-200 bg-blue-50/50'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                canProceed ? 'bg-emerald-100' : 'bg-blue-100'
              }`}>
                <Calendar className={`h-4 w-4 ${canProceed ? 'text-emerald-600' : 'text-blue-600'}`} />
              </div>
              <div className="flex-1">
                <h3 className={`mb-1 text-sm font-bold ${canProceed ? 'text-emerald-800' : 'text-blue-800'}`}>
                  {canProceed ? '延长后所有地点可安排' : '已选择延长行程'}
                </h3>
                <p className={`mb-3 text-xs ${canProceed ? 'text-emerald-700' : 'text-blue-700'}`}>
                  行程将从 {originalDays} 天延长至 <span className="font-bold">{originalDays + extendDays}</span> 天，
                  新增的天数将安排在行程末尾。
                  {currentSkipped.length > 0 && ` 仍有 ${currentSkipped.length} 个地点无法排入。`}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">增加天数：</span>
                  <div className="flex items-center gap-2 rounded-full bg-white px-2 py-1 border border-gray-200">
                    <button
                      onClick={() => handleExtendDaysChange(-1)}
                      disabled={extendDays <= 1}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-40"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="min-w-[24px] text-center text-sm font-bold">{extendDays}</span>
                    <button
                      onClick={() => handleExtendDaysChange(1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => { setExtendAccepted(false); setExtendRejected(false) }}
                  className="mt-2 text-xs text-blue-600 underline hover:text-blue-800"
                >
                  取消延长
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Extended days rejected – show guidance */}
        {extendRejected && currentSkipped.length > 0 && (
          <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
                <AlertTriangle className="h-4 w-4 text-gray-500" />
              </div>
              <div>
                <h3 className="mb-1 text-sm font-bold text-gray-700">
                  请调整地点选择
                </h3>
                <p className="text-xs leading-relaxed text-gray-600">
                  当前 {originalDays} 天行程无法容纳所有地点。您可以通过以下方式调整：
                </p>
                <ul className="mt-1.5 space-y-1 text-xs text-gray-600">
                  <li className="flex items-start gap-1.5">
                    <Heart className="h-3 w-3 mt-0.5 shrink-0 text-rose-400" />
                    <span>将想去的地点标记为<strong>「必打卡」</strong>，规划时会优先安排</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <X className="h-3 w-3 mt-0.5 shrink-0 text-red-400" />
                    <span>剔除一些可以不去的地点，直到剩余地点可以排入行程</span>
                  </li>
                </ul>
                <button
                  onClick={() => setExtendRejected(false)}
                  className="mt-2 text-xs text-blue-600 underline hover:text-blue-800"
                >
                  还是想延长天数
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Skipped POIs list (only show if there are still skipped) */}
        {currentSkipped.length > 0 && (
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">
                ⚠️ 排不下的地点（{currentSkipped.length}个）
              </h3>
              <p className="text-[10px] text-muted-foreground">
                💗 标记必打卡 · ✕ 剔除
              </p>
            </div>
            <div className="space-y-2">
              {currentSkipped.map(renderSkippedPOICard)}
            </div>
          </div>
        )}

        {/* Must-visit summary */}
        {state.mustVisitIds.length > 0 && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50/50 p-3">
            <p className="mb-1 text-xs font-semibold text-rose-700">
              💗 已标记必打卡（{state.mustVisitIds.length}个）：
            </p>
            <div className="flex flex-wrap gap-1">
              {state.mustVisitIds.map(id => {
                const a = selectedAttractions.find(p => p.id === id)
                if (!a) return null
                return (
                  <span key={id} className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-600 border border-rose-200">
                    <Heart className="h-2.5 w-2.5 fill-current" />
                    {a.nameZh || a.name}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Proceeding overlay */}
      {isProceeding && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-card p-8 shadow-float animate-fade-in">
            <div className="relative">
              <div className="h-16 w-16 rounded-full gradient-hero flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-foreground mb-1">智能规划中</h3>
              <p className="text-sm text-muted-foreground">正在优化路线...</p>
            </div>
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="fixed bottom-0 inset-x-0 z-[1000] glass border-t border-border safe-bottom">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4">
          <div className="text-xs text-muted-foreground">
            {canProceed ? (
              <span className="text-emerald-600 font-medium">✓ 所有地点已可安排</span>
            ) : (
              <span>
                还有 <span className="font-semibold text-amber-600">{currentSkipped.length}</span> 个地点未安排
              </span>
            )}
          </div>
          <Button
            variant="coral"
            size="default"
            onClick={handleNext}
            disabled={isProceeding || !canProceed}
            className="group shrink-0 disabled:opacity-40"
          >
            {isProceeding ? (
              <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />规划中...</>
            ) : (
              <>
                继续规划行程
                <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
