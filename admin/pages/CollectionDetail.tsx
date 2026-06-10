import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { formatDate, formatRelativeTime } from '../lib/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table'
import { ArrowLeft, Database, Clock, Activity, ChevronDown, ChevronRight } from 'lucide-react'
import type { CollectionCityDetail, CollectionLogEntry, CollectionBatchInfo, L1Category } from '../types'
import { L1_LABELS } from '../types'

/** 格式化毫秒耗时 */
function formatDurationMs(ms: number | undefined): string {
  if (!ms) return '-'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return secs > 0 ? `${minutes}分${secs}秒` : `${minutes}分钟`
}

function LogEntryRow({ log }: { log: CollectionLogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const hasCategory = log.by_category && Object.keys(log.by_category).length > 0
  const isSuccess = log.status === 'success' || log.status === 'completed'
  const isFailed = log.status === 'failed' || log.status === 'error'

  return (
    <>
      <TableRow className={isFailed ? 'bg-red-50' : ''}>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDate(log.created_at)}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-xs">{log.source}</Badge>
        </TableCell>
        <TableCell>
          {isSuccess ? (
            <Badge className="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-100">成功</Badge>
          ) : isFailed ? (
            <Badge variant="destructive" className="text-xs">失败</Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">{log.status}</Badge>
          )}
        </TableCell>
        <TableCell className="text-right font-medium">{log.items_collected}</TableCell>
        <TableCell className="text-right text-muted-foreground">{log.items_accepted}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{formatDurationMs(log.duration_ms)}</TableCell>
        <TableCell>
          {hasCategory ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span className="ml-1 text-xs">详情</span>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </TableCell>
      </TableRow>
      {expanded && hasCategory && (
        <TableRow className={isFailed ? 'bg-red-50' : 'bg-accent/30'}>
          <TableCell colSpan={7} className="px-8 py-2">
            <div className="flex flex-wrap gap-2">
              {Object.entries(log.by_category).map(([cat, count]) => {
                const label = (L1_LABELS as Record<string, { zh: string; en: string; color: string }>)[cat]?.zh || cat
                const colorClass = (L1_LABELS as Record<string, { zh: string; en: string; color: string }>)[cat]?.color || 'bg-gray-100 text-gray-800'
                return (
                  <span key={cat} className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${colorClass}`}>
                    {label}: {count as number}
                  </span>
                )
              })}
            </div>
          </TableCell>
        </TableRow>
      )}
      {isFailed && log.error_message && (
        <TableRow className="bg-red-50">
          <TableCell colSpan={7} className="px-8 py-1">
            <p className="text-xs text-red-600">{log.error_message}</p>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function BatchCard({ batch }: { batch: CollectionBatchInfo }) {
  const isCompleted = batch.status === 'completed'
  const isFailed = batch.status === 'failed'
  const isRunning = batch.status === 'running'

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className={`h-4 w-4 ${isRunning ? 'text-blue-500 animate-pulse' : isCompleted ? 'text-emerald-500' : 'text-red-500'}`} />
          <span className="text-sm font-medium">批次 #{batch.id}</span>
          <Badge variant="outline" className="text-xs">{batch.batchType}</Badge>
          {isCompleted && <Badge className="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-100">完成</Badge>}
          {isFailed && <Badge variant="destructive" className="text-xs">失败</Badge>}
          {isRunning && <Badge className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-100">运行中</Badge>}
        </div>
        <span className="text-xs text-muted-foreground">
          {formatDate(batch.startedAt)}
          {batch.completedAt ? ` → ${formatRelativeTime(batch.completedAt)}` : ''}
        </span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        覆盖 {batch.citiesCount} 个城市
      </div>
    </Card>
  )
}

export default function CollectionDetail() {
  const { cityId } = useParams<{ cityId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<CollectionCityDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    if (!cityId) return
    setLoading(true)
    api.get<{ data: CollectionCityDetail }>(`/collection/city/${cityId}`)
      .then((res) => setData(res.data || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [cityId])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-4 w-20" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-16" /></CardContent>
            </Card>
          ))}
        </div>
        <Card className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/collection')}>
          <ArrowLeft className="mr-2 h-4 w-4" />返回
        </Button>
        <p className="text-muted-foreground">未找到城市 "{cityId}" 的采集数据</p>
      </div>
    )
  }

  const statCards = [
    { icon: Database, label: '原始条目数', value: data.totalRawItems, color: 'text-blue-600' },
    { icon: Activity, label: '采集次数', value: data.collectionCount, color: 'text-emerald-600' },
    { icon: Clock, label: '首次采集', value: data.firstCollectionAt ? formatDate(data.firstCollectionAt) : '-', color: 'text-purple-600' },
    { icon: Clock, label: '最近采集', value: data.lastCollectionAt ? formatRelativeTime(data.lastCollectionAt) : '-', color: 'text-amber-600' },
  ]

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/collection')}>
          <ArrowLeft className="mr-2 h-4 w-4" />返回
        </Button>
        <h1 className="text-2xl font-bold">
          {data.cityName}
          {data.cityNameEn && <span className="ml-2 text-lg text-muted-foreground">{data.cityNameEn}</span>}
        </h1>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Raw 数据源概览 */}
      {data.rawSources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">当前 Raw 数据源</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.rawSources.map((s) => (
                <div key={s.source} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium text-sm">{s.source}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(s.collected_at)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">{s.items_count}</div>
                    <div className="text-xs text-muted-foreground">条目</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 采集日志时间线 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">采集日志</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.logs.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">暂无采集日志</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>数据源</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">采集条目</TableHead>
                  <TableHead className="text-right">入库条目</TableHead>
                  <TableHead>耗时</TableHead>
                  <TableHead>类目</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.logs.map((log) => (
                  <LogEntryRow key={log.id} log={log} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 批次历史 */}
      {data.batches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">涉及批次</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.batches.map((batch) => (
                <BatchCard key={batch.id} batch={batch} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
