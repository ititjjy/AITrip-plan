import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { formatDate, formatCoord, formatCategoryPath } from '../lib/formatters'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { ArrowLeft, MapPin, Star, Clock, Tag, Image, Info, RefreshCw, Upload, CheckCircle, BarChart3 } from 'lucide-react'
import type { POIDetail, FieldSource, POIReviewStatus, ScoreGrade } from '../types'
import { L1_LABELS, SCORE_GRADE_CONFIG, getScoreGrade } from '../types'

const REVIEW_STATUS_CONFIG: Record<POIReviewStatus, { label: string; className: string; desc: string }> = {
  new:       { label: '新入库 · 待审核', className: 'bg-emerald-100 text-emerald-800 border-emerald-300', desc: '该 POI 为新采集数据，尚未发布到网站' },
  updated:   { label: '有更新 · 待审核', className: 'bg-amber-100 text-amber-800 border-amber-300', desc: '该 POI 数据有变更，尚未同步到网站' },
  published: { label: '已发布',           className: 'bg-gray-100 text-gray-600 border-gray-300', desc: '该 POI 数据已与网站同步' },
}

export default function POIDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const cityParam = searchParams.get('city') || ''

  const [poi, setPoi] = useState<POIDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    const qs = cityParam ? `?city=${cityParam}` : ''
    api.get<{ data: POIDetail }>(`/pois/${encodeURIComponent(id)}${qs}`)
      .then((res) => setPoi(res.data || null))
      .catch(() => setPoi(null))
      .finally(() => setLoading(false))
  }, [id, cityParam])

  const handleRefresh = async () => {
    if (!poi) return
    setRefreshing(true)
    try {
      await api.post('/updates/targeted', { poiId: poi.id, cityId: poi.cityId })
    } catch {}
    setRefreshing(false)
  }

  const handlePublish = async () => {
    if (!poi) return
    setPublishing(true)
    try {
      const res = await api.post<{ data: { validationPassed: boolean; validationMessage: string } }>(
        '/publish/pois',
        { cityId: poi.cityId, poiIds: [poi.id] }
      )
      const result = res.data
      if (result?.validationPassed) {
        const qs = cityParam ? `?city=${cityParam}` : ''
        const updated = await api.get<{ data: POIDetail }>(`/pois/${encodeURIComponent(poi.id)}${qs}`)
        if (updated?.data) setPoi(updated.data)
      }
      alert(result?.validationMessage || '发布完成')
    } catch {
      alert('发布失败，请重试')
    }
    setPublishing(false)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    )
  }

  if (!poi) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">未找到该 POI</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>返回</Button>
      </div>
    )
  }

  const fieldEntries = poi.fieldSources ? Object.entries(poi.fieldSources) : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{poi.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              {poi.nameZh && poi.nameZh !== poi.name && (
                <Badge variant="secondary" className="text-xs">中: {poi.nameZh}</Badge>
              )}
              {poi.nameEn && poi.nameEn !== poi.name && (
                <Badge variant="secondary" className="text-xs">英: {poi.nameEn}</Badge>
              )}
              {poi.aliases && poi.aliases
                .filter(a => a !== poi.nameZh && a !== poi.nameEn)
                .map(alias => (
                  <Badge key={alias} variant="outline" className="text-xs">{alias}</Badge>
                ))
              }
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className={L1_LABELS[poi.categoryL1]?.color || ''}>
                {L1_LABELS[poi.categoryL1]?.zh || poi.categoryL1}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {formatCategoryPath(
                  poi.categoryL1 ? L1_LABELS[poi.categoryL1]?.zh : undefined,
                  poi.categoryL2,
                  poi.categoryL3
                )}
              </span>
              {poi.reviewStatus && (
                <Badge variant="outline" className={REVIEW_STATUS_CONFIG[poi.reviewStatus].className}>
                  {REVIEW_STATUS_CONFIG[poi.reviewStatus].label}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {poi.reviewStatus && poi.reviewStatus !== 'published' && (
            <Button onClick={handlePublish} disabled={publishing} className="bg-emerald-600 hover:bg-emerald-700">
              <Upload className={`mr-2 h-4 w-4 ${publishing ? 'animate-pulse' : ''}`} />
              {publishing ? '发布中...' : '审核发布'}
            </Button>
          )}
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? '更新中...' : '刷新数据'}
          </Button>
        </div>
      </div>

      {/* Review Status Card (only for pending POIs) */}
      {poi.reviewStatus && poi.reviewStatus !== 'published' && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-3 py-4">
            <Info className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">{REVIEW_STATUS_CONFIG[poi.reviewStatus].label}</p>
              <p className="text-sm text-amber-700">{REVIEW_STATUS_CONFIG[poi.reviewStatus].desc}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Data Score Card */}
        {poi.score && (() => {
          const grade = getScoreGrade(poi.score.total)
          const cfg = grade ? SCORE_GRADE_CONFIG[grade] : null
          return (
            <Card className={cfg ? `border-2 ${cfg.bgColor}` : ''}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" /> 数据评分
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold">{poi.score.total}</span>
                  {cfg && (
                    <Badge variant="outline" className={`text-lg px-3 py-1 ${cfg.bgColor} ${cfg.color} border`}>
                      {grade} · {cfg.description}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">完整度</span>
                    <span className="font-medium">{Math.round(poi.score.completeness)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200">
                    <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, poi.score.completeness)}%` }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">置信度</span>
                    <span className="font-medium">{Math.round(poi.score.confidence)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200">
                    <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, poi.score.confidence)}%` }} />
                  </div>
                </div>
                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">来源数</span>
                    <span className="ml-1 font-medium">{poi.score.sourceCount}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">冲突字段</span>
                    <span className={`ml-1 font-medium ${poi.score.conflictCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {poi.score.conflictCount}
                    </span>
                  </div>
                </div>
                {poi.score.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {poi.score.sources.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })()}

        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4" /> 基本信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow label="评分" value={poi.rating ? `${poi.rating.toFixed(1)} / 5.0` : '-'} icon={<Star className="h-4 w-4 text-amber-500" />} />
            <InfoRow label="费用" value={poi.cost || '-'} />
            <InfoRow label="建议游玩时长" value={poi.duration || '-'} />
            <InfoRow label="开放时间" value={poi.openingHours || '-'} />
            <InfoRow label="最佳季节" value={poi.seasons?.join(', ') || '-'} />
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" /> 位置信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow label="坐标" value={formatCoord(poi.lat, poi.lng)} />
            <InfoRow label="地址" value={poi.address || '-'} />
            <InfoRow label="所属城市" value={poi.cityName || poi.cityId} />
          </CardContent>
        </Card>

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">描述</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {poi.description || '暂无描述'}
            </p>
          </CardContent>
        </Card>

        {/* Tags */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4" /> 标签
            </CardTitle>
          </CardHeader>
          <CardContent>
            {poi.tags && poi.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {poi.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无标签</p>
            )}
          </CardContent>
        </Card>

        {/* Metadata */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" /> 元数据
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow label="POI ID" value={poi.id} mono />
            <InfoRow label="数据来源" value={poi.source || '-'} />
            <InfoRow label="创建时间" value={formatDate(poi.createdAt)} />
            <InfoRow label="更新时间" value={formatDate(poi.updatedAt)} />
          </CardContent>
        </Card>

        {/* Images */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Image className="h-4 w-4" /> 图片 ({poi.images?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {poi.images && poi.images.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {poi.images.slice(0, 4).map((url, i) => (
                  <img key={i} src={url} alt={`${poi.name} ${i + 1}`} className="h-24 w-full rounded-md object-cover" />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无图片</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Field Source Provenance */}
      {fieldEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">字段来源溯源</CardTitle>
            <p className="text-sm text-muted-foreground">展示各字段的数据来源渠道及置信度</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {fieldEntries.map(([fieldName, sources]) => (
                <FieldSourceCard key={fieldName} fieldName={fieldName} sources={sources} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function InfoRow({ label, value, icon, mono }: { label: string; value: string; icon?: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right ${mono ? 'font-mono text-xs' : ''}`}>
        {icon && <span className="mr-1 inline-block align-middle">{icon}</span>}
        {value}
      </span>
    </div>
  )
}

const FIELD_LABELS: Record<string, string> = {
  name: '名称', aliases: '别名', description: '描述', address: '地址',
  rating: '评分', cost: '费用', duration: '游玩时长', tags: '标签',
  images: '图片', openingHours: '开放时间', coord: '坐标',
}

function FieldSourceCard({ fieldName, sources }: { fieldName: string; sources: FieldSource[] }) {
  const selected = sources.find((s) => s.is_selected === 1)
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{FIELD_LABELS[fieldName] || fieldName}</span>
        {selected && (
          <Badge variant="outline" className="text-xs">
            当前: {selected.source} ({(selected.confidence * 100).toFixed(0)}%)
          </Badge>
        )}
      </div>
      <div className="space-y-1">
        {sources.map((s) => (
          <div
            key={s.source}
            className={`flex items-center gap-3 rounded px-2 py-1 text-xs ${s.is_selected ? 'bg-primary/5 font-medium' : 'text-muted-foreground'}`}
          >
            <Badge variant={s.is_selected ? 'default' : 'secondary'} className="w-20 justify-center text-[10px]">
              {s.source}
            </Badge>
            <span className="flex-1 truncate">{s.value}</span>
            <span className="font-mono">{(s.confidence * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
