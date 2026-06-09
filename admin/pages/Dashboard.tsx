import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { formatDate } from '../lib/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import { Database, MapPin, Tag, Clock, TrendingUp, ClipboardCheck, AlertCircle } from 'lucide-react'
import type { StatsData, UpdateJob, PendingUpdate } from '../types'
import { Badge } from '../components/ui/badge'

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<StatsData | null>(null)
  const [recentJobs, setRecentJobs] = useState<UpdateJob[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<{ data: StatsData }>('/stats').catch(() => null),
      api.get<{ data: UpdateJob[] }>('/updates?limit=5').catch(() => null),
      api.get<{ data: PendingUpdate[] }>('/pending').catch(() => null),
    ]).then(([statsRes, jobsRes, pendingRes]) => {
      if (statsRes?.data) setStats(statsRes.data)
      if (jobsRes?.data) setRecentJobs(jobsRes.data)
      if (pendingRes?.data) setPendingCount(pendingRes.data.length)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardHeader><Skeleton className="h-4 w-24" /></CardHeader><CardContent><Skeleton className="h-8 w-16" /></CardContent></Card>
        ))}
      </div>
    )
  }

  const statCards = [
    { icon: Database, label: 'POI 总数', value: stats?.totalPOIs ?? 0, color: 'text-blue-600' },
    { icon: MapPin, label: '城市数', value: stats?.totalCities ?? 0, color: 'text-emerald-600' },
    { icon: Tag, label: '覆盖类目', value: stats?.categories ?? 6, color: 'text-purple-600' },
    { icon: Clock, label: '最近更新', value: stats?.lastUpdate ? formatDate(stats.lastUpdate) : '-', color: 'text-amber-600' },
  ]

  const freshnessData = stats?.freshness
    ? [
        { label: '新鲜 (≤3天)', value: stats.freshness.fresh, color: 'bg-emerald-500' },
        { label: '近期 (≤7天)', value: stats.freshness.recent, color: 'bg-blue-500' },
        { label: '老化 (≤14天)', value: stats.freshness.aging, color: 'bg-amber-500' },
        { label: '陈旧 (≤30天)', value: stats.freshness.stale, color: 'bg-orange-500' },
        { label: '过期 (>30天)', value: stats.freshness.expired, color: 'bg-red-500' },
      ]
    : []

  const totalFreshness = freshnessData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

      {/* Pending Update Card */}
      {pendingCount > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-blue-600" />
              <div>
                <p className="font-semibold text-blue-900">待确认更新</p>
                <p className="text-sm text-blue-700">
                  {pendingCount} 个城市有新采集数据等待确认后应用
                </p>
              </div>
            </div>
            <Button variant="outline" className="border-blue-300 text-blue-800 hover:bg-blue-100" onClick={() => navigate('/pending')}>
              前往确认
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pending Review Card */}
      {(stats?.pendingReviewPOIs ?? 0) > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-6 w-6 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-900">待审核发布</p>
                <p className="text-sm text-amber-700">
                  {stats?.pendingReviewCities} 个城市共 {stats?.pendingReviewPOIs} 个 POI 等待审核发布
                </p>
              </div>
            </div>
            <Button variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100" onClick={() => navigate('/review')}>
              前往审核
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Freshness Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              数据新鲜度分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            {totalFreshness > 0 ? (
              <div className="space-y-3">
                {freshnessData.map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="w-24 text-xs text-muted-foreground">{item.label}</span>
                    <div className="flex-1">
                      <div className="h-4 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${item.color}`}
                          style={{ width: `${(item.value / totalFreshness) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-8 text-right text-xs font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无数据</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Update Jobs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近更新任务</CardTitle>
          </CardHeader>
          <CardContent>
            {recentJobs.length > 0 ? (
              <div className="space-y-2">
                {recentJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'destructive' : job.status === 'running' ? 'info' : 'warning'}>
                        {job.status}
                      </Badge>
                      <span className="text-muted-foreground">
                        {job.type === 'batch' ? '批量' : '定向'} - {job.config.city || job.config.country || '全部'}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(job.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无更新任务</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
