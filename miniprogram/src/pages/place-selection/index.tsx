import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { getState, setState } from '../../store'
import { api } from '../../services/api'
import { allDestinations } from '../../data/destinations'
import { generateItinerary } from '../../utils/routePlanner'
import type { Attraction, Trip } from '../../types'
import './index.css'

type PlaceCategory = 'all' | 'scenic' | 'food' | 'shopping' | 'activity'

const categories: { key: PlaceCategory; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: '🌟' },
  { key: 'scenic', label: '景点', icon: '🏛️' },
  { key: 'food', label: '餐饮', icon: '🍜' },
  { key: 'shopping', label: '购物', icon: '🛍️' },
  { key: 'activity', label: '娱乐', icon: '🎯' },
]

const typeEmoji: Record<string, string> = {
  scenic: '🏛️', food: '🍜', shopping: '🛍️', activity: '🎯', hotel: '🏨', transport: '🚗',
}

const typeLabel: Record<string, string> = {
  scenic: '景点', food: '餐饮', shopping: '购物', activity: '娱乐', hotel: '住宿', transport: '交通',
}

function formatDuration(min: number) {
  if (min < 60) return `${min}分钟`
  const h = Math.floor(min / 60); const m = min % 60
  return m > 0 ? `${h}小时${m}分` : `${h}小时`
}

function formatCost(cost: number) { return cost === 0 ? '免费' : `¥${cost}` }

export default function PlaceSelectionPage() {
  const [pois, setPois] = useState<Attraction[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeCategory, setActiveCategory] = useState<PlaceCategory>('all')
  const [generatingPlan, setGeneratingPlan] = useState(false)

  // 用 ref 保存最新值，避免闭包陷阱
  const tripRef = useRef<Trip | null>(null)
  const poisRef = useRef<Attraction[]>([])
  const selectedIdsRef = useRef<Set<string>>(new Set())

  const loadTripData = () => {
    const state = getState()
    tripRef.current = state.currentTrip
  }

  // 每次页面显示时刷新 trip 数据
  useDidShow(() => {
    loadTripData()
  })

  // 初始化加载
  useEffect(() => {
    loadTripData()
    if (tripRef.current?.cityId) {
      loadPOIs()
    } else {
      setLoading(false)
    }
  }, [])

  // 同步 ref
  useEffect(() => {
    poisRef.current = pois
  }, [pois])

  useEffect(() => {
    selectedIdsRef.current = selectedIds
  }, [selectedIds])

  const city = allDestinations.find(c => c.id === tripRef.current?.cityId)

  const loadPOIs = async () => {
    const trip = tripRef.current
    if (!trip?.cityId) {
      console.log('[PlaceSelection] loadPOIs: 无 cityId，跳过加载')
      return
    }
    console.log(`[PlaceSelection] loadPOIs: cityId=${trip.cityId}, cityName=${trip.cityName}`)
    setLoading(true)
    try {
      const res = await api.getPOIs(trip.cityId, trip.cityName, city?.nameEn || trip.cityName)
      console.log(`[PlaceSelection] 响应: success=${res.success}, dataLength=${res.data?.length ?? 'undefined'}, generating=${res.generating}`)
      if (res.success && res.data) {
        const attractions: Attraction[] = res.data.map((p: any) => ({
          id: p.id,
          name: p.name || p.nameZh || p.title || '',
          nameZh: p.nameZh,
          type: p.type || 'scenic',
          image: p.image || p.photo || '',
          rating: p.rating || 4.0,
          duration: p.duration || p.visitDuration || 60,
          cost: p.cost || p.entranceFee || 0,
          description: p.description || '',
          address: p.address || '',
          lat: p.lat || p.latitude || 0,
          lng: p.lng || p.longitude || 0,
          tags: p.tags || [],
          openTime: p.openTime || p.openingHours || '',
          closeTime: p.closeTime || '',
          mealType: p.mealType,
          recommendReason: p.recommendReason || p.reason || '',
          seasonalIndex: p.seasonalIndex,
        }))
        setPois(attractions)
        // 同步写入 poiMap 供 planner/detail 页面使用
        const map: Record<string, Attraction> = { ...getState().poiMap }
        for (const a of attractions) map[a.id] = a
        setState({ poiMap: map })
        if (res.generating) setGenerating(true)
      } else if (res.generating) {
        setGenerating(true)
        pollPOIs()
      }
    } catch (err) {
      console.error('加载POI失败:', err)
    }
    setLoading(false)
  }

  const pollPOIs = async () => {
    const trip = tripRef.current
    if (!trip?.cityId) return
    let retries = 0
    const interval = setInterval(async () => {
      retries++
      if (retries > 20) { clearInterval(interval); setGenerating(false); return }
      try {
        const res = await api.getPOIs(trip.cityId, trip.cityName, city?.nameEn || '')
        if (res.success && res.data && res.data.length > 0) {
          const pollAttractions: Attraction[] = res.data.map((p: any) => ({
            id: p.id, name: p.name || p.nameZh || p.title || '',
            nameZh: p.nameZh, type: p.type || 'scenic',
            image: p.image || p.photo || '', rating: p.rating || 4.0,
            duration: p.duration || p.visitDuration || 60,
            cost: p.cost || p.entranceFee || 0,
            description: p.description || '', address: p.address || '',
            lat: p.lat || p.latitude || 0, lng: p.lng || p.longitude || 0,
            tags: p.tags || [], openTime: p.openTime || p.openingHours || '',
            closeTime: p.closeTime || '', mealType: p.mealType,
            recommendReason: p.recommendReason || p.reason || '',
            seasonalIndex: p.seasonalIndex,
          }))
          setPois(pollAttractions)
          const map: Record<string, Attraction> = { ...getState().poiMap }
          for (const a of pollAttractions) map[a.id] = a
          setState({ poiMap: map })
          setGenerating(false)
          clearInterval(interval)
        }
      } catch { /* continue polling */ }
    }, 3000)
  }

  const filteredPois = useMemo(() => {
    if (activeCategory === 'all') return pois
    return pois.filter(p => p.type === activeCategory)
  }, [pois, activeCategory])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleGenerate = useCallback(() => {
    const trip = tripRef.current
    const currentSelectedIds = selectedIdsRef.current
    const currentPois = poisRef.current

    console.log('[PlaceSelection] handleGenerate called, trip:', !!trip, 'selected:', currentSelectedIds.size, 'generating:', generatingPlan)

    if (!trip) {
      Taro.showToast({ title: '未找到行程数据', icon: 'none' })
      return
    }
    if (currentSelectedIds.size === 0) {
      Taro.showToast({ title: '请先选择景点', icon: 'none' })
      return
    }
    if (generatingPlan) return

    setGeneratingPlan(true)
    Taro.showLoading({ title: '正在生成行程...' })

    // setTimeout 让 UI 先更新
    setTimeout(() => {
      try {
        const selectedPois = currentPois.filter(p => currentSelectedIds.has(p.id))
        console.log('[PlaceSelection] 生成行程:', selectedPois.length, '个POI,', trip.days.length, '天')

        const result = generateItinerary(trip, selectedPois)
        console.log('[PlaceSelection] 生成完成, dayItems:', result.dayItems.map(d => d.length))

        const newTrip = {
          ...trip,
          days: trip.days.map((day, i) => ({ ...day, items: result.dayItems[i] || [] })),
          totalBudget: result.dayItems.flat().reduce((sum, item) => sum + item.cost, 0)
        }

        setState({ currentTrip: newTrip, skippedPOIs: result.skippedPOIs || [] })
        tripRef.current = newTrip

        setGeneratingPlan(false)
        Taro.hideLoading()

        console.log('[PlaceSelection] 准备跳转到 planner 页面')
        Taro.switchTab({ url: '/pages/planner/index' })
      } catch (err) {
        console.error('[PlaceSelection] 生成行程失败:', err)
        setGeneratingPlan(false)
        Taro.hideLoading()
        Taro.showToast({
          title: '生成失败: ' + (err instanceof Error ? err.message : '未知错误'),
          icon: 'none',
          duration: 3000
        })
      }
    }, 100)
  }, [generatingPlan])

  const trip = tripRef.current

  if (!trip) {
    return (
      <View className='place-selection flex items-center justify-center min-h-screen'>
        <Text className='text-gray-400'>未找到行程数据</Text>
      </View>
    )
  }

  const canGenerate = selectedIds.size > 0 && !generatingPlan

  return (
    <View className='place-selection min-h-screen bg-gray-50'>
      {/* 标题 */}
      <View className='bg-white px-4 pt-4 pb-3'>
        <View className='flex items-center gap-2 mb-1'>
          <Text className='text-lg'>📍</Text>
          <Text className='text-lg font-bold text-gray-900'>选择想去的地方</Text>
        </View>
        <Text className='text-sm text-gray-400'>
          {trip.cityName} · 已选 <Text className='text-[#FF6B6B] font-bold'>{selectedIds.size}</Text> 个地点
        </Text>
      </View>

      {/* 分类标签 */}
      <ScrollView scrollX className='bg-white px-4 pb-3'>
        <View className='inline-flex gap-2'>
          {categories.map(cat => (
            <View
              key={cat.key}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 ${activeCategory === cat.key ? 'bg-[#FF6B6B]' : 'bg-gray-100'}`}
              onClick={() => setActiveCategory(cat.key)}
            >
              <Text className='text-xs'>{cat.icon}</Text>
              <Text className={`text-xs font-medium ${activeCategory === cat.key ? 'text-white' : 'text-gray-500'}`}>{cat.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 加载中 */}
      {loading && (
        <View className='py-16 text-center'>
          <Text className='text-2xl block mb-3'>📍</Text>
          <Text className='text-sm text-gray-400'>正在加载景点信息...</Text>
        </View>
      )}

      {/* 生成中 */}
      {!loading && generating && pois.length === 0 && (
        <View className='py-16 text-center'>
          <Text className='text-2xl block mb-3'>⏳</Text>
          <Text className='text-sm text-gray-500'>AI正在为你推荐景点...</Text>
          <Text className='text-xs text-gray-300 mt-2 block'>通常需要30秒左右</Text>
        </View>
      )}

      {/* POI列表 - 用普通 View + ScrollView 包裹 */}
      {!loading && filteredPois.length > 0 && (
        <ScrollView
          scrollY
          className='poi-list'
          enhanced
          showScrollbar={false}
        >
          {filteredPois.map((poi) => (
            <View
              key={poi.id}
              className={`mx-4 mb-2.5 rounded-xl bg-white shadow-sm overflow-hidden ${selectedIds.has(poi.id) ? 'border-2 border-[#FF6B6B]' : 'border border-gray-100'}`}
              onClick={() => toggleSelect(poi.id)}
            >
              <View className='flex p-3'>
                {/* 图片 */}
                {poi.image ? (
                  <Image src={poi.image} className='w-20 h-20 rounded-lg mr-3' mode='aspectFill' />
                ) : (
                  <View className='w-20 h-20 rounded-lg bg-gray-100 mr-3 flex items-center justify-center'>
                    <Text className='text-2xl'>{typeEmoji[poi.type] || '📍'}</Text>
                  </View>
                )}
                <View className='flex-1 min-w-0'>
                  <View className='flex items-center gap-2'>
                    <Text className='text-sm font-bold text-gray-900 truncate'>{poi.name}</Text>
                    <Text className='rounded bg-gray-50 px-1.5 py-0.5 text-[9px] text-gray-400'>{typeLabel[poi.type]}</Text>
                  </View>
                  {poi.recommendReason && (
                    <Text className='text-xs text-[#FF6B6B] truncate block mt-0.5'>{poi.recommendReason}</Text>
                  )}
                  <View className='flex items-center gap-3 mt-1.5'>
                    {poi.rating > 0 && (
                      <Text className='text-xs text-gray-400'>★ {poi.rating}</Text>
                    )}
                    <Text className='text-xs text-gray-400'>🕐 {formatDuration(poi.duration)}</Text>
                    <Text className='text-xs text-gray-400'>💰 {formatCost(poi.cost)}</Text>
                  </View>
                  {poi.tags.length > 0 && (
                    <View className='flex flex-wrap gap-1 mt-1'>
                      {poi.tags.slice(0, 3).map(tag => (
                        <Text key={tag} className='rounded bg-gray-50 px-1.5 py-0.5 text-[9px] text-gray-400'>{tag}</Text>
                      ))}
                    </View>
                  )}
                </View>
                {/* 勾选 */}
                <View className={`w-6 h-6 rounded-full flex items-center justify-center self-center ml-2 ${selectedIds.has(poi.id) ? 'bg-[#FF6B6B]' : 'border-2 border-gray-200'}`}>
                  {selectedIds.has(poi.id) && <Text className='text-white text-xs'>✓</Text>}
                </View>
              </View>
            </View>
          ))}
          {/* 底部留白，防止被固定按钮遮挡 */}
          <View className='h-24' />
        </ScrollView>
      )}

      {/* 无数据 */}
      {!loading && !generating && pois.length === 0 && (
        <View className='py-16 text-center'>
          <Text className='text-2xl block mb-3'>📍</Text>
          <Text className='text-sm text-gray-400'>暂无景点推荐</Text>
        </View>
      )}

      {/* 底部操作按钮 - 放在最外层，避免被 ScrollView 遮挡 */}
      <View className='bottom-bar'>
        <View
          className={`bottom-btn ${canGenerate ? 'bottom-btn-active' : 'bottom-btn-disabled'}`}
          hoverClass={canGenerate ? 'bottom-btn-hover' : ''}
          hoverStayTime={100}
          onClick={handleGenerate}
        >
          <Text className={`text-base font-semibold ${canGenerate ? 'text-white' : 'text-gray-400'}`}>
            {generatingPlan ? '正在生成行程...' : selectedIds.size > 0 ? `生成${selectedIds.size}个景点行程` : '请选择景点'}
          </Text>
        </View>
      </View>
    </View>
  )
}
