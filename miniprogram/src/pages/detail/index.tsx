import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useState } from 'react'
import { getState, setState, getPoiById } from '../../store'
import { api } from '../../services/api'
import type { Attraction } from '../../types'
import './index.css'

const typeLabel: Record<string, string> = {
  scenic: '景点', food: '餐饮', shopping: '购物', activity: '娱乐', hotel: '住宿', transport: '交通',
}

const typeEmoji: Record<string, string> = {
  scenic: '🏛️', food: '🍜', shopping: '🛍️', activity: '🎯', hotel: '🏨', transport: '🚗',
}

export default function DetailPage() {
  const [attraction, setAttraction] = useState<Attraction | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  Taro.useDidShow(() => {
    const id = router.params.id || getState().detailAttractionId
    if (id) {
      // 从 poiMap 中直接获取完整景点数据
      const poi = getPoiById(id)
      if (poi) {
        setAttraction(poi)
        setLoading(false)
      } else {
        loadAttraction(id)
      }
    } else {
      setLoading(false)
    }
  })

  const loadAttraction = (id: string) => {
    // 回退：从行程 items 中构造基本信息
    const trip = getState().currentTrip
    if (trip) {
      for (const day of trip.days) {
        const item = day.items.find(i => i.attractionId === id)
        if (item) {
          setAttraction({
            id: item.attractionId,
            name: item.attractionId,
            type: item.type,
            image: '',
            rating: 0,
            duration: 0,
            cost: item.cost,
            description: item.notes || '',
            address: '',
            lat: 0,
            lng: 0,
            tags: [],
          })
          setLoading(false)
          return
        }
      }
    }
    setLoading(false)
  }

  if (loading) {
    return <View className='flex items-center justify-center min-h-screen'><Text className='text-gray-400'>加载中...</Text></View>
  }

  if (!attraction) {
    return <View className='flex items-center justify-center min-h-screen'><Text className='text-gray-400'>未找到景点信息</Text></View>
  }

  return (
    <View className='detail-page min-h-screen bg-white'>
      {/* 头图 */}
      {attraction.image && (
        <Image src={attraction.image} className='w-full h-56' mode='aspectFill' />
      )}
      {!attraction.image && (
        <View className='w-full h-56 bg-gray-100 flex items-center justify-center'>
          <Text className='text-5xl'>{typeEmoji[attraction.type] || '📍'}</Text>
        </View>
      )}

      <View className='px-5 py-4'>
        {/* 标题 */}
        <View className='flex items-center gap-2 mb-1'>
          <Text className='text-xl font-bold text-gray-900'>{attraction.name}</Text>
          <Text className='rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400'>{typeLabel[attraction.type]}</Text>
        </View>

        {/* 基本信息 */}
        <View className='flex items-center gap-4 mt-2 mb-4'>
          {attraction.rating > 0 && (
            <View className='flex items-center gap-1'>
              <Text className='text-amber-400 text-sm'>★</Text>
              <Text className='text-sm text-gray-700'>{attraction.rating}</Text>
            </View>
          )}
          {attraction.duration > 0 && (
            <Text className='text-sm text-gray-400'>🕐 {attraction.duration}分钟</Text>
          )}
          <Text className='text-sm text-[#FF6B6B] font-medium'>
            {attraction.cost > 0 ? `¥${attraction.cost}` : '免费'}
          </Text>
        </View>

        {/* 描述 */}
        {attraction.description && (
          <View className='mb-4'>
            <Text className='text-sm font-medium text-gray-700 block mb-1'>简介</Text>
            <Text className='text-sm text-gray-500 leading-relaxed'>{attraction.description}</Text>
          </View>
        )}

        {/* 推荐理由 */}
        {attraction.recommendReason && (
          <View className='rounded-xl bg-red-50 p-3 mb-4'>
            <Text className='text-sm text-red-500 font-medium block mb-1'>✨ 推荐理由</Text>
            <Text className='text-sm text-red-600'>{attraction.recommendReason}</Text>
          </View>
        )}

        {/* 地址 */}
        {attraction.address && (
          <View className='flex items-start gap-2 mb-3'>
            <Text className='text-sm'>📍</Text>
            <Text className='text-sm text-gray-500 flex-1'>{attraction.address}</Text>
          </View>
        )}

        {/* 营业时间 */}
        {attraction.openTime && (
          <View className='flex items-center gap-2 mb-3'>
            <Text className='text-sm'>🕐</Text>
            <Text className='text-sm text-gray-500'>{attraction.openTime}{attraction.closeTime ? ` - ${attraction.closeTime}` : ''}</Text>
          </View>
        )}

        {/* 标签 */}
        {attraction.tags.length > 0 && (
          <View className='flex flex-wrap gap-2 mt-3'>
            {attraction.tags.map(tag => (
              <Text key={tag} className='rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500'>{tag}</Text>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}
