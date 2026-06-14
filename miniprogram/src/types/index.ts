/* ═══════════════════════ AITrip 小程序 — 共享类型定义 ═══════════════════════ */

export interface RoomType {
  id: string
  name: string
  bedType: string
  maxGuests: number
  area: number
  price: number
  originalPrice?: number
  breakfast: boolean
  amenities: string[]
  available: boolean
}

export interface HotelPOI {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  rating?: number
  stars?: number
  priceRange?: [number, number]
  description?: string
  amenities?: string[]
  images?: string[]
  phone?: string
  checkInTime?: string
  checkOutTime?: string
  roomTypes?: RoomType[]
  tags?: string[]
  reviewCount?: number
  distance?: number
}

export interface City {
  id: string
  name: string
  nameEn: string
  continent: string
  country: string
  province: string
  image: string
  description: string
  avgDailyBudget: number
  currency: string
  timezone: string
  tags: string[]
  lat: number
  lng: number
  isDomestic: boolean
}

export interface DestinationCity extends City {
  pinyin: string
  pinyinAbbr: string
  pinyinInitial: string
  hotness: number
  countryPinyin: string
  countryPinyinInitial: string
  countryFlag: string
}

export interface Attraction {
  id: string
  name: string        // 主名称（中文）
  nameLocal?: string  // 别名1：当地语言（日文/英文/法文等）
  nameEn?: string     // 别名2：英文名
  nameZh?: string     // 兼容旧字段
  type: 'scenic' | 'food' | 'hotel' | 'shopping' | 'transport' | 'activity'
  image: string
  rating: number
  duration: number
  cost: number
  description: string
  address: string
  lat: number
  lng: number
  tags: string[]
  openTime?: string
  closeTime?: string
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  recommendReason?: string
  seasonalIndex?: number
}

export interface ItineraryItem {
  id: string
  attractionId: string
  startTime: string
  endTime: string
  notes: string
  cost: number
  type: 'scenic' | 'food' | 'hotel' | 'shopping' | 'transport' | 'activity'
  isAutoFilled?: boolean
  mealSlot?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
}

export interface DayPlan {
  id: string
  date: string
  dayNumber: number
  items: ItineraryItem[]
  notes: string
  hotel?: HotelPOI | null
}

export interface Trip {
  id: string
  cityId: string
  cityName: string
  startDate: string
  endDate: string
  days: DayPlan[]
  totalBudget: number
  createdAt: string
}

export interface User {
  id: number
  email: string
  nickname: string
  avatar: string
}

export interface TripSummary {
  id: string
  cityId: string
  cityName: string
  title: string
  coverImage: string
  isPublished: boolean
  allowComments: boolean
  startDate?: string
  endDate?: string
  dayCount: number
  totalBudget: number
  createdAt: number
  updatedAt: number
}

export interface TravelNote {
  id: string
  cityName: string
  title: string
  coverImage: string
  publishNote: string
  authorName: string
  authorAvatar: string
  dayCount: number
  totalBudget: number
  startDate: string
  endDate: string
  allowComments: boolean
  createdAt: number
  updatedAt: number
}

export type NoteMood = '😊' | '🤩' | '😋' | '🥰' | '😌' | '🎉' | '📸' | '🌅' | '❄️' | '🌸'

export interface MicroNote {
  id: string
  tripId: string
  poiId: string
  poiName: string
  poiLat: number
  poiLng: number
  poiType: string
  dayNumber: number
  content: string
  images: string[]
  mood: NoteMood | ''
  authorName: string
  authorAvatar: string
  authorId: number
  createdAt: number
  updatedAt: number
}
