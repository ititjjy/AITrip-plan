export interface RoomType {
  id: string
  name: string           // e.g., "标准双床房", "豪华大床房"
  bedType: string        // e.g., "双床", "大床", "单床"
  maxGuests: number
  area: number           // sqm
  price: number          // per night (CNY)
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
  /* Extended fields for rich hotel data */
  rating?: number          // 1-5 user rating
  stars?: number           // 1-5 hotel star rating
  priceRange?: [number, number]  // min/max per night
  description?: string
  amenities?: string[]     // ["Wi-Fi", "停车场", "泳池", "健身房", ...]
  images?: string[]
  phone?: string
  checkInTime?: string     // e.g., "14:00"
  checkOutTime?: string    // e.g., "12:00"
  roomTypes?: RoomType[]
  tags?: string[]
  reviewCount?: number
  distance?: number        // km from city center
}

export type BookingStatus = 'pending' | 'confirmed' | 'checked-in' | 'completed' | 'cancelled'

export interface Booking {
  id: string
  hotelId: string
  hotelName: string
  hotelAddress: string
  hotelImage?: string
  roomTypeId: string
  roomTypeName: string
  checkIn: string         // YYYY-MM-DD
  checkOut: string        // YYYY-MM-DD
  nights: number
  guestName: string
  guestPhone: string
  guestEmail?: string
  totalPrice: number
  status: BookingStatus
  createdAt: number
  updatedAt: number
  cityName?: string
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

export interface Attraction {
  id: string
  name: string
  /** Chinese name (中文名称) — for international POIs */
  nameZh?: string
  type: 'scenic' | 'food' | 'hotel' | 'shopping' | 'transport' | 'activity'
  image: string
  rating: number
  duration: number // in minutes
  cost: number
  description: string
  address: string
  lat: number
  lng: number
  tags: string[]
  openTime?: string
  closeTime?: string
  /** For food POIs: which meal slot it suits */
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  /** Why we recommend this place */
  recommendReason?: string
  /** Seasonal play index 1-5 (how good this season is for visiting) */
  seasonalIndex?: number
}

export interface ItineraryItem {
  id: string
  attractionId: string
  startTime: string // HH:mm
  endTime: string   // HH:mm
  notes: string
  cost: number
  type: 'scenic' | 'food' | 'hotel' | 'shopping' | 'transport' | 'activity'
  /** True if this meal was auto-filled from AI recommendations (not user-selected) */
  isAutoFilled?: boolean
  /** Which meal slot this food item occupies */
  mealSlot?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
}

export interface DayPlan {
  id: string
  date: string // YYYY-MM-DD
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

export type AppView =
  | 'home'
  | 'create'
  | 'hotel-step'
  | 'hotel-detail'
  | 'place-selection'
  | 'poi-overflow'
  | 'planner'
  | 'overview'
  | 'detail'
  | 'login'
  | 'register'
  | 'profile'
  | 'travel-notes'
  | 'note-detail'
  | 'journal'

/* ═══════════════════════ User & Social Types ═══════════════════════ */

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

export interface TravelNoteDetail extends TravelNote {
  tripData: string
  authorId: number
  isOwner: boolean
}

export interface Comment {
  id: number
  trip_id: string
  user_id: number
  content: string
  nickname: string
  avatar: string
  created_at: number
}

/* ═══════════════════════ Micro Note (微游记) Types ═══════════════════════ */

export type NoteMood = '😊' | '🤩' | '😋' | '🥰' | '😌' | '🎉' | '📸' | '🌅' | '❄️' | '🌸'

export interface MicroNote {
  id: string
  tripId: string
  /** Which POI this note is attached to */
  poiId: string
  poiName: string
  poiLat: number
  poiLng: number
  poiType: string
  /** Day number within the trip */
  dayNumber: number
  /** Note content */
  content: string
  /** Image URLs (max 9) */
  images: string[]
  /** Mood emoji */
  mood: NoteMood | ''
  /** Author info */
  authorName: string
  authorAvatar: string
  authorId: number
  /** Timestamps */
  createdAt: number
  updatedAt: number
}
