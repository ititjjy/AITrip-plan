import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { formatRelativeTime, formatCategoryPath } from '../lib/formatters'
import { useDebounce } from '../hooks/useDebounce'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Select } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table'
import { Search, Eye, ChevronLeft, ChevronRight, Filter, RefreshCw } from 'lucide-react'
import type { POI, L1Category, CategoryNode, POIReviewStatus, ScoreGrade } from '../types'
import { L1_CATEGORIES, L1_LABELS, SCORE_GRADE_CONFIG, getScoreGrade } from '../types'

const REVIEW_STATUS_LABELS: Record<POIReviewStatus, { label: string; className: string }> = {
  new:       { label: '新入库', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  updated:   { label: '有更新', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  published: { label: '已发布', className: 'bg-gray-100 text-gray-600 border-gray-200' },
}

export default function POIBrowser() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [pois, setPois] = useState<POI[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [cities, setCities] = useState<Array<{ id: string; name: string }>>([])
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([])

  // Filters from URL params
  const [city, setCity] = useState(searchParams.get('city') || '')
  const [l1, setL1] = useState(searchParams.get('l1') || '')
  const [l2, setL2] = useState(searchParams.get('l2') || '')
  const [l3, setL3] = useState(searchParams.get('l3') || '')
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1)
  const [pageSize, setPageSize] = useState(Number(searchParams.get('pageSize')) || 20)
  const [scoreGrade, setScoreGrade] = useState<ScoreGrade | ''>(
    (searchParams.get('scoreGrade') as ScoreGrade) || ''
  )
  const [reprocessing, setReprocessing] = useState(false)
  const [reprocessMsg, setReprocessMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const debouncedQuery = useDebounce(query, 300)

  // Fetch cities for filter
  useEffect(() => {
    api.get<{ data: Array<{ id: string; name: string }> }>('/cities')
      .then((res) => setCities(res.data || []))
      .catch(() => {})
    api.get<{ data: CategoryNode[] }>('/categories')
      .then((res) => setCategoryTree(res.data || []))
      .catch(() => {})
  }, [])

  // Fetch POIs
  const fetchPOIs = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (city) params.set('city', city)
    if (l1) params.set('l1', l1)
    if (l2) params.set('l2', l2)
    if (l3) params.set('l3', l3)
    if (debouncedQuery) params.set('q', debouncedQuery)
    if (scoreGrade) params.set('scoreGrade', scoreGrade)
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))

    const endpoint = debouncedQuery ? `/pois/search?${params}` : `/pois?${params}`
    api.get<{ data: POI[]; total: number }>(endpoint)
      .then((res) => {
        setPois(res.data || [])
        setTotal(res.total || 0)
      })
      .catch(() => { setPois([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [city, l1, l2, l3, debouncedQuery, scoreGrade, page, pageSize])

  useEffect(() => { fetchPOIs() }, [fetchPOIs])

  // Sync URL params
  useEffect(() => {
    const params = new URLSearchParams()
    if (city) params.set('city', city)
    if (l1) params.set('l1', l1)
    if (l2) params.set('l2', l2)
    if (l3) params.set('l3', l3)
    if (query) params.set('q', query)
    if (scoreGrade) params.set('scoreGrade', scoreGrade)
    if (page > 1) params.set('page', String(page))
    if (pageSize !== 20) params.set('pageSize', String(pageSize))
    setSearchParams(params, { replace: true })
  }, [city, l1, l2, l3, query, scoreGrade, page, pageSize, setSearchParams])

  // Get L2 options based on selected L1
  const l2Options = l1
    ? (categoryTree.find((c) => c.id === l1)?.children || []).map((c) => ({ value: c.id, label: c.label }))
    : []

  // Get L3 options based on selected L1+L2
  const l3Options = l1 && l2
    ? (categoryTree.find((c) => c.id === l1)?.children?.find((c) => c.id === l2)?.children || []).map((c) => ({ value: c.id, label: c.label }))
    : []

  const totalPages = Math.ceil(total / pageSize)

  const handleReprocess = async () => {
    if (!city) return
    setReprocessing(true)
    setReprocessMsg(null)
    try {
      const endpoint = l1 ? '/reprocess/category' : '/reprocess/city'
      const body = l1 ? { cityId: city, category: l1 } : { cityId: city }
      await api.post(endpoint, body)
      setReprocessMsg({ ok: true, text: `已提交重新合并任务，可前往「数据操作日志」查看进度` })
    } catch {
      setReprocessMsg({ ok: false, text: '提交失败，请重试' })
    }
    setReprocessing(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">POI 浏览</h1>
        {city && (
          <Button variant="outline" size="sm" onClick={handleReprocess} disabled={reprocessing}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${reprocessing ? 'animate-spin' : ''}`} />
            {reprocessing ? '提交中...' : (l1 ? `重新合并「${L1_LABELS[l1 as L1Category]?.zh || l1}」类目` : '重新合并该城市')}
          </Button>
        )}
      </div>
      {reprocessMsg && (
        <div className={`rounded-md border px-4 py-2 text-sm ${
          reprocessMsg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {reprocessMsg.text}
        </div>
      )}

      {/* Filters */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索 POI 名称、地址、标签..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1) }}
              className="w-72"
            />
          </div>
          <Select
            options={cities.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="全部城市"
            value={city}
            onChange={(e) => { setCity(e.target.value); setPage(1) }}
            className="w-36"
          />
          <Select
            options={pageSize === 50 ? [{ value: '20', label: '20 条/页' }] : [{ value: '50', label: '50 条/页' }]}
            value={String(pageSize)}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="w-32"
          />
          <span className="ml-auto text-sm text-muted-foreground">
            共 {total} 条结果
          </span>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="flex gap-1">
            <Button
              variant={!l1 ? 'default' : 'ghost'}
              size="sm"
              onClick={() => { setL1(''); setL2(''); setL3(''); setPage(1) }}
            >
              全部
            </Button>
            {L1_CATEGORIES.map((cat) => (
              <Button
                key={cat}
                variant={l1 === cat ? 'default' : 'ghost'}
                size="sm"
                onClick={() => { setL1(l1 === cat ? '' : cat); setL2(''); setL3(''); setPage(1) }}
              >
                {L1_LABELS[cat].zh}
              </Button>
            ))}
          </div>
          {l2Options.length > 0 && (
            <Select
              options={l2Options}
              placeholder="二级分类"
              value={l2}
              onChange={(e) => { setL2(e.target.value); setL3(''); setPage(1) }}
              className="w-36"
            />
          )}
          {l3Options.length > 0 && (
            <Select
              options={l3Options}
              placeholder="三级分类"
              value={l3}
              onChange={(e) => { setL3(e.target.value); setPage(1) }}
              className="w-36"
            />
          )}
        </div>

        {/* Score Grade Filters */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">数据质量</span>
          <div className="flex gap-1">
            <Button
              variant={!scoreGrade ? 'default' : 'ghost'}
              size="sm"
              onClick={() => { setScoreGrade(''); setPage(1) }}
            >
              全部
            </Button>
            {(Object.keys(SCORE_GRADE_CONFIG) as ScoreGrade[]).map((g) => {
              const cfg = SCORE_GRADE_CONFIG[g]
              return (
                <Button
                  key={g}
                  variant={scoreGrade === g ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => { setScoreGrade(scoreGrade === g ? '' : g); setPage(1) }}
                  className={scoreGrade === g ? cfg.bgColor + ' ' + cfg.color : ''}
                >
                  {g} ({cfg.range[0]}–{cfg.range[1]})
                </Button>
              )
            })}
          </div>
        </div>
      </Card>

      {/* POI Table */}
      {loading ? (
        <Card className="p-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>审核状态</TableHead>
                <TableHead>数据评分</TableHead>
                <TableHead>一级分类</TableHead>
                <TableHead>分类路径</TableHead>
                <TableHead>评分</TableHead>
                <TableHead>坐标</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="w-[80px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pois.map((poi) => (
                <TableRow key={poi.id} className="cursor-pointer" onClick={() => navigate(`/pois/${poi.id}?city=${city}`)}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{poi.name}</div>
                      {poi.aliases && poi.aliases.length > 0 && (
                        <div className="text-xs text-muted-foreground">{poi.aliases[0]}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {poi.reviewStatus ? (
                      <Badge variant="outline" className={REVIEW_STATUS_LABELS[poi.reviewStatus].className}>
                        {REVIEW_STATUS_LABELS[poi.reviewStatus].label}
                      </Badge>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    {poi.score ? (() => {
                      const grade = getScoreGrade(poi.score.total)
                      const cfg = grade ? SCORE_GRADE_CONFIG[grade] : null
                      return cfg ? (
                        <Badge variant="outline" className={`${cfg.bgColor} ${cfg.color} border`}>
                          {grade} {poi.score.total}
                        </Badge>
                      ) : <span className="text-muted-foreground">{poi.score.total}</span>
                    })() : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    <Badge className={L1_LABELS[poi.categoryL1]?.color || ''}>
                      {L1_LABELS[poi.categoryL1]?.zh || poi.categoryL1}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatCategoryPath(poi.categoryL1 ? L1_LABELS[poi.categoryL1]?.zh : undefined, poi.categoryL2, poi.categoryL3)}
                  </TableCell>
                  <TableCell>{poi.rating ? `${poi.rating.toFixed(1)}` : '-'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {poi.lat.toFixed(3)}, {poi.lng.toFixed(3)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatRelativeTime(poi.updatedAt)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); navigate(`/pois/${poi.id}?city=${city}`) }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {pois.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {query ? '没有找到匹配的 POI' : '暂无数据'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            第 {page} / {totalPages} 页，共 {total} 条
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4))
              const p = start + i
              if (p > totalPages) return null
              return (
                <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" onClick={() => setPage(p)}>
                  {p}
                </Button>
              )
            })}
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
