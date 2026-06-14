import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { getState, setState, onStateChange, getPoiById, recalcBudget } from '../../store'
import { api } from '../../services/api'
import type { Trip, DayPlan, ItineraryItem, Attraction } from '../../types'
import './index.css'

const typeEmoji: Record<string, string> = {
  scenic: '🏛️', food: '🍜', shopping: '🛍️', activity: '🎯', hotel: '🏨', transport: '🚗',
}

const typeLabel: Record<string, string> = {
  scenic: '景点', food: '餐饮', shopping: '购物', activity: '娱乐', hotel: '住宿', transport: '交通',
}

const typeTagStyle: Record<string, string> = {
  scenic: 'background: #FFF0ED; color: #E8735A;',
  food: 'background: #FFF3E0; color: #E8A44A;',
  shopping: 'background: #F3E8FF; color: #8B5CF6;',
  activity: 'background: #E0F4FA; color: #14A3C8;',
  hotel: 'background: #FDF5EC; color: #B8986A;',
  transport: 'background: #F5F0EB; color: #7A7068;',
}

function formatTime(time: string) { return time || '' }
function formatDate(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
function formatWeekday(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', { weekday: 'short' })
}

function RatingStars({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  let stars = ''
  for (let i = 0; i < full; i++) stars += '★'
  if (half) stars += '½'
  return <Text style='font-size: 20rpx; color: #E8A44A; letter-spacing: 2rpx;'>{stars}</Text>
}

function PoiCard({ item, poi, onClick, idx, total, showDate }: {
  item: ItineraryItem, poi?: Attraction, onClick: () => void,
  idx: number, total: number, showDate?: boolean
}) {
  return (
    <View className='poi-card' onClick={onClick}>
      {/* 左侧时间线 */}
      <View className='poi-timeline'>
        <View className='poi-timeline-dot' style={typeTagStyle[item.type] || typeTagStyle.scenic}>
          <Text style='font-size: 28rpx;'>{typeEmoji[item.type] || '📍'}</Text>
        </View>
        {idx < total - 1 && <View className='poi-timeline-line' />}
      </View>
      {/* 右侧卡片 */}
      <View className='poi-content'>
        <View className='poi-content-top'>
          <Text className='poi-time'>{formatTime(item.startTime)} - {formatTime(item.endTime)}</Text>
          <Text className='poi-type-tag' style={typeTagStyle[item.type] || typeTagStyle.scenic}>
            {typeLabel[item.type]}
          </Text>
          {poi?.recommendReason && (
            <Text className='poi-ai-tag'>AI推荐</Text>
          )}
        </View>
        <View className='poi-name-row'>
          {poi?.image ? (
            <Image src={poi.image} className='poi-thumb' mode='aspectFill' />
          ) : (
            <View className='poi-thumb-placeholder' style={typeTagStyle[item.type] || typeTagStyle.scenic}>
              <Text style='font-size: 32rpx;'>{typeEmoji[item.type] || '📍'}</Text>
            </View>
          )}
          <View className='poi-name-info'>
            <Text className='poi-name'>{poi?.name || item.attractionId}</Text>
            {poi && poi.rating > 0 && <RatingStars rating={poi.rating} />}
            {(poi?.address || poi?.recommendReason) && (
              <Text className='poi-sub'>
                {poi.recommendReason || poi.address}
              </Text>
            )}
          </View>
        </View>
        <View className='poi-meta'>
          <Text className='poi-meta-item'>💰 {item.cost > 0 ? `¥${item.cost}` : '免费'}</Text>
          {item.mealSlot && <Text className='poi-meta-item'>🍽️ {item.mealSlot}</Text>}
          {poi?.duration ? <Text className='poi-meta-item'>🕐 {poi.duration}分钟</Text> : null}
        </View>
      </View>
    </View>
  )
}

export default function PlannerPage() {
  const [trip, setTrip] = useState<Trip | null>(getState().currentTrip)
  const [selectedDay, setSelectedDay] = useState(getState().selectedDayIndex)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'day' | 'overview'>('day')
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set())
  const [poiMap, setPoiMap] = useState<Record<string, Attraction>>(getState().poiMap)

  const getLocalPoi = (id: string): Attraction | undefined => {
    return poiMap[id] || getPoiById(id)
  }

  useEffect(() => {
    const unsub = onStateChange((state) => {
      setTrip(state.currentTrip)
      setSelectedDay(state.selectedDayIndex)
    })
    return unsub
  }, [])

  Taro.useDidShow(() => {
    const state = getState()
    if (state.currentTrip) {
      setTrip({ ...state.currentTrip })
      setSelectedDay(state.selectedDayIndex)
    }
    setPoiMap({ ...state.poiMap })
  })

  const handleSaveTrip = async () => {
    if (!trip) return
    const state = getState()
    if (!state.user) {
      Taro.switchTab({ url: '/pages/profile/index' })
      return
    }
    setSaving(true)
    try {
      const res = await api.createTrip({ tripData: trip, title: `${trip.cityName}自由行`, coverImage: '' })
      if (res.success) {
        Taro.showToast({ title: '行程已保存', icon: 'success' })
      }
    } catch (err) {
      Taro.showToast({ title: '保存失败', icon: 'none' })
    }
    setSaving(false)
  }

  const handleViewItem = (item: ItineraryItem) => {
    setState({ detailAttractionId: item.attractionId })
    Taro.navigateTo({ url: `/pages/detail/index?id=${item.attractionId}` })
  }

  const toggleExpandDay = (idx: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  if (!trip) {
    return (
      <View className='planner-page planner-empty'>
        <Text className='planner-empty-icon'>🗺️</Text>
        <Text className='planner-empty-text'>还没有行程</Text>
        <View className='planner-empty-btn' onClick={() => Taro.switchTab({ url: '/pages/create-trip/index' })}>
          <Text style='font-size: 28rpx; font-weight: 600; color: #ffffff;'>去创建行程</Text>
        </View>
      </View>
    )
  }

  const currentDay = trip.days[selectedDay]
  const skippedPOIs = getState().skippedPOIs

  return (
    <View className='planner-page'>
      {/* 顶部信息栏 */}
      <View className='planner-header'>
        <View className='planner-header-left'>
          <Text className='planner-title'>{trip.cityName}之旅</Text>
          <Text className='planner-subtitle'>
            {formatDate(trip.startDate)} - {formatDate(trip.endDate)} · {trip.days.length}天
          </Text>
        </View>
        <View className='planner-header-right'>
          <View className='planner-budget-badge'>
            <Text style='font-size: 22rpx;'>💰</Text>
            <Text className='planner-budget-text'>¥{trip.totalBudget.toLocaleString()}</Text>
          </View>
          <View className='planner-save-btn' onClick={() => !saving && handleSaveTrip()}>
            <Text style={`font-size: 24rpx; font-weight: 500; ${saving ? 'color: #7A7068;' : 'color: #ffffff;'}`}>
              {saving ? '保存中...' : '保存'}
            </Text>
          </View>
        </View>
      </View>

      {/* 按天/总览 切换Tab */}
      <View className='view-mode-tabs'>
        <View className={`view-mode-tab ${viewMode === 'day' ? 'view-mode-tab-active' : ''}`}
          onClick={() => setViewMode('day')}>
          <Text style={`font-size: 26rpx; font-weight: 500; ${viewMode === 'day' ? 'color: #ffffff;' : 'color: #7A7068;'}`}>
            按天查看
          </Text>
        </View>
        <View className={`view-mode-tab ${viewMode === 'overview' ? 'view-mode-tab-active' : ''}`}
          onClick={() => setViewMode('overview')}>
          <Text style={`font-size: 26rpx; font-weight: 500; ${viewMode === 'overview' ? 'color: #ffffff;' : 'color: #7A7068;'}`}>
            总览模式
          </Text>
        </View>
      </View>

      {/* 跳过POI提示 */}
      {skippedPOIs && skippedPOIs.length > 0 && (
        <View className='skipped-banner'>
          <Text className='skipped-banner-tag'>提示</Text>
          <View className='skipped-banner-content'>
            <Text className='skipped-banner-text'>以下地点未加入行程：</Text>
            <Text className='skipped-banner-names'>{skippedPOIs.map(a => a.name).join('、')}</Text>
          </View>
        </View>
      )}

      {viewMode === 'day' ? (
        /* ── 按天模式 ── */
        <View>
          {/* 日期选择器 */}
          <ScrollView scrollX className='day-selector'>
            <View className='day-selector-inner'>
              {trip.days.map((day, idx) => (
                <View
                  key={day.id}
                  className={`day-tab ${selectedDay === idx ? 'day-tab-active' : ''}`}
                  onClick={() => { setSelectedDay(idx); setState({ selectedDayIndex: idx }) }}
                >
                  <Text className={`day-tab-week ${selectedDay === idx ? 'day-tab-week-active' : ''}`}>
                    {formatWeekday(day.date)}
                  </Text>
                  <Text className={`day-tab-date ${selectedDay === idx ? 'day-tab-date-active' : ''}`}>
                    {new Date(day.date).getDate()}
                  </Text>
                  {day.items.length > 0 && (
                    <Text className={`day-tab-count ${selectedDay === idx ? 'day-tab-count-active' : ''}`}>
                      {day.items.length}项
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>

          {/* 当日行程 */}
          <ScrollView scrollY className='day-content'>
            {currentDay && currentDay.items.length > 0 ? (
              <View className='day-items'>
                {/* 酒店 */}
                {currentDay.hotel && (
                  <View className='hotel-card'>
                    <Text style='font-size: 36rpx; margin-right: 16rpx;'>🏨</Text>
                    <View className='hotel-info'>
                      <Text className='hotel-name'>{currentDay.hotel.name}</Text>
                      <Text className='hotel-address'>{currentDay.hotel.address}</Text>
                    </View>
                    <View className='hotel-detail-btn'
                      onClick={() => {
                        setState({ detailHotelData: JSON.stringify(currentDay.hotel) })
                        Taro.navigateTo({ url: '/pages/hotel-detail/index' })
                      }}>
                      <Text style='font-size: 22rpx; color: #E8735A;'>详情</Text>
                    </View>
                  </View>
                )}
                {/* POI列表 */}
                {currentDay.items.map((item, idx) => {
                  const poi = getLocalPoi(item.attractionId)
                  return (
                    <PoiCard
                      key={item.id}
                      item={item}
                      poi={poi}
                      onClick={() => handleViewItem(item)}
                      idx={idx}
                      total={currentDay.items.length}
                    />
                  )
                })}
                {/* 日备注 */}
                {currentDay.notes && (
                  <View className='day-notes'>
                    <Text style='font-size: 24rpx; color: #92400E;'>{currentDay.notes}</Text>
                  </View>
                )}
              </View>
            ) : (
              <View className='day-empty'>
                <Text style='font-size: 64rpx; display: block; margin-bottom: 16rpx;'>📋</Text>
                <Text style='font-size: 28rpx; color: #7A7068; display: block; margin-bottom: 24rpx;'>这一天还没有安排</Text>
                <View className='day-empty-btn' onClick={() => Taro.navigateTo({ url: '/pages/place-selection/index' })}>
                  <Text style='font-size: 26rpx; color: #ffffff; font-weight: 500;'>添加景点</Text>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      ) : (
        /* ── 总览模式 ── */
        <ScrollView scrollY className='overview-content'>
          {trip.days.map((day, dayIdx) => {
            const isExpanded = expandedDays.has(dayIdx)
            return (
              <View key={day.id} className='overview-day'>
                {/* 天头部 - 可点击展开/收起 */}
                <View className='overview-day-header' onClick={() => toggleExpandDay(dayIdx)}>
                  <View className='overview-day-header-left'>
                    <View className='overview-day-badge'>
                      <Text style='font-size: 22rpx; font-weight: 700; color: #ffffff;'>Day {day.dayNumber}</Text>
                    </View>
                    <View>
                      <Text className='overview-day-title'>{formatDate(day.date)}</Text>
                      <Text className='overview-day-meta'>{day.items.length}个安排{day.hotel ? ' · 含住宿' : ''}</Text>
                    </View>
                  </View>
                  <Text style={`font-size: 24rpx; color: #7A7068; transition: transform 0.2s; ${isExpanded ? 'transform: rotate(180deg);' : ''}`}>
                    ▼
                  </Text>
                </View>
                {/* 展开内容 */}
                {isExpanded ? (
                  <View className='overview-day-items'>
                    {day.hotel && (
                      <View className='hotel-card' style='margin-bottom: 16rpx;'>
                        <Text style='font-size: 36rpx; margin-right: 16rpx;'>🏨</Text>
                        <View className='hotel-info'>
                          <Text className='hotel-name'>{day.hotel.name}</Text>
                          <Text className='hotel-address'>{day.hotel.address}</Text>
                        </View>
                      </View>
                    )}
                    {day.items.map((item, idx) => {
                      const poi = getLocalPoi(item.attractionId)
                      return (
                        <PoiCard
                          key={item.id}
                          item={item}
                          poi={poi}
                          onClick={() => handleViewItem(item)}
                          idx={idx}
                          total={day.items.length}
                        />
                      )
                    })}
                    {day.items.length === 0 && (
                      <Text style='font-size: 24rpx; color: #7A7068; padding: 16rpx 0;'>暂无安排</Text>
                    )}
                  </View>
                ) : (
                  /* 收起态：显示POI缩略列表 */
                  <View className='overview-day-summary'>
                    {day.items.slice(0, 4).map(item => (
                      <View key={item.id} className='overview-poi-chip' style={typeTagStyle[item.type] || typeTagStyle.scenic}>
                        <Text style='font-size: 22rpx;'>{typeEmoji[item.type]}</Text>
                        <Text style='font-size: 22rpx; color: #1C1917; margin-left: 4rpx;'>
                          {getLocalPoi(item.attractionId)?.name || item.attractionId}
                        </Text>
                      </View>
                    ))}
                    {day.items.length > 4 && (
                      <Text style='font-size: 22rpx; color: #7A7068; margin-left: 8rpx;'>+{day.items.length - 4}更多</Text>
                    )}
                  </View>
                )}
              </View>
            )
          })}
          <View style='height: 120rpx;' />
        </ScrollView>
      )}
    </View>
  )
}
