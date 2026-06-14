import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect, useCallback } from 'react'
import { getState, setState } from '../../store'
import { api } from '../../services/api'
import type { HotelPOI } from '../../types'
import { allDestinations } from '../../data/destinations'
import './index.css'

export default function HotelStepPage() {
  const [hotels, setHotels] = useState<HotelPOI[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedHotel, setSelectedHotel] = useState<HotelPOI | null>(null)
  const [applyAll, setApplyAll] = useState(true)

  const trip = getState().currentTrip
  const city = allDestinations.find(c => c.id === trip?.cityId)

  /* 加载酒店数据 */
  useEffect(() => {
    if (!trip?.cityId) return
    loadHotels()
  }, [trip?.cityId])

  const loadHotels = async () => {
    if (!trip?.cityId) return
    setLoading(true)
    try {
      const res = await api.getHotels(trip.cityId, trip.cityName, city?.nameEn || trip.cityName)
      if (res.success && res.data) {
        setHotels(res.data)
        if (res.generating) setGenerating(true)
      } else if (res.generating) {
        setGenerating(true)
      }
    } catch (err) {
      console.error('加载酒店失败:', err)
    }
    setLoading(false)
  }

  const handleSelectHotel = (hotel: HotelPOI) => {
    setSelectedHotel(selectedHotel?.id === hotel.id ? null : hotel)
  }

  const handleConfirm = () => {
    if (!trip) return
    const days = [...trip.days]
    if (selectedHotel) {
      if (applyAll) {
        // 所有天都住同一家酒店
        for (let i = 0; i < days.length; i++) {
          days[i] = { ...days[i], hotel: selectedHotel }
        }
      } else {
        // 只选第一天
        days[0] = { ...days[0], hotel: selectedHotel }
      }
    }
    setState({
      currentTrip: { ...trip, days },
      selectedDayIndex: 0,
    })
    Taro.navigateTo({ url: '/pages/place-selection/index' })
  }

  const handleSkip = () => {
    Taro.navigateTo({ url: '/pages/place-selection/index' })
  }

  if (!trip) {
    return (
      <View className='hotel-step flex items-center justify-center min-h-screen'>
        <Text className='text-gray-400'>未找到行程数据</Text>
      </View>
    )
  }

  return (
    <View className='hotel-step min-h-screen bg-gray-50'>
      {/* 标题区 */}
      <View className='bg-white px-4 pt-4 pb-5'>
        <View className='flex items-center gap-2 mb-2'>
          <Text className='text-lg'>🏨</Text>
          <Text className='text-lg font-bold text-gray-900'>选择住宿</Text>
        </View>
        <Text className='text-sm text-gray-400'>
          为你的{trip.cityName}之旅选择酒店，也可以跳过稍后添加
        </Text>
      </View>

      {/* 加载中 */}
      {loading && (
        <View className='py-16 text-center'>
          <Text className='text-2xl block mb-3'>🏨</Text>
          <Text className='text-sm text-gray-400'>正在加载酒店信息...</Text>
        </View>
      )}

      {/* 生成中 */}
      {!loading && generating && hotels.length === 0 && (
        <View className='py-16 text-center'>
          <Text className='text-2xl block mb-3'>⏳</Text>
          <Text className='text-sm text-gray-500'>AI正在为你生成酒店推荐...</Text>
          <Text className='text-xs text-gray-300 mt-2 block'>通常需要30秒左右，可以先跳过</Text>
        </View>
      )}

      {/* 酒店列表 */}
      {!loading && hotels.length > 0 && (
        <ScrollView scrollY className='hotel-list'>
          {hotels.map((hotel) => (
            <View
              key={hotel.id}
              className={`mx-4 mb-3 rounded-xl border-2 bg-white shadow-sm overflow-hidden ${selectedHotel?.id === hotel.id ? 'border-[#FF6B6B]' : 'border-transparent'}`}
              onClick={() => handleSelectHotel(hotel)}
            >
              <View className='flex p-3'>
                {/* 酒店图片 */}
                {hotel.images && hotel.images[0] && (
                  <Image src={hotel.images[0]} className='w-20 h-20 rounded-lg mr-3' mode='aspectFill' />
                )}
                <View className='flex-1 min-w-0'>
                  <View className='flex items-center gap-2'>
                    <Text className='text-sm font-bold text-gray-900 truncate'>{hotel.name}</Text>
                    {hotel.stars && (
                      <Text className='text-xs text-amber-400'>{'⭐'.repeat(Math.min(hotel.stars, 5))}</Text>
                    )}
                  </View>
                  <Text className='text-xs text-gray-400 truncate block mt-0.5'>{hotel.address}</Text>
                  <View className='flex items-center gap-3 mt-1.5'>
                    {hotel.rating && (
                      <View className='flex items-center gap-1'>
                        <Text className='text-xs text-amber-400'>★</Text>
                        <Text className='text-xs font-medium text-gray-700'>{hotel.rating}</Text>
                      </View>
                    )}
                    {hotel.priceRange && (
                      <Text className='text-xs text-[#FF6B6B] font-medium'>
                        ¥{hotel.priceRange[0]}-{hotel.priceRange[1]}/晚
                      </Text>
                    )}
                    {hotel.distance !== undefined && (
                      <Text className='text-xs text-gray-300'>{hotel.distance.toFixed(1)}km</Text>
                    )}
                  </View>
                  {hotel.amenities && hotel.amenities.length > 0 && (
                    <View className='flex flex-wrap gap-1 mt-1.5'>
                      {hotel.amenities.slice(0, 4).map(a => (
                        <Text key={a} className='rounded bg-gray-50 px-1.5 py-0.5 text-[9px] text-gray-400'>{a}</Text>
                      ))}
                    </View>
                  )}
                </View>
                {/* 选中标记 */}
                {selectedHotel?.id === hotel.id && (
                  <View className='w-6 h-6 rounded-full bg-[#FF6B6B] flex items-center justify-center self-center ml-2'>
                    <Text className='text-white text-xs'>✓</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* 无酒店数据 */}
      {!loading && !generating && hotels.length === 0 && (
        <View className='py-16 text-center'>
          <Text className='text-2xl block mb-3'>🏨</Text>
          <Text className='text-sm text-gray-400'>暂无酒店推荐</Text>
          <Text className='text-xs text-gray-300 mt-1 block'>可以在行程中稍后添加</Text>
        </View>
      )}

      {/* 应用范围选择 */}
      {selectedHotel && (
        <View className='mx-4 mb-3 p-3 rounded-xl bg-white border border-gray-100'>
          <Text className='text-sm font-medium text-gray-700 block mb-2'>住宿安排</Text>
          <View className='flex gap-2'>
            <View
              className={`flex-1 rounded-lg py-2 text-center text-xs font-medium ${applyAll ? 'bg-[#FF6B6B] text-white' : 'bg-gray-100 text-gray-500'}`}
              onClick={() => setApplyAll(true)}
            >
              <Text>全程入住</Text>
            </View>
            <View
              className={`flex-1 rounded-lg py-2 text-center text-xs font-medium ${!applyAll ? 'bg-[#FF6B6B] text-white' : 'bg-gray-100 text-gray-500'}`}
              onClick={() => setApplyAll(false)}
            >
              <Text>仅首晚</Text>
            </View>
          </View>
        </View>
      )}

      {/* 底部操作 */}
      <View className='fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 pb-[env(safe-area-inset-bottom)]'>
        <View className='flex gap-3'>
          <View
            className='flex-1 h-11 rounded-xl border border-gray-200 flex items-center justify-center active:bg-gray-50'
            onClick={handleSkip}
          >
            <Text className='text-sm text-gray-500'>跳过</Text>
          </View>
          <View
            className='flex-1 h-11 rounded-xl bg-[#FF6B6B] flex items-center justify-center active:bg-[#e55a5a] shadow-lg'
            onClick={handleConfirm}
          >
            <Text className='text-sm font-semibold text-white'>
              {selectedHotel ? '确认选择' : '下一步'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}
