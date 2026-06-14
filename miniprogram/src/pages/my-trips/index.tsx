import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { getState, setState } from '../../store'
import { api } from '../../services/api'
import type { Trip, TripSummary } from '../../types'
import { allDestinations } from '../../data/destinations'
import './index.css'

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export default function MyTripsPage() {
  const [trips, setTrips] = useState<TripSummary[]>([])
  const [loading, setLoading] = useState(true)

  Taro.useDidShow(() => {
    loadTrips()
  })

  const loadTrips = async () => {
    const state = getState()
    if (!state.token) {
      setLoading(false)
      return
    }
    try {
      const res = await api.getTrips()
      // 服务端 GET /api/trips 返回 { success, trips }
      if (res.success && res.trips) {
        setTrips(res.trips)
      }
    } catch (err) {
      console.error('加载行程列表失败:', err)
    }
    setLoading(false)
  }

  const handleOpenTrip = async (tripSummary: TripSummary) => {
    Taro.showLoading({ title: '加载中...' })
    try {
      // 从服务端加载完整行程数据（列表只有 summary，不含 days/items）
      const res = await api.getTrip(tripSummary.id)
      if (res.success && res.trip) {
        const fullTrip: Trip = res.trip.tripData
        setState({
          currentTrip: fullTrip,
          selectedDayIndex: 0,
          skippedPOIs: [],
        })
        Taro.hideLoading()
        Taro.navigateTo({ url: '/pages/planner/index' })
        return
      }
    } catch (err) {
      console.error('加载行程详情失败:', err)
    }
    Taro.hideLoading()
    Taro.showToast({ title: '加载失败', icon: 'none' })
  }

  const state = getState()

  // 未登录态 → 引导登录
  if (!state.token) {
    return (
      <View className='my-trips-page'>
        <View className='login-state'>
          <Text style='font-size: 96rpx; margin-bottom: 32rpx;'>🔒</Text>
          <Text style='font-size: 36rpx; font-weight: 700; color: #1C1917; margin-bottom: 12rpx;'>登录后查看行程</Text>
          <Text style='font-size: 28rpx; color: #7A7068; margin-bottom: 48rpx;'>登录账号即可同步和管理你的旅行行程</Text>
          <View
            style='display: inline-flex; align-items: center; gap: 8rpx; border-radius: 24rpx; background: linear-gradient(135deg, #E8735A, #D4553D); padding: 20rpx 48rpx;'
            onClick={() => Taro.switchTab({ url: '/pages/profile/index' })}
          >
            <Text style='font-size: 28rpx; font-weight: 600; color: #ffffff;'>去登录</Text>
          </View>
        </View>
      </View>
    )
  }

  // 加载中
  if (loading) {
    return (
      <View className='my-trips-page' style='display: flex; align-items: center; justify-content: center; min-height: 100vh;'>
        <Text style='color: #7A7068; font-size: 28rpx;'>加载中...</Text>
      </View>
    )
  }

  // 空态 → 引导创建
  if (trips.length === 0) {
    return (
      <View className='my-trips-page'>
        <View className='empty-state'>
          <Text style='font-size: 96rpx; margin-bottom: 32rpx;'>🗺️</Text>
          <Text style='font-size: 36rpx; font-weight: 700; color: #1C1917; margin-bottom: 12rpx;'>还没有行程</Text>
          <Text style='font-size: 28rpx; color: #7A7068; margin-bottom: 48rpx;'>点击下方 + 开始规划你的第一段旅程</Text>
          <View
            style='display: inline-flex; align-items: center; gap: 8rpx; border-radius: 24rpx; background: linear-gradient(135deg, #E8735A, #D4553D); padding: 20rpx 48rpx;'
            onClick={() => Taro.switchTab({ url: '/pages/create-trip/index' })}
          >
            <Text style='font-size: 28rpx; font-weight: 600; color: #ffffff;'>创建行程</Text>
          </View>
        </View>
      </View>
    )
  }

  // 行程列表（TripSummary 只有 dayCount/totalBudget，没有 days 数组）
  return (
    <View className='my-trips-page'>
      <View style='padding: 32rpx 32rpx 16rpx;'>
        <Text style='font-size: 40rpx; font-weight: 800; color: #1C1917;'>我的行程</Text>
        <Text style='font-size: 26rpx; color: #7A7068; margin-top: 8rpx; display: block;'>共 {trips.length} 个行程</Text>
      </View>

      <ScrollView scrollY style='height: calc(100vh - 200rpx);'>
        {trips.map((trip) => {
          const city = allDestinations.find(c => c.id === trip.cityId)
          const dateLabel = trip.startDate
            ? `${formatDate(trip.startDate)} - ${formatDate(trip.endDate || '')}`
            : `${trip.dayCount}天`

          return (
            <View key={trip.id} className='trip-card' onClick={() => handleOpenTrip(trip)}>
              <View className='trip-card-header'>
                {city?.image ? (
                  <Image src={city.image} mode='aspectFill' style='width: 100%; height: 100%;' />
                ) : (
                  <View style='width: 100%; height: 100%; background: linear-gradient(135deg, #E8735A, #E8A44A);' />
                )}
                <View className='trip-card-gradient' />
                <View className='trip-card-city'>
                  <Text style='font-size: 36rpx; font-weight: 700; color: #ffffff; display: block;'>{trip.cityName}</Text>
                  <Text style='font-size: 24rpx; color: rgba(255,255,255,0.8);'>{dateLabel}</Text>
                </View>
                <View className='trip-card-badge'>
                  <Text style='color: #ffffff;'>{trip.dayCount}天</Text>
                </View>
              </View>
              <View className='trip-card-body'>
                <View className='trip-card-stats'>
                  <View className='trip-card-stat'>
                    <Text>📍</Text>
                    <Text>{trip.dayCount}天行程</Text>
                  </View>
                  <View className='trip-card-stat'>
                    <Text>💰</Text>
                    <Text>¥{trip.totalBudget.toLocaleString()}</Text>
                  </View>
                </View>
              </View>
            </View>
          )
        })}
        <View style='height: 120rpx;' />
      </ScrollView>
    </View>
  )
}
