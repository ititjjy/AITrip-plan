import { View, Text, Image, ScrollView } from '@tarojs/components'
import { useState } from 'react'
import { getState } from '../../store'
import type { HotelPOI } from '../../types'
import './index.css'

export default function HotelDetailPage() {
  const [hotel, setHotel] = useState<HotelPOI | null>(null)

  const data = getState().detailHotelData
  if (data && !hotel) {
    try { setHotel(JSON.parse(data)) } catch { /* ignore */ }
  }

  if (!hotel) {
    return <View className='flex items-center justify-center min-h-screen'><Text className='text-gray-400'>未找到酒店信息</Text></View>
  }

  return (
    <View className='hotel-detail min-h-screen bg-white'>
      {/* 图片 */}
      {hotel.images && hotel.images[0] && (
        <Image src={hotel.images[0]} className='w-full h-56' mode='aspectFill' />
      )}
      {!hotel.images?.length && (
        <View className='w-full h-56 bg-gray-100 flex items-center justify-center'>
          <Text className='text-5xl'>🏨</Text>
        </View>
      )}

      <View className='px-5 py-4'>
        <View className='flex items-center gap-2 mb-1'>
          <Text className='text-xl font-bold text-gray-900'>{hotel.name}</Text>
          {hotel.stars && <Text className='text-amber-400 text-sm'>{'⭐'.repeat(Math.min(hotel.stars, 5))}</Text>}
        </View>
        <Text className='text-sm text-gray-400 block mb-3'>{hotel.address}</Text>

        <View className='flex items-center gap-4 mb-4'>
          {hotel.rating && (
            <View className='flex items-center gap-1'>
              <Text className='text-amber-400'>★</Text>
              <Text className='text-sm font-medium text-gray-700'>{hotel.rating}</Text>
              {hotel.reviewCount && <Text className='text-xs text-gray-400'>({hotel.reviewCount}条评价)</Text>}
            </View>
          )}
          {hotel.priceRange && (
            <Text className='text-sm text-[#FF6B6B] font-medium'>¥{hotel.priceRange[0]}-{hotel.priceRange[1]}/晚</Text>
          )}
          {hotel.distance !== undefined && (
            <Text className='text-sm text-gray-400'>距市中心{hotel.distance.toFixed(1)}km</Text>
          )}
        </View>

        {hotel.description && (
          <View className='mb-4'>
            <Text className='text-sm font-medium text-gray-700 block mb-1'>酒店介绍</Text>
            <Text className='text-sm text-gray-500 leading-relaxed'>{hotel.description}</Text>
          </View>
        )}

        {hotel.amenities && hotel.amenities.length > 0 && (
          <View className='mb-4'>
            <Text className='text-sm font-medium text-gray-700 block mb-2'>设施服务</Text>
            <View className='flex flex-wrap gap-2'>
              {hotel.amenities.map(a => (
                <Text key={a} className='rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500'>{a}</Text>
              ))}
            </View>
          </View>
        )}

        {(hotel.checkInTime || hotel.checkOutTime) && (
          <View className='flex gap-4 mb-4'>
            {hotel.checkInTime && (
              <View className='rounded-xl bg-gray-50 px-3 py-2'>
                <Text className='text-[10px] text-gray-400'>入住时间</Text>
                <Text className='text-sm font-medium text-gray-700 block'>{hotel.checkInTime}</Text>
              </View>
            )}
            {hotel.checkOutTime && (
              <View className='rounded-xl bg-gray-50 px-3 py-2'>
                <Text className='text-[10px] text-gray-400'>退房时间</Text>
                <Text className='text-sm font-medium text-gray-700 block'>{hotel.checkOutTime}</Text>
              </View>
            )}
          </View>
        )}

        {hotel.phone && (
          <View className='flex items-center gap-2'>
            <Text className='text-sm'>📞</Text>
            <Text className='text-sm text-[#FF6B6B]'>{hotel.phone}</Text>
          </View>
        )}
      </View>
    </View>
  )
}
