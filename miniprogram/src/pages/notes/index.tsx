import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { api } from '../../services/api'
import type { TravelNote } from '../../types'
import './index.css'

export default function NotesPage() {
  const [notes, setNotes] = useState<TravelNote[]>([])
  const [loading, setLoading] = useState(true)

  Taro.useDidShow(() => {
    loadNotes()
  })

  const loadNotes = async () => {
    try {
      const res = await api.getNotes({ limit: 20 })
      if (res.success && res.notes) {
        setNotes(res.notes)
      }
    } catch (err) {
      console.error('加载游记失败:', err)
    }
    setLoading(false)
  }

  return (
    <View className='notes-page'>
      <View style='background: #ffffff; padding: 32rpx 32rpx 24rpx; border-bottom: 1rpx solid #E7E0D8;'>
        <Text style='font-size: 40rpx; font-weight: 800; color: #1C1917; display: block;'>旅行灵感</Text>
        <Text style='font-size: 26rpx; color: #7A7068; margin-top: 8rpx; display: block;'>来自旅行者的真实分享</Text>
      </View>

      {loading ? (
        <View style='padding: 128rpx 0; text-align: center;'>
          <Text style='font-size: 28rpx; color: #7A7068;'>加载中...</Text>
        </View>
      ) : notes.length > 0 ? (
        <ScrollView scrollY className='notes-list'>
          {notes.map((note) => (
            <View
              key={note.id}
              className='note-card'
              onClick={() => Taro.navigateTo({ url: `/pages/note-detail/index?id=${note.id}` })}
            >
              {note.coverImage && (
                <Image src={note.coverImage} className='note-card-cover' mode='aspectFill' />
              )}
              <View className='note-card-body'>
                <Text className='note-card-title'>{note.title}</Text>
                <View className='note-card-meta'>
                  <Text className='note-card-author'>{note.authorName}</Text>
                  <Text className='note-card-dot'>·</Text>
                  <Text className='note-card-city'>{note.cityName}</Text>
                  <Text className='note-card-dot'>·</Text>
                  <Text className='note-card-days'>{note.dayCount}天</Text>
                </View>
                {note.publishNote && (
                  <Text className='note-card-desc'>{note.publishNote}</Text>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style='padding: 128rpx 0; text-align: center;'>
          <Text style='font-size: 64rpx; display: block; margin-bottom: 16rpx;'>📖</Text>
          <Text style='font-size: 28rpx; color: #7A7068; display: block;'>暂无游记</Text>
          <Text style='font-size: 24rpx; color: #7A7068; margin-top: 8rpx; display: block;'>创建行程后可以发布游记</Text>
        </View>
      )}
    </View>
  )
}
