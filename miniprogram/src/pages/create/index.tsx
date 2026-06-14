import { View, Text, Input, ScrollView, Image, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { allDestinations, type DestinationCity } from '../../data/destinations'
import { setState, getState, generateDays } from '../../store'
import type { Trip } from '../../types'
import './index.css'

const MAX_DAYS = 30

const QUICK_DURATIONS = [
  { label: '短途', days: 3, emoji: '⚡' },
  { label: '小长假', days: 5, emoji: '🌿' },
  { label: '深度游', days: 7, emoji: '🗺️' },
  { label: '慢旅行', days: 10, emoji: '🌊' },
  { label: '长假', days: 14, emoji: '✈️' },
]

const citySeasonTips: Record<string, { bestSeason: string; weather: string; tip: string }> = {
  tokyo: { bestSeason: '3-5月 / 10-11月', weather: '春季赏樱，秋季赏红叶', tip: '建议购买东京地铁通票，出行更方便' },
  paris: { bestSeason: '4-6月 / 9-10月', weather: '温和舒适，适合步行游览', tip: '提前预约热门景点门票，避免排队' },
  bali: { bestSeason: '4-10月', weather: '旱季少雨，阳光充沛', tip: '建议包车游览，灵活自由' },
  kyoto: { bestSeason: '3-5月 / 10-11月', weather: '四季分明，春秋最宜', tip: '推荐体验和服漫步祇园' },
  santorini: { bestSeason: '5-9月', weather: '地中海气候，晴朗温暖', tip: '提前预订悬崖酒店，旺季一房难求' },
  bangkok: { bestSeason: '11-2月', weather: '凉季少雨，气温宜人', tip: '注意防晒和补水，尝试当地夜市' },
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

function diffDays(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `${d.getMonth() + 1}月${d.getDate()}日 周${weekdays[d.getDay()]}`
}

export default function CreateTripPage() {
  const [step, setStep] = useState<1 | 2>(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null)

  /* 从首页预选城市 */
  useEffect(() => {
    const { preSelectedCityId } = getState()
    if (preSelectedCityId) {
      const cityExists = allDestinations.some(c => c.id === preSelectedCityId)
      if (cityExists) {
        setSelectedCityId(preSelectedCityId)
        setStep(2)
      }
      setState({ preSelectedCityId: null })
    }
  }, [])

  const tomorrow = useMemo(() => addDays(toDateStr(new Date()), 1), [])
  const todayStr = useMemo(() => toDateStr(new Date()), [])

  const [startDate, setStartDate] = useState(tomorrow)
  const [endDate, setEndDate] = useState(tomorrow)
  const [selectedDays, setSelectedDays] = useState(1)

  const dayCount = useMemo(() => {
    if (!startDate || !endDate) return 0
    const d = diffDays(startDate, endDate)
    return d > 0 ? d : 0
  }, [startDate, endDate])

  const isDateValid = useMemo(() => {
    return startDate && endDate && dayCount >= 1 && dayCount <= MAX_DAYS
  }, [startDate, endDate, dayCount])

  const handleSetDays = useCallback((days: number) => {
    const clamped = Math.max(1, Math.min(MAX_DAYS, days))
    setSelectedDays(clamped)
    setEndDate(addDays(startDate, clamped - 1))
  }, [startDate])

  const handleStartDateChange = useCallback((newStart: string) => {
    setStartDate(newStart)
    setEndDate(addDays(newStart, selectedDays - 1))
  }, [selectedDays])

  const filteredCities = useMemo(() => {
    if (!searchQuery.trim()) return allDestinations
    const q = searchQuery.toLowerCase()
    return allDestinations.filter(
      (c) =>
        c.name.includes(q) ||
        c.nameEn.toLowerCase().includes(q) ||
        c.country.includes(q) ||
        c.province.includes(q) ||
        c.tags.some((t) => t.includes(q))
    )
  }, [searchQuery])

  const selectedCity = allDestinations.find((c) => c.id === selectedCityId)

  const handleCreateTrip = () => {
    if (!selectedCity || !isDateValid) return
    const trip: Trip = {
      id: `trip-${Date.now()}`,
      cityId: selectedCity.id,
      cityName: selectedCity.name,
      startDate,
      endDate,
      days: generateDays(startDate, endDate),
      totalBudget: 0,
      createdAt: new Date().toISOString(),
    }
    setState({ currentTrip: trip, selectedDayIndex: 0, skippedPOIs: [] })
    Taro.navigateTo({ url: '/pages/hotel-step/index' })
  }

  const seasonTip = selectedCityId ? citySeasonTips[selectedCityId] : null

  return (
    <View className='create-page min-h-screen bg-white'>
      {/* 顶部导航 */}
      <View className='fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100'>
        <View className='flex items-center justify-between h-12 px-4'>
          <View className='flex items-center gap-2' onClick={() => {
            if (step === 2) setStep(1)
            else Taro.navigateBack()
          }}>
            <Text className='text-sm text-gray-500'>← {step === 2 ? '返回选择' : '返回'}</Text>
          </View>
          {/* 步骤指示器 */}
          <View className='flex items-center gap-2'>
            <View className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-[#FF6B6B] text-white' : 'bg-gray-200 text-gray-400'}`}>
              {step > 1 ? '✓' : '1'}
            </View>
            <View className='w-8 h-0.5 rounded-full bg-gray-200 overflow-hidden'>
              <View className={`h-full rounded-full transition-all ${step >= 2 ? 'w-full bg-[#FF6B6B]' : 'w-0'}`} />
            </View>
            <View className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? 'bg-[#FF6B6B] text-white' : 'bg-gray-200 text-gray-400'}`}>2</View>
          </View>
          <View className='w-16' />
        </View>
      </View>

      <View className='pt-14 px-4 py-6'>
        {/* ===== 步骤1：选择目的地 ===== */}
        {step === 1 && (
          <View>
            <View className='text-center mb-6'>
              <View className='inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 mb-2'>
                <Text className='text-xs'>✈️</Text>
                <Text className='text-xs font-semibold text-red-500'>第一步 · 选择目的地</Text>
              </View>
              <Text className='block text-2xl font-bold text-gray-900'>你想去哪里？</Text>
              <Text className='block text-sm text-gray-400 mt-1'>从热门目的地中选择，或搜索你心仪的城市</Text>
            </View>

            {/* 搜索框 */}
            <View className='relative mb-6'>
              <View className='flex items-center rounded-2xl border border-gray-200 bg-white shadow-sm'>
                <Text className='ml-4 text-gray-400'>🔍</Text>
                <Input
                  className='flex-1 h-12 px-3 text-base'
                  placeholder='搜索城市、国家或标签...'
                  value={searchQuery}
                  onInput={(e) => setSearchQuery(e.detail.value)}
                  confirmType='search'
                />
                {searchQuery ? (
                  <View className='mr-3 p-1' onClick={() => setSearchQuery('')}>
                    <Text className='text-gray-400 text-sm'>✕</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* 城市网格 */}
            <ScrollView scrollY style={{ maxHeight: '65vh' }}>
              <View className='grid grid-cols-2 gap-3'>
                {filteredCities.slice(0, 20).map((city) => (
                  <View
                    key={city.id}
                    className={`overflow-hidden rounded-2xl border-2 shadow-sm active:scale-[0.98] transition-transform ${selectedCityId === city.id ? 'border-[#FF6B6B]' : 'border-transparent'}`}
                    onClick={() => { setSelectedCityId(city.id); setStep(2) }}
                  >
                    <View className='relative h-36 overflow-hidden'>
                      <Image src={city.image} className='w-full h-full' mode='aspectFill' />
                      <View className='absolute inset-0 bg-gradient-to-t from-black/50 to-transparent' />
                      <View className='absolute bottom-2 left-3 right-3'>
                        <View className='flex items-center gap-1'>
                          <Text className='text-base font-bold text-white'>{city.name}</Text>
                          <Text className='text-xs text-white/70'>{city.nameEn}</Text>
                        </View>
                        <Text className='text-xs text-white/80'>{city.isDomestic ? city.province : city.country}</Text>
                      </View>
                      {selectedCityId === city.id && (
                        <View className='absolute right-2 top-2 w-6 h-6 rounded-full bg-[#FF6B6B] flex items-center justify-center'>
                          <Text className='text-white text-xs'>✓</Text>
                        </View>
                      )}
                      <View className='absolute left-2 top-2 rounded-full bg-black/30 px-2 py-0.5'>
                        <Text className='text-[10px] font-semibold text-white'>¥{city.avgDailyBudget}/天</Text>
                      </View>
                    </View>
                    <View className='bg-white p-3'>
                      <Text className='block text-xs text-gray-400 mb-2 line-clamp-2'>{city.description}</Text>
                      <View className='flex flex-wrap gap-1'>
                        {city.tags.slice(0, 3).map(tag => (
                          <Text key={tag} className='rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500'>{tag}</Text>
                        ))}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
              {filteredCities.length === 0 && (
                <View className='py-16 text-center'>
                  <Text className='block text-sm text-gray-400'>没有找到匹配的城市</Text>
                  <Text className='block text-xs text-gray-300 mt-1'>试试 "日本"、"海滩"、"美食"</Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {/* ===== 步骤2：选择日期 ===== */}
        {step === 2 && selectedCity && (
          <ScrollView scrollY style={{ maxHeight: '85vh' }}>
            <View className='text-center mb-6'>
              <View className='inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 mb-2'>
                <Text className='text-xs'>📅</Text>
                <Text className='text-xs font-semibold text-red-500'>第二步 · 选择旅行日期</Text>
              </View>
              <Text className='block text-2xl font-bold text-gray-900'>
                什么时候出发去
                <Text className='text-[#FF6B6B]'>{selectedCity.name}</Text>？
              </Text>
            </View>

            {/* 选中城市卡片 */}
            <View className='mb-6 rounded-2xl overflow-hidden shadow-sm'>
              <View className='relative h-32'>
                <Image src={selectedCity.image} className='w-full h-full' mode='aspectFill' />
                <View className='absolute inset-0 bg-gradient-to-t from-black/50 to-transparent' />
                <View className='absolute bottom-3 left-4 right-4 flex items-end justify-between'>
                  <View>
                    <Text className='text-lg font-bold text-white'>{selectedCity.name}</Text>
                    <Text className='text-xs text-white/80'>
                      {selectedCity.isDomestic ? selectedCity.province : selectedCity.country} · {selectedCity.nameEn}
                    </Text>
                  </View>
                  <View
                    className='rounded-full bg-white/20 px-2 py-1'
                    onClick={() => setStep(1)}
                  >
                    <Text className='text-xs text-white'>更换城市</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* 旅行小贴士 */}
            {seasonTip && (
              <View className='mb-5 rounded-xl border border-gray-100 bg-white p-4 shadow-sm'>
                <View className='flex items-center gap-2 mb-3'>
                  <Text className='text-sm'>✨</Text>
                  <Text className='text-sm font-semibold text-gray-900'>旅行小贴士</Text>
                </View>
                <View className='grid grid-cols-2 gap-2'>
                  <View className='rounded-lg bg-gray-50 px-3 py-2'>
                    <Text className='text-[10px] text-gray-400'>☀️ 最佳旅行季节</Text>
                    <Text className='text-xs font-semibold text-gray-900 mt-0.5'>{seasonTip.bestSeason}</Text>
                  </View>
                  <View className='rounded-lg bg-gray-50 px-3 py-2'>
                    <Text className='text-[10px] text-gray-400'>💰 日均预算</Text>
                    <Text className='text-xs font-semibold text-gray-900 mt-0.5'>¥{selectedCity.avgDailyBudget}</Text>
                  </View>
                </View>
                <Text className='block mt-2 text-xs text-gray-400'>💡 {seasonTip.tip}</Text>
              </View>
            )}

            {/* 出发日期 */}
            <View className='mb-5'>
              <View className='flex items-center gap-2 mb-2'>
                <View className='w-5 h-5 rounded bg-[#FF6B6B] flex items-center justify-center'>
                  <Text className='text-[10px] text-white'>✈️</Text>
                </View>
                <Text className='text-sm font-medium text-gray-900'>出发日期</Text>
              </View>
              <Picker mode='date' value={startDate} start={todayStr} onChange={(e) => handleStartDateChange(e.detail.value)}>
                <View className='h-12 rounded-xl border border-gray-200 bg-white px-4 flex items-center shadow-sm'>
                  <Text className='text-sm text-gray-900'>{formatDate(startDate)}</Text>
                  <Text className='ml-auto text-xs text-gray-400'>点击选择 ›</Text>
                </View>
              </Picker>
            </View>

            {/* 游玩天数 */}
            <View className='mb-5'>
              <View className='flex items-center gap-2 mb-2'>
                <View className='w-5 h-5 rounded bg-red-50 flex items-center justify-center'>
                  <Text className='text-[10px]'>🕐</Text>
                </View>
                <Text className='text-sm font-medium text-gray-900'>游玩天数</Text>
                <Text className='ml-auto text-[10px] text-gray-300'>最多{MAX_DAYS}天</Text>
              </View>
              {/* 快捷选择 */}
              <View className='flex flex-wrap gap-2 mb-3'>
                {QUICK_DURATIONS.map((d) => (
                  <View
                    key={d.days}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 ${selectedDays === d.days ? 'border-[#FF6B6B] bg-red-50' : 'border-gray-200 bg-white'}`}
                    onClick={() => handleSetDays(d.days)}
                  >
                    <Text className='text-xs'>{d.emoji}</Text>
                    <Text className={`text-xs font-medium ${selectedDays === d.days ? 'text-red-500' : 'text-gray-600'}`}>
                      {d.days}天{d.label}
                    </Text>
                  </View>
                ))}
              </View>
              {/* 步进器 */}
              <View className='flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm'>
                <View
                  className={`w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center ${selectedDays <= 1 ? 'opacity-30' : 'active:bg-gray-200'}`}
                  onClick={() => selectedDays > 1 && handleSetDays(selectedDays - 1)}
                >
                  <Text className='text-gray-600'>−</Text>
                </View>
                <View className='text-center'>
                  <Text className='text-2xl font-bold text-gray-900'>{selectedDays}</Text>
                  <Text className='text-sm text-gray-400 ml-1'>天</Text>
                  {selectedDays > 1 && (
                    <Text className='text-xs text-gray-300 ml-2'>{selectedDays - 1}晚</Text>
                  )}
                </View>
                <View
                  className={`w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center ${selectedDays >= MAX_DAYS ? 'opacity-30' : 'active:bg-gray-200'}`}
                  onClick={() => selectedDays < MAX_DAYS && handleSetDays(selectedDays + 1)}
                >
                  <Text className='text-gray-600'>+</Text>
                </View>
              </View>
            </View>

            {/* 返回日期 */}
            <View className='mb-5'>
              <View className='flex items-center gap-2 mb-2'>
                <View className='w-5 h-5 rounded bg-amber-100 flex items-center justify-center'>
                  <Text className='text-[10px]'>🛬</Text>
                </View>
                <Text className='text-sm font-medium text-gray-900'>返回日期</Text>
                <Text className='ml-auto text-[10px] text-gray-300'>由天数自动计算</Text>
              </View>
              <Picker mode='date' value={endDate} start={startDate} onChange={(e) => {
                const newEnd = e.detail.value
                if (new Date(newEnd) < new Date(startDate)) return
                const newDays = diffDays(startDate, newEnd)
                if (newDays > MAX_DAYS) return
                setEndDate(newEnd)
                setSelectedDays(newDays)
              }}>
                <View className='h-12 rounded-xl border border-gray-200 bg-white px-4 flex items-center shadow-sm'>
                  <Text className='text-sm text-gray-900'>{formatDate(endDate)}</Text>
                  <Text className='ml-auto text-xs text-gray-400'>点击选择 ›</Text>
                </View>
              </Picker>
            </View>

            {/* 行程摘要 */}
            {dayCount > 0 && dayCount <= MAX_DAYS && (
              <View className='mb-5 rounded-2xl border border-gray-100 overflow-hidden shadow-sm'>
                <View className='bg-gradient-to-r from-[#FF6B6B] to-[#FF8E8E] p-5'>
                  <View className='text-center'>
                    <Text className='block text-xs text-white/70'>你的旅行计划</Text>
                    <Text className='block text-xl font-bold text-white mt-1'>
                      {selectedCity.name} · {dayCount}天{dayCount > 1 ? `${dayCount - 1}晚` : ''}
                    </Text>
                  </View>
                  <View className='flex items-center justify-center gap-4 mt-2'>
                    <Text className='text-sm text-white/80'>✈️ {formatDate(startDate)}</Text>
                    <Text className='text-white/50'>→</Text>
                    <Text className='text-sm text-white/80'>🛬 {formatDate(endDate)}</Text>
                  </View>
                </View>
                <View className='grid grid-cols-3 divide-x divide-gray-100 bg-white'>
                  <View className='px-3 py-3 text-center'>
                    <Text className='block text-[10px] text-gray-400'>🕐 旅行天数</Text>
                    <Text className='block text-lg font-bold text-gray-900 mt-0.5'>{dayCount}<Text className='text-xs font-normal text-gray-400'> 天</Text></Text>
                  </View>
                  <View className='px-3 py-3 text-center'>
                    <Text className='block text-[10px] text-gray-400'>💰 预估费用</Text>
                    <Text className='block text-lg font-bold text-gray-900 mt-0.5'>¥{(dayCount * selectedCity.avgDailyBudget).toLocaleString()}</Text>
                  </View>
                  <View className='px-3 py-3 text-center'>
                    <Text className='block text-[10px] text-gray-400'>📍 日均预算</Text>
                    <Text className='block text-lg font-bold text-gray-900 mt-0.5'>¥{selectedCity.avgDailyBudget}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* 开始按钮 */}
            <View className='mt-4 pb-8'>
              <View
                className={`w-full h-12 rounded-xl flex items-center justify-center shadow-lg ${isDateValid ? 'bg-[#FF6B6B] active:bg-[#e55a5a]' : 'bg-gray-200'}`}
                onClick={() => isDateValid && handleCreateTrip()}
              >
                <Text className={`text-base font-semibold ${isDateValid ? 'text-white' : 'text-gray-400'}`}>
                  开始规划行程 →
                </Text>
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  )
}
