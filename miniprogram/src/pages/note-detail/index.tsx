import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { api } from '../../services/api'
import { getPoiById } from '../../store'
import type { DayPlan, ItineraryItem, Attraction } from '../../types'
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

export default function NoteDetailPage() {
  const [note, setNote] = useState<any>(null)
  const [days, setDays] = useState<DayPlan[]>([])
  const [loading, setLoading] = useState(true)

  Taro.useDidShow(() => {
    const instance = Taro.getCurrentInstance()
    const id = (instance as any)?.router?.params?.id
    if (id) loadNote(id)
    else setLoading(false)
  })

  const loadNote = async (id: string) => {
    try {
      const res = await api.getNote(id)
      if (res.success && res.note) {
        setNote(res.note)
        if (res.note.tripData) {
          try {
            const tripData = typeof res.note.tripData === 'string'
              ? JSON.parse(res.note.tripData)
              : res.note.tripData
            setDays(tripData.days || [])
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.error('加载游记详情失败:', err)
    }
    setLoading(false)
  }

  const getLocalPoi = (id: string): Attraction | undefined => {
    return getPoiById(id)
  }

  if (loading) {
    return (
      <View className='note-detail-loading'>
        <Text style='font-size: 28rpx; color: #7A7068;'>加载中...</Text>
      </View>
    )
  }

  if (!note) {
    return (
      <View className='note-detail-loading'>
        <Text style='font-size: 28rpx; color: #7A7068;'>未找到游记</Text>
      </View>
    )
  }

  const totalItems = days.reduce((s, d) => s + d.items.length, 0)
  const totalBudget = days.reduce((s, d) => s + d.items.reduce((is, item) => is + item.cost, 0), 0)

  return (
    <ScrollView scrollY className='note-detail'>
      {/* 封面区 */}
      {note.coverImage ? (
        <View className='note-cover'>
          <Image src={note.coverImage} className='note-cover-img' mode='aspectFill' />
          <View className='note-cover-overlay'>
            <Text className='note-cover-city'>{note.cityName}</Text>
            <Text className='note-cover-title'>{note.title}</Text>
          </View>
        </View>
      ) : (
        <View className='note-cover-placeholder'>
          <Text className='note-cover-city'>{note.cityName}</Text>
          <Text className='note-cover-title'>{note.title}</Text>
        </View>
      )}

      {/* 作者信息行 */}
      <View className='note-author-row'>
        <View className='note-author-avatar'>
          <Text style='font-size: 28rpx; color: #E8735A;'>
            {note.authorName?.charAt(0) || '旅'}
          </Text>
        </View>
        <View className='note-author-info'>
          <Text className='note-author-name'>{note.authorName || '匿名旅行者'}</Text>
          <Text className='note-author-meta'>{note.cityName} · {days.length}天行程 · {totalItems}个地点</Text>
        </View>
      </View>

      {/* 发布备注（游记引言） */}
      {note.publishNote && (
        <View className='note-intro'>
          <Text className='note-intro-text'>{note.publishNote}</Text>
        </View>
      )}

      {/* 逐天行程 — 文章式串联 */}
      {days.map((day, dayIdx) => {
        return (
          <View key={day.id} className='note-day'>
            {/* 天分隔线 + 标题 */}
            <View className='note-day-header'>
              <View className='note-day-divider'>
                <View className='note-day-line' />
                <View className='note-day-badge'>
                  <Text style='font-size: 22rpx; font-weight: 700; color: #ffffff;'>Day {day.dayNumber}</Text>
                </View>
                <View className='note-day-line' />
              </View>
              <Text className='note-day-date'>{formatDate(day.date)}</Text>
            </View>

            {/* 酒店信息 */}
            {day.hotel && (
              <View className='note-hotel'>
                <Text style='font-size: 32rpx; margin-right: 12rpx;'>🏨</Text>
                <View>
                  <Text className='note-hotel-name'>{day.hotel.name}</Text>
                  {day.hotel.address && <Text className='note-hotel-addr'>{day.hotel.address}</Text>}
                </View>
              </View>
            )}

            {/* POI 串联 */}
            {day.items.map((item, idx) => {
              const poi = getLocalPoi(item.attractionId)
              return (
                <View key={item.id} className='note-poi'>
                  {/* 时间线圆点 */}
                  <View className='note-poi-timeline'>
                    <View className='note-poi-dot' style={typeTagStyle[item.type] || typeTagStyle.scenic}>
                      <Text style='font-size: 24rpx;'>{typeEmoji[item.type] || '📍'}</Text>
                    </View>
                    {idx < day.items.length - 1 && <View className='note-poi-line' />}
                  </View>
                  {/* POI内容 */}
                  <View className='note-poi-body'>
                    <View className='note-poi-top'>
                      <Text className='note-poi-time'>{formatTime(item.startTime)} - {formatTime(item.endTime)}</Text>
                      <Text className='note-poi-type' style={typeTagStyle[item.type] || typeTagStyle.scenic}>
                        {typeLabel[item.type]}
                      </Text>
                    </View>
                    <Text className='note-poi-name'>{poi?.name || item.attractionId}</Text>
                    {/* POI图片 */}
                    {poi?.image && (
                      <Image src={poi.image} className='note-poi-img' mode='aspectFill' />
                    )}
                    {/* POI描述 */}
                    {(poi?.description || poi?.recommendReason) && (
                      <Text className='note-poi-desc'>
                        {poi.recommendReason || poi.description}
                      </Text>
                    )}
                    {/* POI元信息 */}
                    <View className='note-poi-meta'>
                      {item.cost > 0 && <Text className='note-poi-meta-item'>💰 ¥{item.cost}</Text>}
                      {poi?.rating > 0 && <Text className='note-poi-meta-item'>★ {poi.rating}</Text>}
                      {item.mealSlot && <Text className='note-poi-meta-item'>🍽️ {item.mealSlot}</Text>}
                    </View>
                  </View>
                </View>
              )
            })}

            {day.items.length === 0 && (
              <View className='note-poi-empty'>
                <Text style='font-size: 24rpx; color: #7A7068;'>这一天暂无安排</Text>
              </View>
            )}
          </View>
        )
      })}

      {/* 行程概要 */}
      <View className='note-summary'>
        <Text className='note-summary-title'>行程概要</Text>
        <View className='note-summary-grid'>
          <View className='note-summary-item'>
            <Text className='note-summary-value'>{days.length}</Text>
            <Text className='note-summary-label'>天数</Text>
          </View>
          <View className='note-summary-item'>
            <Text className='note-summary-value'>{totalItems}</Text>
            <Text className='note-summary-label'>地点</Text>
          </View>
          <View className='note-summary-item'>
            <Text className='note-summary-value'>¥{totalBudget.toLocaleString()}</Text>
            <Text className='note-summary-label'>预算</Text>
          </View>
        </View>
      </View>

      <View style='height: 80rpx;' />
    </ScrollView>
  )
}
