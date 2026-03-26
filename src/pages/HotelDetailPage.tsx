/**
 * HotelDetailPage.tsx – 酒店详情页
 * 图片轮播、酒店信息、房型列表、设施展示、预订入口
 */

import { useState, useMemo, useEffect, type ElementType } from 'react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { HotelPOI, RoomType } from '@/types'
import {
  ArrowLeft, Star, MapPin, Phone, Clock, ChevronLeft, ChevronRight,
  Wifi, Car, Waves, Dumbbell, UtensilsCrossed, Briefcase, Sparkles,
  Plane, ShirtIcon, Package, BadgeCheck, Users, BedDouble, Maximize2,
  Coffee, Check, X, Loader2,
} from 'lucide-react'

/* -- Amenity icon map -- */
const amenityIcons: Record<string, ElementType> = {
  'Wi-Fi': Wifi, 'wifi': Wifi, 'WIFI': Wifi,
  '停车场': Car, '泳池': Waves, '游泳池': Waves,
  '健身房': Dumbbell, '餐厅': UtensilsCrossed, '商务中心': Briefcase,
  'SPA': Sparkles, '接送机': Plane, '洗衣服务': ShirtIcon,
  '行李寄存': Package, '24小时前台': BadgeCheck, '会议室': Briefcase,
}

function AmenityIcon({ name }: { name: string }) {
  const Icon = amenityIcons[name] || Check
  return <Icon className="h-4 w-4" />
}

/* -- Star rating display -- */
function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const stars = Math.round(rating * 2) / 2
  const sizeClass = size === 'md' ? 'h-4 w-4' : 'h-3 w-3'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${sizeClass} ${i <= stars ? 'fill-amber-400 text-amber-400' : i - 0.5 <= stars ? 'fill-amber-400/50 text-amber-400' : 'text-muted-foreground/30'}`}
        />
      ))}
    </div>
  )
}

/* -- Image Carousel -- */
function ImageCarousel({ images, name }: { images: string[]; name: string }) {
  const [current, setCurrent] = useState(0)
  const imgs = images.length > 0 ? images : ['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=500&fit=crop']

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted sm:aspect-[2.2/1] sm:rounded-2xl">
      {imgs.map((img, i) => (
        <img
          key={i}
          src={img}
          alt={`${name} ${i + 1}`}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${i === current ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />

      {/* Navigation */}
      {imgs.length > 1 && (
        <>
          <button
            onClick={() => setCurrent((c) => (c - 1 + imgs.length) % imgs.length)}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/20 p-2 text-white backdrop-blur-sm transition-all hover:bg-white/40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCurrent((c) => (c + 1) % imgs.length)}
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/20 p-2 text-white backdrop-blur-sm transition-all hover:bg-white/40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          {/* Dots */}
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {imgs.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`h-1.5 rounded-full transition-all ${i === current ? 'w-6 bg-white' : 'w-1.5 bg-white/50'}`}
              />
            ))}
          </div>
        </>
      )}

      {/* Photo count badge */}
      <span className="absolute right-3 top-3 z-10 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
        {current + 1} / {imgs.length}
      </span>
    </div>
  )
}

/* -- Room Type Card -- */
function RoomCard({ room, onBook }: { room: RoomType; onBook: (room: RoomType) => void }) {
  return (
    <div className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:shadow-card-hover sm:flex-row sm:items-center sm:p-5">
      {/* Room info */}
      <div className="flex-1 min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <h4 className="text-sm font-semibold text-foreground sm:text-base">{room.name}</h4>
          {room.breakfast && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
              <Coffee className="h-3 w-3" /> 含早
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{room.bedType}</span>
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{room.maxGuests}人</span>
          <span className="flex items-center gap-1"><Maximize2 className="h-3.5 w-3.5" />{room.area}m²</span>
        </div>
        {room.amenities.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {room.amenities.slice(0, 5).map((a) => (
              <span key={a} className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{a}</span>
            ))}
          </div>
        )}
      </div>

      {/* Price + Book */}
      <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-center sm:gap-2">
        <div className="text-right">
          {room.originalPrice && room.originalPrice > room.price && (
            <span className="text-xs text-muted-foreground line-through">¥{room.originalPrice}</span>
          )}
          <div className="flex items-baseline gap-0.5">
            <span className="text-lg font-bold text-primary sm:text-xl">¥{room.price}</span>
            <span className="text-[10px] text-muted-foreground">/晚</span>
          </div>
        </div>
        <button
          onClick={() => onBook(room)}
          disabled={!room.available}
          className={`rounded-xl px-5 py-2 text-xs font-semibold transition-all sm:px-6 sm:py-2.5 sm:text-sm ${
            room.available
              ? 'gradient-hero text-primary-foreground shadow-elegant hover:shadow-float hover:-translate-y-0.5'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          {room.available ? '预订' : '满房'}
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════ Booking Modal ═══════════════════════ */

function BookingModal({
  hotel, room, onClose, onSuccess,
}: {
  hotel: HotelPOI
  room: RoomType
  onClose: () => void
  onSuccess: () => void
}) {
  const { state } = useApp()
  const { user, getAuthHeaders, requireAuth } = useAuth()
  const trip = state.currentTrip

  const [checkIn, setCheckIn] = useState(trip?.startDate || new Date().toISOString().split('T')[0])
  const [checkOut, setCheckOut] = useState(trip?.endDate || '')
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestEmail, setGuestEmail] = useState(user?.email || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'form' | 'success'>('form')

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 1
    const diff = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)
    return Math.max(1, Math.round(diff))
  }, [checkIn, checkOut])

  const totalPrice = room.price * nights

  const handleSubmit = async () => {
    if (!user) {
      requireAuth('请先登录后再预订酒店')
      return
    }
    if (!guestName.trim()) { setError('请输入入住人姓名'); return }
    if (!guestPhone.trim()) { setError('请输入联系电话'); return }
    if (!checkIn || !checkOut) { setError('请选择入住和离店日期'); return }
    if (new Date(checkOut) <= new Date(checkIn)) { setError('离店日期必须晚于入住日期'); return }

    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotelId: hotel.id,
          hotelName: hotel.name,
          hotelAddress: hotel.address,
          hotelImage: hotel.images?.[0] || '',
          roomTypeId: room.id,
          roomTypeName: room.name,
          checkIn,
          checkOut,
          nights,
          guestName: guestName.trim(),
          guestPhone: guestPhone.trim(),
          guestEmail: guestEmail.trim(),
          totalPrice,
          cityName: state.currentTrip?.cityName || '',
        }),
      })
      const data = await res.json()
      if (data.success) {
        setStep('success')
        setTimeout(onSuccess, 2000)
      } else {
        setError(data.message || '预订失败，请重试')
      }
    } catch {
      setError('网络错误，请重试')
    }
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-float animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">
            {step === 'success' ? '预订成功' : '确认预订'}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary transition-smooth">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 'success' ? (
          <div className="px-5 py-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h4 className="mb-2 text-lg font-bold text-foreground">预订已确认!</h4>
            <p className="text-sm text-muted-foreground">
              {hotel.name} · {room.name}<br />
              {checkIn} ~ {checkOut} · {nights}晚 · ¥{totalPrice}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">可在个人中心「我的预订」中查看订单详情</p>
          </div>
        ) : (
          <>
            {/* Hotel + Room summary */}
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-start gap-3">
                <img
                  src={hotel.images?.[0] || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200&h=140&fit=crop'}
                  alt={hotel.name}
                  className="h-16 w-24 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-foreground">{hotel.name}</h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">{room.name} · {room.bedType} · {room.area}m²</p>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-base font-bold text-primary">¥{room.price}</span>
                    <span className="text-[10px] text-muted-foreground">/晚</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4 px-5 py-4">
              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">入住日期</label>
                  <input
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">离店日期</label>
                  <input
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    min={checkIn}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Guest info */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">入住人姓名 *</label>
                <input
                  type="text"
                  placeholder="请输入真实姓名"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">联系电话 *</label>
                <input
                  type="tel"
                  placeholder="请输入手机号码"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">邮箱（选填）</label>
                <input
                  type="email"
                  placeholder="接收确认邮件"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border px-5 py-4">
              <div>
                <p className="text-xs text-muted-foreground">{nights}晚 · 含税总价</p>
                <p className="text-xl font-bold text-primary">¥{totalPrice}</p>
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 rounded-xl gradient-hero px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant transition-all hover:shadow-float disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? '提交中...' : '确认预订'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════ Main Page ═══════════════════════ */

export default function HotelDetailPage() {
  const { state, dispatch } = useApp()
  const [bookingRoom, setBookingRoom] = useState<RoomType | null>(null)

  // Parse hotel data from context
  const hotel: HotelPOI | null = useMemo(() => {
    if (!state.detailHotelData) return null
    try { return JSON.parse(state.detailHotelData) } catch { return null }
  }, [state.detailHotelData])

  // Navigate away if no hotel data (useEffect to avoid render-phase side effect)
  useEffect(() => {
    if (!hotel) dispatch({ type: 'GO_BACK', fallback: 'hotel-step' })
  }, [hotel, dispatch])

  if (!hotel) return null

  const rooms = hotel.roomTypes || []
  const amenities = hotel.amenities || []
  const minPrice = hotel.priceRange?.[0] || (rooms.length > 0 ? Math.min(...rooms.map(r => r.price)) : 0)

  return (
    <div className="min-h-screen bg-background">
      {/* Back button overlay */}
      <div className="sticky top-0 z-[100] sm:relative">
        <div className="absolute left-3 top-3 z-20 sm:left-4 sm:top-4">
          <button
            onClick={() => dispatch({ type: 'GO_BACK', fallback: 'hotel-step' })}
            className="flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-sm font-medium text-foreground shadow-card backdrop-blur-sm transition-all hover:bg-white hover:shadow-card-hover"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">返回</span>
          </button>
        </div>
      </div>

      {/* Image carousel */}
      <ImageCarousel images={hotel.images || []} name={hotel.name} />

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 pb-32 sm:px-6">
        {/* Hotel header info */}
        <div className="relative -mt-8 rounded-2xl border border-border bg-card p-5 shadow-card sm:-mt-12 sm:p-6">
          {/* Stars badge */}
          {hotel.stars && (
            <div className="absolute -top-3 left-5 rounded-full badge-hotel px-3 py-1 text-[10px] font-bold text-white shadow-elegant">
              {hotel.stars}星级酒店
            </div>
          )}

          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <h1 className="mb-2 text-xl font-bold text-foreground sm:text-2xl">{hotel.name}</h1>

              <div className="mb-3 flex flex-wrap items-center gap-3">
                {hotel.rating && (
                  <div className="flex items-center gap-1.5">
                    <StarRating rating={hotel.rating} size="md" />
                    <span className="text-sm font-semibold text-foreground">{hotel.rating.toFixed(1)}</span>
                    {hotel.reviewCount && (
                      <span className="text-xs text-muted-foreground">({hotel.reviewCount}条评价)</span>
                    )}
                  </div>
                )}
                {hotel.distance && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> 距市中心 {hotel.distance}km
                  </span>
                )}
              </div>

              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {hotel.address}
              </p>

              {hotel.description && (
                <p className="mt-3 text-sm leading-relaxed text-foreground/80">{hotel.description}</p>
              )}
            </div>

            {/* Price summary */}
            <div className="shrink-0 rounded-xl gradient-warm border border-border p-4 text-center sm:min-w-[140px]">
              <p className="text-[10px] text-muted-foreground">最低价起</p>
              <p className="mt-1 text-2xl font-bold text-primary">¥{minPrice}</p>
              <p className="text-[10px] text-muted-foreground">/晚</p>
            </div>
          </div>

          {/* Tags */}
          {hotel.tags && hotel.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {hotel.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-secondary-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Quick info row */}
          <div className="mt-4 flex flex-wrap gap-4 rounded-xl bg-secondary/50 px-4 py-3 text-xs text-muted-foreground">
            {hotel.checkInTime && (
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> 入住 {hotel.checkInTime}</span>
            )}
            {hotel.checkOutTime && (
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> 退房 {hotel.checkOutTime}</span>
            )}
            {hotel.phone && (
              <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {hotel.phone}</span>
            )}
          </div>
        </div>

        {/* Amenities section */}
        {amenities.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-3 text-base font-semibold text-foreground">酒店设施</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {amenities.map((a) => (
                <div
                  key={a}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-3 transition-all hover:shadow-card"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <AmenityIcon name={a} />
                  </div>
                  <span className="text-[10px] font-medium text-foreground">{a}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Room types section */}
        <div className="mt-6">
          <h2 className="mb-3 text-base font-semibold text-foreground">
            房型报价
            <span className="ml-2 text-xs font-normal text-muted-foreground">共{rooms.length}种房型</span>
          </h2>
          <div className="space-y-3">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} onBook={setBookingRoom} />
            ))}
            {rooms.length === 0 && (
              <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                暂无房型信息
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 inset-x-0 z-[100] border-t border-border bg-card/95 px-4 py-3 backdrop-blur-sm safe-bottom">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">{hotel.name}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-primary">¥{minPrice}</span>
              <span className="text-xs text-muted-foreground">起/晚</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Select as day hotel and go back
                dispatch({ type: 'SET_VIEW', payload: 'hotel-step' })
              }}
              className="rounded-xl border border-primary bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary transition-all hover:bg-primary/10"
            >
              选为住宿
            </button>
            {rooms.length > 0 && (
              <button
                onClick={() => setBookingRoom(rooms[0])}
                className="rounded-xl gradient-hero px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant transition-all hover:shadow-float"
              >
                立即预订
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Booking Modal */}
      {bookingRoom && (
        <BookingModal
          hotel={hotel}
          room={bookingRoom}
          onClose={() => setBookingRoom(null)}
          onSuccess={() => {
            setBookingRoom(null)
          }}
        />
      )}
    </div>
  )
}
