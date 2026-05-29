import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { formatDate, formatDuration } from '../lib/formatters'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Select } from '../components/ui/select'
import { Progress } from '../components/ui/progress'
import { Skeleton } from '../components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table'
import { RefreshCw, Play, Clock } from 'lucide-react'
import type { UpdateJob, City } from '../types'
import { L1_CATEGORIES, L1_LABELS } from '../types'

export default function Updates() {
  const [jobs, setJobs] = useState<UpdateJob[]>([])
  const [loading, setLoading] = useState(true)
  const [cities, setCities] = useState<City[]>([])
  const [showBatchDialog, setShowBatchDialog] = useState(false)

  const fetchJobs = useCallback(() => {
    api.get<{ data: UpdateJob[] }>('/updates')
      .then((res) => setJobs(res.data || []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchJobs()
    api.get<{ data: City[] }>('/cities')
      .then((res) => setCities(res.data || []))
      .catch(() => {})
  }, [fetchJobs])

  // Auto-refresh for running jobs
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === 'running' || j.status === 'pending')
    if (!hasRunning) return
    const timer = setInterval(fetchJobs, 3000)
    return () => clearInterval(timer)
  }, [jobs, fetchJobs])

  const statusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge variant="success">完成</Badge>
      case 'failed': return <Badge variant="destructive">失败</Badge>
      case 'running': return <Badge variant="info"><RefreshCw className="mr-1 h-3 w-3 animate-spin" />运行中</Badge>
      default: return <Badge variant="warning">等待中</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">数据更新</h1>
        <Button onClick={() => setShowBatchDialog(true)}>
          <Play className="mr-2 h-4 w-4" />
          批量更新
        </Button>
      </div>

      {/* Running Jobs */}
      {jobs.filter((j) => j.status === 'running').length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-blue-800">
              <RefreshCw className="h-4 w-4 animate-spin" />
              正在执行的任务
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.filter((j) => j.status === 'running').map((job) => (
              <div key={job.id} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {job.type === 'batch' ? '批量更新' : '定向更新'} — {job.config.city || job.config.country || '全部'}
                    {job.config.l1 && ` (${L1_LABELS[job.config.l1 as keyof typeof L1_LABELS]?.zh || job.config.l1})`}
                  </span>
                  <span className="text-muted-foreground">
                    {job.progress && `${job.progress.current}/${job.progress.total}`}
                  </span>
                </div>
                <Progress value={job.progress?.current || 0} max={job.progress?.total || 1} />
                {job.progress?.message && (
                  <p className="text-xs text-muted-foreground">{job.progress.message}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Job History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">更新历史</CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">ID</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>配置</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>进度</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>耗时</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const duration = job.started_at && job.completed_at
                  ? Math.round((job.completed_at - job.started_at) / 1000)
                  : undefined
                return (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs">{job.id}</TableCell>
                    <TableCell>{job.type === 'batch' ? '批量' : '定向'}</TableCell>
                    <TableCell className="text-sm">
                      {job.config.city || job.config.country || '全部'}
                      {job.config.l1 && ` / ${L1_LABELS[job.config.l1 as keyof typeof L1_LABELS]?.zh || job.config.l1}`}
                      {job.config.poiName && ` / ${job.config.poiName}`}
                    </TableCell>
                    <TableCell>{statusBadge(job.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.progress ? `${job.progress.current}/${job.progress.total}` : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(job.created_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {duration ? formatDuration(duration) : '-'}
                    </TableCell>
                  </TableRow>
                )
              })}
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    暂无更新任务
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Batch Update Dialog */}
      {showBatchDialog && (
        <BatchUpdateDialog
          cities={cities}
          onClose={() => setShowBatchDialog(false)}
          onStarted={() => { setShowBatchDialog(false); fetchJobs() }}
        />
      )}
    </div>
  )
}

function BatchUpdateDialog({ cities, onClose, onStarted }: { cities: City[]; onClose: () => void; onStarted: () => void }) {
  const [country, setCountry] = useState('')
  const [cityId, setCityId] = useState('')
  const [l1, setL1] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const countries = [...new Set(cities.map((c) => c.country).filter(Boolean))]
  const filteredCities = country ? cities.filter((c) => c.country === country) : cities

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const config: Record<string, string> = {}
      if (country) config.country = country
      if (cityId) config.city = cityId
      if (l1) config.l1 = l1
      await api.post('/updates/batch', config)
      onStarted()
    } catch (e: any) {
      setError(e.message || '启动更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">批量数据更新</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          选择更新范围（留空表示全部），然后通过 Agent CLI 执行数据采集。
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">国家</label>
            <Select
              options={countries.map((c) => ({ value: c, label: c }))}
              placeholder="全部国家"
              value={country}
              onChange={(e) => { setCountry(e.target.value); setCityId('') }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">城市</label>
            <Select
              options={filteredCities.map((c) => ({ value: c.id, label: `${c.name} (${c.id})` }))}
              placeholder="全部城市"
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">一级分类</label>
            <Select
              options={L1_CATEGORIES.map((c) => ({ value: c, label: L1_LABELS[c].zh }))}
              placeholder="全部分类"
              value={l1}
              onChange={(e) => setL1(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? '启动中...' : '开始更新'}
          </Button>
        </div>
      </div>
    </div>
  )
}
