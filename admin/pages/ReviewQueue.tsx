import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { formatRelativeTime } from '../lib/formatters'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table'
import {
  ClipboardCheck, ChevronDown, ChevronRight, CheckCircle, AlertTriangle,
  Upload, GitCompare, RefreshCw, Search, X,
} from 'lucide-react'
import type {
  ReviewSummary, CityReviewSummary, CityReviewDetail,
  ReviewPOI, PublishResult, POIReviewStatus, ScoreGrade,
} from '../types'
import { L1_LABELS, SCORE_GRADE_CONFIG, getScoreGrade } from '../types'

/* ── Status helpers ── */

const STATUS_BADGE: Record<POIReviewStatus, { variant: 'success' | 'warning' | 'secondary'; label: string }> = {
  new: { variant: 'success', label: '新入库' },
  updated: { variant: 'warning', label: '有更新' },
  published: { variant: 'secondary', label: '已发布' },
}

/* ══════════════════════ Main Component ══════════════════════ */

export default function ReviewQueue() {
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'new'>('all')
  const [expandedCity, setExpandedCity] = useState<string | null>(null)
  const [cityDetail, setCityDetail] = useState<CityReviewDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedPOIIds, setSelectedPOIIds] = useState<Set<string>>(new Set())
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set())
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'city' | 'pois' | 'selected-cities' | 'by-score'
    cityId?: string
    poiIds?: string[]
    count: number
    scoreGrades?: ScoreGrade[]
  } | null>(null)
  const [diffPOI, setDiffPOI] = useState<ReviewPOI | null>(null)

  /* ── Fetch summary ── */
  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ data: ReviewSummary }>('/review/summary')
      setSummary(res.data || null)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSummary() }, [fetchSummary])

  /* ── Expand city ── */
  const toggleCity = useCallback(async (cityId: string) => {
    if (expandedCity === cityId) {
      setExpandedCity(null)
      setCityDetail(null)
      setSelectedPOIIds(new Set())
      return
    }
    setExpandedCity(cityId)
    setDetailLoading(true)
    setSelectedPOIIds(new Set())
    try {
      const res = await api.get<{ data: CityReviewDetail }>(`/review/city/${cityId}`)
      setCityDetail(res.data || null)
    } catch { /* ignore */ }
    setDetailLoading(false)
  }, [expandedCity])

  /* ── Publish operations ── */
  const executePublish = useCallback(async (type: string, body: Record<string, unknown>) => {
    setPublishing(true)
    setPublishResult(null)
    try {
      const endpoint = type === 'city' ? '/publish/city'
        : type === 'by-score' ? '/publish/pois-by-score'
        : '/publish/pois'
      const res = await api.post<{ data: PublishResult }>(endpoint, body)
      setPublishResult(res.data || null)
      // Refresh summary after publish
      await fetchSummary()
      // Refresh city detail if expanded
      if (expandedCity) {
        const detailRes = await api.get<{ data: CityReviewDetail }>(`/review/city/${expandedCity}`)
        setCityDetail(detailRes.data || null)
      }
    } catch (err: any) {
      setPublishResult({
        cityId: body.cityId as string, publishedCount: 0,
        totalServerPOIs: 0, validationPassed: false,
        validationMessage: err.message || '发布失败',
      })
    }
    setPublishing(false)
    setConfirmDialog(null)
  }, [expandedCity, fetchSummary])

  /* ── Filtered cities ── */
  const filteredCities = (summary?.cities || []).filter((c) => {
    if (search) {
      const q = search.toLowerCase()
      if (!c.cityName.toLowerCase().includes(q) && !c.cityId.toLowerCase().includes(q)) return false
    }
    if (filter === 'pending') return c.newCount + c.updatedCount > 0
    if (filter === 'new') return c.newCount > 0
    return true
  })

  const totalPending = summary?.totals.totalPending || 0

  /* ── Selection helpers ── */
  const togglePOI = (id: string) => {
    const next = new Set(selectedPOIIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedPOIIds(next)
  }
  const toggleAllPOIs = () => {
    if (!cityDetail) return
    const pendingIds = cityDetail.pois.filter(p => p.reviewStatus !== 'published').map(p => p.id)
    const allSelected = pendingIds.every(id => selectedPOIIds.has(id))
    setSelectedPOIIds(allSelected ? new Set() : new Set(pendingIds))
  }
  const toggleCitySelection = (cityId: string) => {
    const next = new Set(selectedCities)
    next.has(cityId) ? next.delete(cityId) : next.add(cityId)
    setSelectedCities(next)
  }
  const toggleAllCities = () => {
    const pendingCityIds = (summary?.cities || [])
      .filter(c => c.newCount + c.updatedCount > 0).map(c => c.cityId)
    const allSelected = pendingCityIds.every(id => selectedCities.has(id))
    setSelectedCities(allSelected ? new Set() : new Set(pendingCityIds))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">审核与发布</h1>
          {totalPending > 0 && (
            <Badge variant="warning">{totalPending} 待审核</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button variant="outline" size="sm" onClick={fetchSummary} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">待审核城市</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary?.cities.filter(c => c.newCount + c.updatedCount > 0).length || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">新增 POI</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{summary?.totals.newPOIs || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">有更新 POI</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{summary?.totals.updatedPOIs || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Publish result banner */}
      {publishResult && (
        <div className={`rounded-lg border p-4 ${publishResult.validationPassed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {publishResult.validationPassed
                ? <CheckCircle className="h-5 w-5 text-emerald-600" />
                : <AlertTriangle className="h-5 w-5 text-red-600" />}
              <span className="font-medium">{publishResult.validationMessage}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPublishResult(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索城市..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'pending', 'new'] as const).map((f) => (
            <Button
              key={f} variant={filter === f ? 'default' : 'outline'} size="sm"
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? '全部' : f === 'pending' ? '有变更' : '仅新增'}
            </Button>
          ))}
        </div>
        {selectedCities.size > 0 && (
          <Button
            size="sm"
            onClick={() => setConfirmDialog({ type: 'selected-cities', count: selectedCities.size })}
            disabled={publishing}
          >
            <Upload className="h-4 w-4 mr-1" />
            发布选中城市 ({selectedCities.size})
          </Button>
        )}
        {(summary?.cities.filter(c => c.newCount + c.updatedCount > 0).length || 0) > 0 && (
          <Button variant="outline" size="sm" onClick={toggleAllCities}>
            {selectedCities.size > 0 ? '取消全选' : '全选待审核'}
          </Button>
        )}
      </div>

      {/* City list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : filteredCities.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-lg font-medium">
              {totalPending === 0 ? '所有数据已发布，没有待审核的 POI' : '没有匹配的城市'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredCities.map((city) => (
            <CityRow
              key={city.cityId}
              city={city}
              expanded={expandedCity === city.cityId}
              selected={selectedCities.has(city.cityId)}
              onToggle={() => toggleCity(city.cityId)}
              onSelect={() => toggleCitySelection(city.cityId)}
              detail={expandedCity === city.cityId ? cityDetail : null}
              detailLoading={expandedCity === city.cityId && detailLoading}
              selectedPOIIds={expandedCity === city.cityId ? selectedPOIIds : new Set()}
              onTogglePOI={togglePOI}
              onToggleAllPOIs={toggleAllPOIs}
              onPublishCity={() => setConfirmDialog({ type: 'city', cityId: city.cityId, count: city.newCount + city.updatedCount })}
              onPublishPOIs={() => setConfirmDialog({
                type: 'pois', cityId: city.cityId,
                poiIds: Array.from(selectedPOIIds), count: selectedPOIIds.size,
              })}
              onPublishByScore={(grades) => {
                const pois = expandedCity === city.cityId ? cityDetail?.pois : undefined
                const count = pois?.filter((p: ReviewPOI) => {
                  const g = getScoreGrade(p.score?.total)
                  return g && grades.includes(g) && p.reviewStatus !== 'published'
                }).length || 0
                setConfirmDialog({ type: 'by-score', cityId: city.cityId, count, scoreGrades: grades })
              }}
              onShowDiff={(poi) => setDiffPOI(poi)}
            />
          ))}
        </div>
      )}

      {/* Publish confirm dialog */}
      {confirmDialog && (
        <ConfirmDialog
          {...confirmDialog}
          publishing={publishing}
          onConfirm={() => {
            if (confirmDialog.type === 'city') {
              executePublish('city', { cityId: confirmDialog.cityId })
            } else if (confirmDialog.type === 'pois') {
              executePublish('pois', { cityId: confirmDialog.cityId, poiIds: confirmDialog.poiIds })
            } else if (confirmDialog.type === 'by-score') {
              executePublish('by-score', { cityId: confirmDialog.cityId, scoreGrades: confirmDialog.scoreGrades })
            } else if (confirmDialog.type === 'selected-cities') {
              // Publish multiple cities sequentially
              const cityIds = Array.from(selectedCities)
              Promise.all(
                cityIds.map(cid => api.post('/publish/city', { cityId: cid }))
              ).then(() => {
                fetchSummary()
                setSelectedCities(new Set())
                setPublishResult({
                  cityId: cityIds.join(', '),
                  publishedCount: cityIds.length, totalServerPOIs: 0,
                  validationPassed: true, validationMessage: `成功发布 ${cityIds.length} 个城市`,
                })
                setConfirmDialog(null)
                setPublishing(false)
              }).catch(() => {
                setPublishResult({
                  cityId: '', publishedCount: 0, totalServerPOIs: 0,
                  validationPassed: false, validationMessage: '部分城市发布失败',
                })
                setConfirmDialog(null)
                setPublishing(false)
              })
              setPublishing(true)
              return
            }
          }}
          onCancel={() => { setConfirmDialog(null); setPublishing(false) }}
        />
      )}

      {/* Diff modal */}
      {diffPOI && <DiffModal poi={diffPOI} onClose={() => setDiffPOI(null)} />}
    </div>
  )
}

/* ══════════════════════ City Row ══════════════════════ */

function CityRow({ city, expanded, selected, onToggle, onSelect, detail, detailLoading,
  selectedPOIIds, onTogglePOI, onToggleAllPOIs, onPublishCity, onPublishPOIs, onPublishByScore, onShowDiff,
}: {
  city: CityReviewSummary; expanded: boolean; selected: boolean
  onToggle: () => void; onSelect: () => void
  detail: CityReviewDetail | null; detailLoading: boolean
  selectedPOIIds: Set<string>
  onTogglePOI: (id: string) => void; onToggleAllPOIs: () => void
  onPublishCity: () => void; onPublishPOIs: () => void
  onPublishByScore: (grades: ScoreGrade[]) => void
  onShowDiff: (poi: ReviewPOI) => void
}) {
  const hasPending = city.newCount + city.updatedCount > 0

  return (
    <Card className={expanded ? 'ring-1 ring-primary/30' : ''}>
      {/* City header */}
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-accent/50"
        onClick={onToggle}
      >
        {hasPending && (
          <input
            type="checkbox" checked={selected} onChange={(e) => { e.stopPropagation(); onSelect() }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-gray-300"
          />
        )}
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <div className="flex-1 min-w-0">
          <span className="font-medium">{city.cityName}</span>
          <span className="ml-2 text-xs text-muted-foreground">({city.cityId})</span>
        </div>
        <div className="flex items-center gap-2">
          {city.avgScore != null && (() => {
            const grade = getScoreGrade(city.avgScore)
            const cfg = grade ? SCORE_GRADE_CONFIG[grade] : null
            return cfg ? (
              <Badge variant="outline" className={`${cfg.bgColor} ${cfg.color} border`}>
                均分 {grade} {Math.round(city.avgScore)}
              </Badge>
            ) : null
          })()}
          {city.newCount > 0 && <Badge variant="success">+{city.newCount} 新增</Badge>}
          {city.updatedCount > 0 && <Badge variant="warning">~{city.updatedCount} 更新</Badge>}
          <Badge variant="secondary">{city.publishedCount} 已发布</Badge>
          <span className="text-xs text-muted-foreground ml-2">共 {city.totalAgentPOIs}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 py-3">
          {detailLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : detail ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={onPublishCity}>
                  <Upload className="h-4 w-4 mr-1" />
                  发布整个城市 ({city.totalAgentPOIs} POI)
                </Button>
                <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => onPublishByScore(['A'])}>
                  <Upload className="h-4 w-4 mr-1" />
                  发布 A 级
                </Button>
                <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50"
                  onClick={() => onPublishByScore(['A', 'B'])}>
                  <Upload className="h-4 w-4 mr-1" />
                  发布 A+B 级
                </Button>
                {selectedPOIIds.size > 0 && (
                  <Button size="sm" variant="outline" onClick={onPublishPOIs}>
                    <Upload className="h-4 w-4 mr-1" />
                    发布选中 ({selectedPOIIds.size})
                  </Button>
                )}
                {detail.pois.filter(p => p.reviewStatus !== 'published').length > 0 && (
                  <Button size="sm" variant="ghost" onClick={onToggleAllPOIs}>
                    {selectedPOIIds.size > 0 ? '取消全选' : '全选待审核'}
                  </Button>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead className="w-20">状态</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead className="w-28">分类</TableHead>
                    <TableHead className="w-20">数据评分</TableHead>
                    <TableHead className="w-16">评分</TableHead>
                    <TableHead className="w-28">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.pois.map((poi) => {
                    const status = STATUS_BADGE[poi.reviewStatus]
                    const isPending = poi.reviewStatus !== 'published'
                    return (
                      <TableRow key={poi.id}>
                        <TableCell>
                          {isPending && (
                            <input
                              type="checkbox"
                              checked={selectedPOIIds.has(poi.id)}
                              onChange={() => onTogglePOI(poi.id)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{poi.name}</div>
                          {poi.aliases && poi.aliases.length > 0 && (
                            <div className="text-xs text-muted-foreground">{poi.aliases[0]}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {poi.categoryL1 && (
                            <Badge variant="outline" className={L1_LABELS[poi.categoryL1]?.color || ''}>
                              {L1_LABELS[poi.categoryL1]?.zh || poi.categoryL1}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {poi.score ? (() => {
                            const grade = getScoreGrade(poi.score.total)
                            const cfg = grade ? SCORE_GRADE_CONFIG[grade] : null
                            return cfg ? (
                              <Badge variant="outline" className={`${cfg.bgColor} ${cfg.color} border text-xs`}>
                                {grade} {poi.score.total}
                              </Badge>
                            ) : <span className="text-xs text-muted-foreground">{poi.score.total}</span>
                          })() : <span className="text-xs text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>{poi.rating?.toFixed(1) || '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {isPending && (
                              <Button size="sm" variant="ghost" className="h-7 px-2"
                                onClick={() => onShowDiff(poi)}>
                                {poi.reviewStatus === 'updated' ? <GitCompare className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">加载失败</p>
          )}
        </div>
      )}
    </Card>
  )
}

/* ══════════════════════ Confirm Dialog ══════════════════════ */

function ConfirmDialog({ type, count, publishing, scoreGrades, onConfirm, onCancel }: {
  type: string; count: number; publishing: boolean; scoreGrades?: ScoreGrade[]
  onConfirm: () => void; onCancel: () => void
}) {
  const title = type === 'city' ? '发布整个城市'
    : type === 'pois' ? '发布选中 POI'
    : type === 'by-score' ? `发布 ${scoreGrades?.join('+')} 级数据`
    : '发布选中城市'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p>即将将 <strong>{count}</strong> {type === 'selected-cities' ? '个城市' : '个 POI'} 的数据写入本地 Server DB。</p>
            <p className="mt-2 text-amber-600">
              此操作将覆盖本地 Server DB 中当前的数据，请确认已完成审核。
            </p>
            <p className="mt-2 text-blue-600">
              发布成功后将自动导出 <code className="font-mono text-xs bg-blue-50 px-1 rounded">data-sync/cache-export.json</code> 并执行 git commit，云端服务器在下次拉取时自动同步生效。
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel} disabled={publishing}>取消</Button>
            <Button onClick={onConfirm} disabled={publishing}>
              {publishing ? (
                <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> 发布中...</>
              ) : (
                <><Upload className="h-4 w-4 mr-1" /> 确认发布</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ══════════════════════ Diff Modal ══════════════════════ */

function DiffModal({ poi, onClose }: { poi: ReviewPOI; onClose: () => void }) {
  const fields = [
    { key: 'name', label: '名称' },
    { key: 'description', label: '描述' },
    { key: 'address', label: '地址' },
    { key: 'rating', label: '评分' },
    { key: 'cost', label: '费用' },
    { key: 'duration', label: '时长' },
    { key: 'openingHours', label: '开放时间' },
    { key: 'lat', label: '纬度' },
    { key: 'lng', label: '经度' },
    { key: 'tags', label: '标签', format: (v: unknown) => Array.isArray(v) ? v.join(', ') : String(v || '') },
  ]

  const agentData = poi as unknown as Record<string, unknown>
  const serverData = (poi.serverVersion || {}) as Record<string, unknown>

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-auto mx-4" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5" />
              数据对比: {poi.name}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {poi.reviewStatus === 'new' ? '此 POI 为新入库，Server DB 中无历史数据' : '左侧为 Agent DB (仓库)，右侧为 Server DB (货架)'}
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">字段</TableHead>
                <TableHead>Agent DB (仓库)</TableHead>
                <TableHead>Server DB (货架)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map(({ key, label, format }) => {
                const agentVal = agentData[key]
                const serverVal = serverData[key]
                const fmt = format || ((v: unknown) => String(v ?? ''))
                const isDiff = fmt(agentVal) !== fmt(serverVal)
                return (
                  <TableRow key={key} className={isDiff ? 'bg-amber-50' : ''}>
                    <TableCell className="font-medium text-xs">{label}</TableCell>
                    <TableCell className="text-xs">{fmt(agentVal) || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs">
                      {poi.reviewStatus === 'new'
                        ? <span className="text-muted-foreground italic">不存在</span>
                        : (fmt(serverVal) || <span className="text-muted-foreground">—</span>)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
