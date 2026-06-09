import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table'
import {
  Clock, CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronRight,
} from 'lucide-react'
import type {
  PendingUpdate, PendingUpdateDetail, ReviewPOI,
} from '../types'
import { L1_CATEGORIES, L1_LABELS, getScoreGrade, SCORE_GRADE_CONFIG } from '../types'

/* ── Helpers ── */

function formatAge(ts: number): string {
  const hours = Math.round((Date.now() - ts) / 3_600_000)
  if (hours < 1) return '刚刚'
  if (hours < 24) return `${hours}小时前`
  const days = Math.round(hours / 24)
  return `${days}天前`
}

function ScoreBadge({ score }: { score: number | null }) {
  const grade = score != null ? getScoreGrade(score) : null
  if (grade == null || score == null) return <span className="text-muted-foreground">-</span>
  const cfg = SCORE_GRADE_CONFIG[grade]
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${cfg.bgColor} ${cfg.color}`}>
      {score} ({grade})
    </span>
  )
}

function DeltaCell({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-muted-foreground">0</span>
  const color = delta > 0 ? 'text-emerald-600' : 'text-red-600'
  return <span className={`font-medium ${color}`}>{delta > 0 ? `+${delta}` : delta}</span>
}

/* ══════════════════════ Main Component ══════════════════════ */

export default function PendingUpdates() {
  const [pending, setPending] = useState<PendingUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCity, setExpandedCity] = useState<string | null>(null)
  const [detail, setDetail] = useState<PendingUpdateDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'confirm' | 'reject' | 'confirm-all'
    cityId?: string
  } | null>(null)

  /* ── Fetch list ── */
  const fetchPending = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ data: PendingUpdate[] }>('/pending')
      setPending(res.data || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchPending() }, [fetchPending])

  /* ── Fetch detail ── */
  const fetchDetail = useCallback(async (cityId: string) => {
    setDetailLoading(true)
    setDetail(null)
    try {
      const res = await api.get<{ data: PendingUpdateDetail }>(`/pending/${cityId}`)
      setDetail(res.data || null)
    } catch { /* ignore */ }
    setDetailLoading(false)
  }, [])

  /* ── Actions ── */
  const doConfirm = async (cityId: string) => {
    setActionLoading(cityId)
    try {
      await api.post('/pending/confirm', { cityId })
      setPending(prev => prev.filter(p => p.cityId !== cityId))
      if (expandedCity === cityId) { setExpandedCity(null); setDetail(null) }
    } catch (err) {
      console.error('Confirm failed:', err)
    }
    setActionLoading(null)
    setConfirmDialog(null)
  }

  const doReject = async (cityId: string) => {
    setActionLoading(cityId)
    try {
      await api.post('/pending/reject', { cityId })
      setPending(prev => prev.filter(p => p.cityId !== cityId))
      if (expandedCity === cityId) { setExpandedCity(null); setDetail(null) }
    } catch (err) {
      console.error('Reject failed:', err)
    }
    setActionLoading(null)
    setConfirmDialog(null)
  }

  const doConfirmAll = async () => {
    setActionLoading('all')
    try {
      const cityIds = pending.map(p => p.cityId)
      await api.post('/pending/confirm-batch', { cityIds })
      setPending([])
      setExpandedCity(null)
      setDetail(null)
    } catch (err) {
      console.error('Confirm all failed:', err)
    }
    setActionLoading(null)
    setConfirmDialog(null)
  }

  /* ── Toggle expand ── */
  const toggleExpand = (cityId: string) => {
    if (expandedCity === cityId) {
      setExpandedCity(null)
      setDetail(null)
    } else {
      setExpandedCity(cityId)
      fetchDetail(cityId)
    }
  }

  /* ── Summary stats ── */
  const totalPending = pending.length
  const totalNewPOIs = pending.reduce((s, p) => s + p.newTotalPOIs, 0)
  const totalOldPOIs = pending.reduce((s, p) => s + p.oldTotalPOIs, 0)

  /* ══════════════════════ Render ══════════════════════ */

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-amber-500" />
          <h1 className="text-2xl font-bold">待确认更新</h1>
          {totalPending > 0 && (
            <Badge variant="warning">{totalPending} 个城市</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalPending > 1 && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setConfirmDialog({ type: 'confirm-all' })}
              disabled={actionLoading === 'all'}
            >
              <CheckCircle className="mr-1 h-4 w-4" />
              全部确认
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fetchPending}>
            <RefreshCw className="mr-1 h-4 w-4" />
            刷新
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalPending}</div>
            <p className="text-sm text-muted-foreground">待确认城市</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalNewPOIs}</div>
            <p className="text-sm text-muted-foreground">新数据 POI 总数</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              <DeltaCell delta={totalNewPOIs - totalOldPOIs} />
            </div>
            <p className="text-sm text-muted-foreground">POI 净增量</p>
          </CardContent>
        </Card>
      </div>

      {/* Empty state */}
      {totalPending === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="mb-3 h-12 w-12 text-emerald-400" />
            <p className="text-lg font-medium">没有待确认的更新</p>
            <p className="text-sm text-muted-foreground">
              当采集新数据且城市已有数据时，更新会暂存于此等待确认。
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pending list */}
      {pending.map((p) => (
        <Card key={p.cityId}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div
                className="flex cursor-pointer items-center gap-2"
                onClick={() => toggleExpand(p.cityId)}
              >
                {expandedCity === p.cityId
                  ? <ChevronDown className="h-4 w-4" />
                  : <ChevronRight className="h-4 w-4" />
                }
                <CardTitle className="text-base">{p.cityName}</CardTitle>
                {p.country && (
                  <Badge variant="secondary" className="text-xs">{p.country}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{formatAge(p.createdAt)}</span>
                <Button
                  size="sm"
                  variant="default"
                  disabled={actionLoading === p.cityId}
                  onClick={() => setConfirmDialog({ type: 'confirm', cityId: p.cityId })}
                >
                  <CheckCircle className="mr-1 h-3 w-3" />
                  确认应用
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={actionLoading === p.cityId}
                  onClick={() => setConfirmDialog({ type: 'reject', cityId: p.cityId })}
                >
                  <XCircle className="mr-1 h-3 w-3" />
                  丢弃
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {/* Quick stats */}
            <div className="mb-4 flex items-center gap-6 text-sm">
              <span>POI: <strong>{p.oldTotalPOIs}</strong> → <strong>{p.newTotalPOIs}</strong> (<DeltaCell delta={p.poiDelta} />)</span>
              <span>质量: <ScoreBadge score={p.oldQualityScore} /> → <ScoreBadge score={p.newQualityScore} /></span>
              <span className="text-muted-foreground">来源: {p.newSources.join(', ')}</span>
              <span className="text-muted-foreground">问题: {p.newIssuesCount}</span>
            </div>

            {/* Category comparison table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>类目</TableHead>
                  <TableHead className="text-right">旧数量</TableHead>
                  <TableHead className="text-right">新数量</TableHead>
                  <TableHead className="text-right">变化</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {L1_CATEGORIES.map((cat) => {
                  const oldCount = p.oldByCategory[cat] || 0
                  const newCount = p.newByCategory[cat] || 0
                  const delta = newCount - oldCount
                  return (
                    <TableRow key={cat}>
                      <TableCell className="font-medium">
                        {L1_LABELS[cat].zh}
                        <span className="ml-1 text-xs text-muted-foreground">({cat})</span>
                      </TableCell>
                      <TableCell className="text-right">{oldCount}</TableCell>
                      <TableCell className="text-right">{newCount}</TableCell>
                      <TableCell className="text-right"><DeltaCell delta={delta} /></TableCell>
                    </TableRow>
                  )
                })}
                <TableRow className="font-semibold">
                  <TableCell>合计</TableCell>
                  <TableCell className="text-right">{p.oldTotalPOIs}</TableCell>
                  <TableCell className="text-right">{p.newTotalPOIs}</TableCell>
                  <TableCell className="text-right"><DeltaCell delta={p.poiDelta} /></TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {/* Expanded detail */}
            {expandedCity === p.cityId && (
              <div className="mt-4 border-t pt-4">
                {detailLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                ) : detail ? (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">POI 级别对比</h4>
                    <div className="flex gap-4 text-sm">
                      <Badge variant="success">新增 {detail.newPOIs.length}</Badge>
                      <Badge variant="warning">更新 {detail.updatedPOIs.length}</Badge>
                      <Badge variant="destructive">移除 {detail.removedPOIs.length}</Badge>
                      <Badge variant="secondary">不变 {detail.unchangedPOIs.length}</Badge>
                    </div>
                    {detail.newPOIs.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium text-emerald-600">新增 POI (前10):</p>
                        <div className="flex flex-wrap gap-1">
                          {detail.newPOIs.slice(0, 10).map((poi: ReviewPOI) => (
                            <Badge key={poi.id} variant="outline" className="text-xs">
                              {poi.name || poi.id}
                            </Badge>
                          ))}
                          {detail.newPOIs.length > 10 && (
                            <span className="text-xs text-muted-foreground">+{detail.newPOIs.length - 10} more</span>
                          )}
                        </div>
                      </div>
                    )}
                    {detail.removedPOIs.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium text-red-600">移除 POI (前10):</p>
                        <div className="flex flex-wrap gap-1">
                          {detail.removedPOIs.slice(0, 10).map((poi: ReviewPOI) => (
                            <Badge key={poi.id} variant="outline" className="text-xs">
                              {poi.name || poi.id}
                            </Badge>
                          ))}
                          {detail.removedPOIs.length > 10 && (
                            <span className="text-xs text-muted-foreground">+{detail.removedPOIs.length - 10} more</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">加载详情失败</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Confirm dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-96">
            <CardHeader>
              <CardTitle>
                {confirmDialog.type === 'confirm' && '确认应用更新'}
                {confirmDialog.type === 'reject' && '确认丢弃更新'}
                {confirmDialog.type === 'confirm-all' && '确认全部应用'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {confirmDialog.type === 'confirm' && (
                <p className="text-sm text-muted-foreground">
                  将把待确认的 POI 数据写入城市数据库，替换现有数据。此操作不可撤销。
                </p>
              )}
              {confirmDialog.type === 'reject' && (
                <p className="text-sm text-muted-foreground">
                  将丢弃该城市的待确认数据，现有 POI 数据保持不变。
                </p>
              )}
              {confirmDialog.type === 'confirm-all' && (
                <p className="text-sm text-muted-foreground">
                  将把全部 {pending.length} 个城市的待确认数据写入数据库。此操作不可撤销。
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmDialog(null)}>
                  取消
                </Button>
                <Button
                  size="sm"
                  variant={confirmDialog.type === 'reject' ? 'destructive' : 'default'}
                  onClick={() => {
                    if (confirmDialog.type === 'confirm' && confirmDialog.cityId) doConfirm(confirmDialog.cityId)
                    else if (confirmDialog.type === 'reject' && confirmDialog.cityId) doReject(confirmDialog.cityId)
                    else if (confirmDialog.type === 'confirm-all') doConfirmAll()
                  }}
                >
                  确认
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
