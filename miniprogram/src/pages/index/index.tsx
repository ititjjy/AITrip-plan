import { View, Text, Input, ScrollView, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useMemo, useCallback } from 'react'
import {
  allDestinations,
  searchDestinations,
  groupDomesticByLetter,
  groupInternationalByContinent,
  getDomesticLetters,
  quickSearchTags,
  type DestinationCity,
  type ContinentGroup,
  type CountrySection,
} from '../../data/destinations'
import { setState } from '../../store'
import './index.css'

/* ── Helpers ── */

function hotnessColor(h: number): string {
  if (h >= 90) return 'text-red-500'
  if (h >= 80) return 'text-orange-500'
  if (h >= 70) return 'text-amber-500'
  return 'text-yellow-600'
}

function hotnessBarBg(h: number): string {
  if (h >= 90) return 'bg-red-400'
  if (h >= 80) return 'bg-orange-400'
  if (h >= 70) return 'bg-amber-400'
  return 'bg-yellow-400'
}

/* ── Page ── */

export default function Index() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [activeTab, setActiveTab] = useState<'domestic' | 'international'>('domestic')
  const [selectedContinent, setSelectedContinent] = useState('亚洲')
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set())
  const [activeLetter, setActiveLetter] = useState<string | null>(null)

  const searchResults = useMemo(
    () => (searchQuery.trim() ? searchDestinations(searchQuery).slice(0, 12) : []),
    [searchQuery],
  )
  const domesticGroups = useMemo(() => groupDomesticByLetter(), [])
  const continentGroups = useMemo(() => groupInternationalByContinent(), [])
  const domesticLetters = useMemo(() => getDomesticLetters(), [])

  const goToCity = useCallback((city: DestinationCity) => {
    setState({ preSelectedCityId: city.id })
    Taro.switchTab({ url: '/pages/create-trip/index' })
    setSearchQuery('')
    setSearchFocused(false)
  }, [])

  const toggleCountry = (country: string) => {
    setExpandedCountries(prev => {
      const next = new Set(prev)
      if (next.has(country)) next.delete(country)
      else next.add(country)
      return next
    })
  }

  const handleQuickTag = (query: string) => {
    setSearchQuery(query)
    setSearchFocused(true)
  }

  return (
    <View className='index min-h-screen bg-white'>
      {/* ── 搜索英雄区 ── */}
      <View className='search-hero px-5 pt-16 pb-8'>
        <View className='text-center mb-6'>
          <Text className='text-3xl font-extrabold text-gray-900'>发现你的下一段</Text>
          <Text className='text-3xl font-extrabold text-[#FF6B6B]'>旅程</Text>
        </View>
        <Text className='block text-center text-sm text-gray-500 mb-6'>
          AI 智能规划行程，让每一次出发都恰到好处
        </Text>

        {/* 搜索栏 */}
        <View className='search-bar relative'>
          <View className={`flex items-center rounded-2xl border-2 bg-white shadow-sm ${searchFocused ? 'border-[#FF6B6B] shadow-lg' : 'border-gray-200'}`}>
            <Text className='ml-4 text-gray-400 text-lg'>🔍</Text>
            <Input
              className='flex-1 h-12 px-3 text-base'
              placeholder='告诉小智，你想去哪里玩'
              value={searchQuery}
              onInput={(e) => setSearchQuery(e.detail.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              confirmType='search'
            />
            {searchQuery ? (
              <View className='mr-3 p-1' onClick={() => { setSearchQuery(''); setSearchFocused(true) }}>
                <Text className='text-gray-400 text-sm'>✕</Text>
              </View>
            ) : (
              <View className='mr-3 w-9 h-9 rounded-xl bg-[#FF6B6B] flex items-center justify-center'>
                <Text className='text-white text-sm'>→</Text>
              </View>
            )}
          </View>

          {/* 搜索结果 */}
          {searchFocused && searchResults.length > 0 && (
            <View className='absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-lg'>
              {searchResults.map(({ city }) => (
                <View
                  key={city.id}
                  className='flex items-center gap-3 px-4 py-3 active:bg-gray-50'
                  onClick={() => goToCity(city)}
                >
                  <Image src={city.image} className='w-10 h-10 rounded-lg' mode='aspectFill' />
                  <View className='flex-1 min-w-0'>
                    <View className='flex items-center gap-2'>
                      <Text className='text-sm font-semibold text-gray-900'>{city.name}</Text>
                      <Text className='text-xs text-gray-400'>{city.nameEn}</Text>
                    </View>
                    <Text className='text-xs text-gray-400'>
                      {city.countryFlag} {city.isDomestic ? city.province : city.country} · ¥{city.avgDailyBudget}/天
                    </Text>
                  </View>
                  <View className='flex items-center gap-1'>
                    <Text className='text-xs'>🔥</Text>
                    <Text className={`text-xs font-bold ${hotnessColor(city.hotness)}`}>{city.hotness}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* 无结果 */}
          {searchFocused && searchQuery.trim() && searchResults.length === 0 && (
            <View className='absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-gray-100 bg-white px-6 py-8 text-center shadow-lg'>
              <Text className='block text-sm font-medium text-gray-700'>暂未收录该目的地</Text>
              <Text className='block mt-1 text-xs text-gray-400'>试试 "日本"、"海岛"、"巴黎"</Text>
            </View>
          )}
        </View>

        {/* 热门标签 */}
        {!searchFocused && (
          <View className='mt-5 flex flex-wrap items-center gap-2'>
            <Text className='text-xs text-gray-300 mr-1'>热门：</Text>
            {quickSearchTags.map((tag) => (
              <View
                key={tag.query}
                className='inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 active:bg-gray-50'
                onClick={() => handleQuickTag(tag.query)}
              >
                <Text className='text-xs'>{tag.emoji}</Text>
                <Text className='text-xs text-gray-500'>{tag.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── 目的地推荐 ── */}
      <View className='px-4 py-6'>
        {/* 标题 */}
        <View className='mb-5 text-center'>
          <View className='inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 mb-2'>
            <Text className='text-xs'>🔥</Text>
            <Text className='text-xs font-semibold text-red-500'>当月热门推荐</Text>
          </View>
          <Text className='block text-xl font-bold text-gray-900'>发现热门旅行目的地</Text>
        </View>

        {/* Tab 切换 */}
        <View className='flex justify-center mb-6'>
          <View className='inline-flex rounded-2xl bg-gray-100 p-1'>
            <View
              className={`rounded-xl px-5 py-2 text-sm font-semibold ${activeTab === 'domestic' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
              onClick={() => setActiveTab('domestic')}
            >
              <Text>🇨🇳 国内热门</Text>
            </View>
            <View
              className={`rounded-xl px-5 py-2 text-sm font-semibold ${activeTab === 'international' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
              onClick={() => setActiveTab('international')}
            >
              <Text>🌏 国际热门</Text>
            </View>
          </View>
        </View>

        {/* ── 国内 Tab ── */}
        {activeTab === 'domestic' && (
          <ScrollView scrollY className='domestic-list'>
            {/* 字母索引 */}
            <ScrollView scrollX className='mb-4 flex whitespace-nowrap'>
              <View className='inline-flex gap-1 px-1'>
                {domesticLetters.map(letter => (
                  <View
                    key={letter}
                    className={`inline-flex w-8 h-8 items-center justify-center rounded-lg text-xs font-bold ${activeLetter === letter ? 'bg-[#FF6B6B] text-white shadow-sm' : 'bg-gray-100 text-gray-400'}`}
                    onClick={() => setActiveLetter(letter)}
                  >
                    <Text>{letter}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* 字母分组城市 */}
            {domesticGroups.map(({ letter, cities }) => (
              <View key={letter} className='mb-6'>
                <View className='flex items-center gap-3 mb-3'>
                  <View className='w-9 h-9 rounded-xl bg-[#FF6B6B] flex items-center justify-center'>
                    <Text className='text-sm font-bold text-white'>{letter}</Text>
                  </View>
                  <View className='flex-1 h-px bg-gray-100' />
                </View>
                <View className='grid grid-cols-2 gap-3'>
                  {cities.map(city => (
                    <CityCard key={city.id} city={city} onSelect={goToCity} />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ── 国际 Tab ── */}
        {activeTab === 'international' && (
          <ScrollView scrollY className='international-list'>
            {/* 大洲标签 */}
            <ScrollView scrollX className='mb-4'>
              <View className='inline-flex gap-2 px-1'>
                {continentGroups.map((cg) => (
                  <View
                    key={cg.continent}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-2 ${selectedContinent === cg.continent ? 'border-[#FF6B6B] bg-red-50' : 'border-gray-200 bg-white'}`}
                    onClick={() => { setSelectedContinent(cg.continent); setExpandedCountries(new Set()) }}
                  >
                    <Text className='text-sm'>{cg.continentEmoji}</Text>
                    <Text className={`text-sm font-medium ${selectedContinent === cg.continent ? 'text-gray-900' : 'text-gray-500'}`}>{cg.continent}</Text>
                    <Text className={`rounded-full px-1.5 py-0.5 text-[10px] ${selectedContinent === cg.continent ? 'bg-red-100 text-red-500 font-bold' : 'bg-gray-100 text-gray-400'}`}>{cg.totalCities}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* 选中大洲内容 */}
            {continentGroups
              .filter((cg) => cg.continent === selectedContinent)
              .map((cg) => (
                <View key={cg.continent}>
                  <View className='rounded-2xl border border-gray-100 bg-white overflow-hidden'>
                    {cg.countries.map((cs) => (
                      <CountrySection
                        key={cs.country}
                        section={cs}
                        expanded={expandedCountries.has(cs.country)}
                        onToggle={() => toggleCountry(cs.country)}
                        onSelectCity={goToCity}
                      />
                    ))}
                  </View>
                </View>
              ))}
          </ScrollView>
        )}
      </View>
    </View>
  )
}

/* ═══════════════════════ 子组件 ═══════════════════════ */

function CityCard({ city, onSelect }: { city: DestinationCity; onSelect: (c: DestinationCity) => void }) {
  return (
    <View
      className='overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm active:scale-[0.98] transition-transform'
      onClick={() => onSelect(city)}
    >
      {/* 图片 */}
      <View className='relative h-28 overflow-hidden'>
        <Image src={city.image} className='w-full h-full' mode='aspectFill' />
        <View className='absolute inset-0 bg-gradient-to-t from-black/40 to-transparent' />
        {/* 热度 */}
        <View className='absolute top-2 right-2 flex items-center gap-0.5 rounded-full bg-black/40 px-1.5 py-0.5'>
          <Text className='text-[10px]'>🔥</Text>
          <Text className='text-[10px] font-bold text-white'>{city.hotness}</Text>
        </View>
        {/* 城市名 */}
        <View className='absolute bottom-2 left-2.5 right-2.5'>
          <Text className='text-sm font-bold text-white'>{city.name}</Text>
          <Text className='text-[10px] text-white/70'>{city.nameEn}</Text>
        </View>
      </View>
      {/* 信息 */}
      <View className='p-2.5'>
        <View className='flex items-center gap-2 mb-2'>
          <View className='h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden'>
            <View className={`h-full rounded-full ${hotnessBarBg(city.hotness)}`} style={{ width: `${city.hotness}%` }} />
          </View>
          <Text className='text-[10px] text-gray-400'>¥{city.avgDailyBudget}/天</Text>
        </View>
        <View className='flex flex-wrap gap-1'>
          {city.tags.slice(0, 3).map(tag => (
            <Text key={tag} className='rounded bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-500'>{tag}</Text>
          ))}
        </View>
      </View>
    </View>
  )
}

function CountrySection({ section, expanded, onToggle, onSelectCity }: {
  section: CountrySection
  expanded: boolean
  onToggle: () => void
  onSelectCity: (c: DestinationCity) => void
}) {
  return (
    <View className='border-b border-gray-50 last:border-b-0'>
      {/* 国家头 */}
      <View
        className='flex items-center gap-3 px-4 py-3.5 active:bg-gray-50'
        onClick={onToggle}
      >
        <Text className='text-xl'>{section.countryFlag}</Text>
        <View className='flex-1 min-w-0'>
          <View className='flex items-center gap-2'>
            <Text className='text-sm font-bold text-gray-900'>{section.country}</Text>
            <Text className='rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-400'>{section.totalCities}城</Text>
          </View>
          <View className='flex items-center gap-2 mt-0.5'>
            <View className='h-1 w-12 rounded-full bg-gray-100 overflow-hidden'>
              <View className={`h-full rounded-full ${hotnessBarBg(section.avgHotness)}`} style={{ width: `${section.avgHotness}%` }} />
            </View>
            <Text className={`text-[10px] font-bold ${hotnessColor(section.avgHotness)}`}>🔥 {section.avgHotness}</Text>
          </View>
        </View>
        <Text className={`text-gray-400 text-sm ${expanded ? 'rotate-180' : ''}`}>▼</Text>
      </View>

      {/* 展开内容 */}
      {expanded && (
        <View className='px-4 pb-4'>
          {/* 热门城市 */}
          <View className='mb-3'>
            <View className='flex items-center gap-2 mb-2'>
              <View className='flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5'>
                <Text className='text-[10px]'>🔥</Text>
                <Text className='text-[10px] font-bold text-red-500'>当季热门</Text>
              </View>
              <View className='flex-1 h-px bg-gray-50' />
            </View>
            <View className='grid grid-cols-2 gap-3'>
              {section.hotCities.map(city => (
                <CityCard key={city.id} city={city} onSelect={onSelectCity} />
              ))}
            </View>
          </View>

          {/* 更多城市 */}
          {section.otherByLetter.length > 0 && (
            <View>
              <View className='flex items-center gap-2 mb-2'>
                <Text className='text-[10px] font-bold text-gray-400'>更多城市</Text>
                <View className='flex-1 h-px bg-gray-50' />
              </View>
              {section.otherByLetter.map(({ letter, cities }) => (
                <View key={letter} className='mb-3'>
                  <View className='flex items-center gap-2 mb-2'>
                    <View className='w-6 h-6 rounded bg-gray-100 flex items-center justify-center'>
                      <Text className='text-[10px] font-bold text-gray-400'>{letter}</Text>
                    </View>
                    <View className='flex-1 h-px bg-gray-50' />
                  </View>
                  <View className='grid grid-cols-2 gap-3'>
                    {cities.map(city => (
                      <CityCard key={city.id} city={city} onSelect={onSelectCity} />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  )
}
