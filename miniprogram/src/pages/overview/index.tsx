import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { getState, onStateChange, getPoiById } from '../../store'
import type { Trip } from '../../types'
import './index.css'

const typeEmoji: Record<string, string> = {
  scenic: '🏛️', food: '🍜', shopping: '🛍️', activity: '🎯', hotel: '🏨', transport: '🚗',
}

export default function OverviewPage() {
  const [trip, setTrip] = useState<Trip | null>(getState().currentTrip)

  Taro.useDidShow(() => {
    const state = getState()
    if (state.currentTrip) setTrip({ ...state.currentTrip })
  })

  useEffect(() => {
    const unsub = onStateChange((state) => setTrip(state.currentTrip))
    return unsub
  }, [])

  if (!trip) {
    return (
      <View className='flex items-center justify-center min-h-screen'>
        <Text className='text-gray-400'>未找到行程数据</Text>
      </View>
    )
  }

  const totalItems = trip.days.reduce((s, d) => s + d.items.length, 0)
  const totalScenic = trip.days.reduce((s, d) => s + d.items.filter(i => i.type === 'scenic').length, 0)
  const totalFood = trip.days.reduce((s, d) => s + d.items.filter(i => i.type === 'food').length, 0)

  return (
    <View className='overview-page min-h-screen bg-gray-50'>
      {/* 行程概览头部 */}
      <View className='bg-gradient-to-r from-[#FF6B6B] to-[#FF8E8E] px-5 pt-6 pb-8'>
        <Text className='block text-2xl font-bold text-white'>{trip.cityName}之旅</Text>
        <Text className='block text-sm text-white/80 mt-1'>
          {trip.startDate} ~ {trip.endDate} · {trip.days.length}天
        </Text>
        <View className='grid grid-cols-3 gap-3 mt-5'>
          <View className='bg-white/20 rounded-xl p-3 text-center'>
            <Text className='block text-lg font-bold text-white'>{totalItems}</Text>
            <Text className='text-[10px] text-white/70'>总安排</Text>
          </View>
          <View className='bg-white/20 rounded-xl p-3 text-center'>
            <Text className='block text-lg font-bold text-white'>{totalScenic}</Text>
            <Text className='text-[10px] text-white/70'>景点</Text>
          </View>
          <View className='bg-white/20 rounded-xl p-3 text-center'>
            <Text className='block text-lg font-bold text-white'>¥{trip.totalBudget.toLocaleString()}</Text>
            <Text className='text-[10px] text-white/70'>总预算</Text>
          </View>
        </View>
      </View>

      {/* 每日详情 */}
      <ScrollView scrollY className='day-list'>
        {trip.days.map((day) => (
          <View key={day.id} className='mx-4 mb-3 mt-2 rounded-xl bg-white shadow-sm overflow-hidden'>
            {/* 天标题 */}
            <View className='flex items-center justify-between px-4 py-3 border-b border-gray-50'>
              <View className='flex items-center gap-2'>
                <View className='w-7 h-7 rounded-lg bg-[#FF6B6B] flex items-center justify-center'>
                  <Text className='text-xs font-bold text-white'>D{day.dayNumber}</Text>
                </View>
                <View>
                  <Text className='text-sm font-bold text-gray-900'>第{day.dayNumber}天</Text>
                  <Text className='text-[10px] text-gray-400'>{day.date}</Text>
                </View>
              </View>
              <Text className='text-xs text-gray-400'>{day.items.length}项安排</Text>
            </View>

            {/* 时间线 */}
            <View className='px-4 py-3'>
              {day.hotel && (
                <View className='flex items-center gap-2 mb-2'>
                  <Text className='text-sm'>🏨</Text>
                  <Text className='text-xs text-gray-500 truncate'>{day.hotel.name}</Text>
                </View>
              )}
              {day.items.map((item) => (
                <View key={item.id} className='flex items-start gap-2 mb-2'>
                  <View className='flex flex-col items-center mt-0.5'>
                    <Text className='text-sm'>{typeEmoji[item.type] || '📍'}</Text>
                  </View>
                  <View className='flex-1 min-w-0'>
                    <View className='flex items-center gap-2'>
                      <Text className='text-xs text-gray-400'>{item.startTime}</Text>
                      <Text className='text-xs text-gray-700 font-medium truncate'>{getPoiById(item.attractionId)?.name || item.attractionId}</Text>
                    </View>
                    <Text className='text-[10px] text-gray-300'>💰 {item.cost > 0 ? `¥${item.cost}` : '免费'}</Text>
                  </View>
                </View>
              ))}
              {day.items.length === 0 && (
                <Text className='text-xs text-gray-300'>暂无安排</Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* 底部操作 */}
      <View className='fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 pb-[env(safe-area-inset-bottom)]'>
        <View
          className='w-full h-11 rounded-xl bg-[#FF6B6B] flex items-center justify-center shadow-lg active:bg-[#e55a5a]'
          onClick={() => Taro.navigateBack()}
        >
          <Text className='text-sm font-semibold text-white'>返回行程规划</Text>
        </View>
      </View>
    </View>
  )
}
