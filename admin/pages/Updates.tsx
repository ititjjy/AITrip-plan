import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { formatDate, formatDuration } from '../lib/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Progress } from '../components/ui/progress'
import { Skeleton } from '../components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table'
import { RefreshCw, Clock, PlayCircle, AlertTriangle } from 'lucide-react'
import type { UpdateJob } from '../types'
import { L1_LABELS } from '../types'

export default function Updates() {
  const [jobs, setJobs] = useState<UpdateJob[]>([])
  const [loading, setLoading] = useState(true)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const fetchJobs = useCallback(() => {
    api.get<{ data: UpdateJob[] }>('/updates')
      .then((res) => setJobs(res.data || []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  // Auto-refresh for running jobs
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === 'running' || j.status === 'pending')
    if (!hasRunning) return
    const timer = setInterval(fetchJobs, 3000)
    return () => clearInterval(timer)
  }, [jobs, fetchJobs])

  const handleReprocessAll = async () => {
    setShowConfirm(false)
    setSubmitting(true)
    setSubmitMsg(null)
    try {
      await api.post('/reprocess/all', {})
      setSubmitMsg({ ok: true, text: '全量重新合并任务已提交！37个城市正在后台处理，页面将每 3 秒自动刷新。有已有数据的城市将进入「待确认更新」页面。' })
      fetchJobs()
    } catch {
      setSubmitMsg({ ok: false, text: '提交失败，请重试' })
    }
    setSubmitting(false)
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge variant="success">完成</Badge>
      case 'failed': return <Badge variant="destructive">失败</Badge>
      case 'running': return <Badge variant="info"><RefreshCw className="mr-1 h-3 w-3 animate-spin" />运行中</Badge>
      default: return <Badge variant="warning">等待中</Badge>
    }
  }

  const jobTypeLabel = (job: UpdateJob) => {
    const mode = (job.config as any).mode === 'reprocess' ? 'Reprocess' : (job.type === 'batch' ? '批量' : '定向')
    const cat = (job.config as any).category
    const poi = (job.config as any).poiId
    if (cat) return `${mode} / ${L1_LABELS[cat as keyof typeof L1_LABELS]?.zh || cat}`
    if (poi) return `${mode} / 单POI`
    return mode
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">数据操作日志</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfirm(true)}
            disabled={submitting || jobs.some(j => j.status === 'running')}
          >
            <PlayCircle className="h-4 w-4 mr-1.5" />
            全量重新合并 (37 城市)
          </Button>
          <Button variant="outline" size="sm" onClick={fetchJobs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {submitMsg && (
        <div className={`rounded-md border px-4 py-3 text-sm ${
          submitMsg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {submitMsg.text}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        记录所有 Reprocess 合并操作的执行日志。全量重新合并：无数据的城市直接入库，已有数据的城市进入「待确认更新」。
      </p>

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
                  <span>{jobTypeLabel(job)} — {(job.config as any).cityId || (job.config as any).city || '全部'}</span>
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
          <CardTitle className="text-base">操作记录</CardTitle>
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
                <TableHead>城市</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>进度</TableHead>
                <TableHead>时间</TableHead>
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
                    <TableCell className="text-sm">{jobTypeLabel(job)}</TableCell>
                    <TableCell className="text-sm">
                      {(job.config as any).scope === 'all' ? '全部城市' : ((job.config as any).cityId || (job.config as any).city || '全部')}
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
                    暂无操作记录
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Confirm Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
              <h3 className="text-lg font-semibold">全量重新合并</h3>
            </div>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>即将对 <strong>37 个城市</strong>的全部原始数据重新执行合并加工，不调用任何采集 API。</p>
              <p className="text-blue-600">当前 <strong>22 个城市</strong>已有 Server DB 数据，合并结果将存入「待确认更新」临时表。</p>
              <p className="text-emerald-600">另外 <strong>15 个城市</strong>尚无 Server DB 数据，合并完成后直接入库。</p>
              <p className="text-amber-700">该操作耗时较长（预计 5-10 分钟），请在「数据操作日志」页面查看进度。</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowConfirm(false)}>取消</Button>
              <Button onClick={handleReprocessAll} disabled={submitting}>
                <PlayCircle className="h-4 w-4 mr-1" />
                确认全量合并
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
