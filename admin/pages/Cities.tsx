import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { formatDate } from '../lib/formatters'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table'
import { Plus, Search, Eye, Trash2, MapPin } from 'lucide-react'
import type { City } from '../types'

export default function Cities() {
  const navigate = useNavigate()
  const [cities, setCities] = useState<City[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)

  const fetchCities = useCallback(() => {
    setLoading(true)
    api.get<{ data: City[] }>('/cities')
      .then((res) => setCities(res.data || []))
      .catch(() => setCities([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchCities() }, [fetchCities])

  const filtered = cities.filter((c) => {
    const q = search.toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || c.nameEn.toLowerCase().includes(q)
      || c.continent.toLowerCase().includes(q) || c.country.toLowerCase().includes(q)
      || c.province.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
  })

  const handleDelete = async (cityId: string) => {
    if (!confirm(`确认删除城市 "${cityId}"？`)) return
    try {
      await api.delete(`/cities/${cityId}`)
      fetchCities()
    } catch (err: any) {
      alert(`删除失败：${err.message || '未知错误'}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">城市管理</h1>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          添加城市
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索城市名称、英文名、大洲、国家、省份..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <span className="ml-auto text-sm text-muted-foreground">
            共 {filtered.length} 个城市
          </span>
        </div>
      </Card>

      {loading ? (
        <Card className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>城市 ID</TableHead>
                <TableHead>城市名称</TableHead>
                <TableHead>英文名</TableHead>
                <TableHead>大洲</TableHead>
                <TableHead>国家</TableHead>
                <TableHead>省份</TableHead>
                <TableHead className="text-right">POI 数量</TableHead>
                <TableHead>最近更新</TableHead>
                <TableHead className="w-[140px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((city) => (
                <TableRow key={city.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{city.id}</TableCell>
                  <TableCell className="font-medium">{city.name}</TableCell>
                  <TableCell className="text-muted-foreground">{city.nameEn}</TableCell>
                  <TableCell><Badge variant="secondary">{city.continent}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{city.country}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{city.province}</Badge></TableCell>
                  <TableCell className="text-right font-medium">{city.poiCount ?? 0}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(city.lastUpdated)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="查看 POI"
                        onClick={() => navigate(`/pois?city=${city.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="在地图中查看"
                        onClick={() => window.open(`https://www.google.com/maps?q=${city.lat},${city.lng}`, '_blank')}
                      >
                        <MapPin className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="删除"
                        onClick={() => handleDelete(city.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {search ? '没有找到匹配的城市' : '暂无城市数据'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add City Dialog (simple inline for now) */}
      {showAddDialog && (
        <AddCityDialog
          onClose={() => setShowAddDialog(false)}
          onAdded={() => { setShowAddDialog(false); fetchCities() }}
        />
      )}
    </div>
  )
}

function AddCityDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    id: '', name: '', nameEn: '', continent: '', country: '', province: '', lat: '', lng: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!form.id || !form.name || !form.country) {
      setError('城市 ID、名称和国家不能为空')
      return
    }
    const lat = parseFloat(form.lat)
    const lng = parseFloat(form.lng)
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('请输入有效的经纬度坐标')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.post('/cities', {
        id: form.id,
        name: form.name,
        nameEn: form.nameEn,
        continent: form.continent,
        country: form.country,
        province: form.province,
        lat,
        lng,
      })
      onAdded()
    } catch (e: any) {
      setError(e.message || '添加失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">添加城市</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">城市 ID</label>
            <Input placeholder="例如: tokyo" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">城市名称</label>
              <Input placeholder="东京" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">英文名</label>
              <Input placeholder="Tokyo" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">大洲</label>
              <Input placeholder="亚洲" value={form.continent} onChange={(e) => setForm({ ...form, continent: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">国家 <span className="text-destructive">*</span></label>
              <Input placeholder="日本" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">省份</label>
              <Input placeholder="东京都" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">纬度</label>
              <Input type="number" step="0.0001" placeholder="35.6762" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">经度</label>
              <Input type="number" step="0.0001" placeholder="139.6503" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? '添加中...' : '添加'}</Button>
        </div>
      </div>
    </div>
  )
}
