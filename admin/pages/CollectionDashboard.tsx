import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { formatDate, formatRelativeTime } from '../lib/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table'
import { MapPin, Database, Clock } from 'lucide-react'
import type { CollectionCitiesOverview } from '../types'

export default function CollectionDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<CollectionCitiesOverview | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get<{ data: CollectionCitiesOverview }>('/collection/cities')
      .then((res) => setData(res.data || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">采集情况</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-4 w-24" /></CardHeader>
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

  const summary = data?.summary
  const cities = data?.cities || []

  const statCards = [
    { icon: MapPin, label: '已采集城市', value: summary?.totalCities ?? 0, color: 'text-emerald-600' },
    { icon: Database, label: '数据源覆盖', value: summary?.totalSources ?? 0, color: 'text-blue-600' },
    { icon: Clock, label: '最近采集', value: summary?.lastCollectionAt ? formatRelativeTime(summary.lastCollectionAt) : '-', color: 'text-amber-600' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">采集情况</h1>
        <span className="text-sm text-muted-foreground">共 {cities.length} 个城市</span>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

      {/* 城市列表表格 */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>城市</TableHead>
              <TableHead>数据源</TableHead>
              <TableHead>数据源详情</TableHead>
              <TableHead className="text-right">原始条目</TableHead>
              <TableHead>首次采集</TableHead>
              <TableHead>最近采集</TableHead>
              <TableHead className="text-right">采集次数</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  暂无采集数据
                </TableCell>
              </TableRow>
            ) : (
              cities.map((city) => (
                <TableRow
                  key={city.cityId}
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => navigate(`/collection/${city.cityId}`)}
                >
                  <TableCell>
                    <div>
                      <span className="font-medium">{city.cityName}</span>
                      {city.cityNameEn && (
                        <span className="ml-2 text-xs text-muted-foreground">{city.cityNameEn}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">{city.cityId}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{city.sourceCount} 个</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {city.sources.map((s) => (
                        <Badge key={s.source} variant="outline" className="text-xs">
                          {s.source}: {s.items_count}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">{city.totalItems}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(city.firstCollectionAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelativeTime(city.lastCollectionAt)}
                  </TableCell>
                  <TableCell className="text-right">{city.collectionCount}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
