/**
 * 行程规划 API Server
 * Express + SQLite backend
 *
 * Endpoints:
 *   GET  /api/pois/:cityId        → Returns POIs (with 3-tier cache strategy)
 *   POST /api/pois/:cityId/refresh → Force refresh from Qwen API
 *   GET  /api/transit/route       → OSRM proxy
 *   POST /api/auth/register       → Register new user
 *   POST /api/auth/login          → Login
 *   GET  /api/auth/me             → Current user info
 *   POST /api/auth/send-code      → Send verification code
 *   POST /api/auth/reset-password → Reset password
 *   GET  /api/trips               → List user trips
 *   POST /api/trips               → Save trip
 *   PUT  /api/trips/:id           → Update trip
 *   DELETE /api/trips/:id         → Delete trip
 *   POST /api/trips/:id/publish   → Publish as travel note
 *   POST /api/trips/:id/unpublish → Unpublish
 *   PUT  /api/trips/:id/comments-toggle → Toggle comments
 *   GET  /api/notes               → List published notes
 *   GET  /api/notes/:id           → Get single note
 *   GET  /api/notes/:id/comments  → List comments
 *   POST /api/notes/:id/comments  → Add comment
 *   DELETE /api/notes/:id/comments/:cid → Delete comment
 *   GET  /api/health              → Health check
 */

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  initDB, getCachedPOIs, upsertPOIs, getCacheAge,
  getCachedHotels, upsertHotels, getHotelCacheAge,
  createUser, getUserByEmail, getUserById, updateUserPassword, updateUserNickname,
  saveTrip, getUserTrips, getTripById, getPublishedNotes, getPublishedNotesCount,
  publishTrip, unpublishTrip, deleteTrip, toggleComments,
  addComment, getComments, deleteComment,
  saveVerifyCode, verifyCode,
  createBooking, getUserBookings, getBookingById, updateBookingStatus, cancelBooking,
  saveMicroNote, getTripMicroNotes, getMicroNoteById, deleteMicroNote,
  DB_PATH,
} from './db.js'
import { fetchPOIsFromQwen } from './qwen.js'
import { fetchHotelsFromQwen } from './qwen-hotels.js'
import { deduplicatePOIs } from './dedup.js'
import {
  hashPassword, verifyPassword, createToken,
  optionalAuth, requireAuth, generateVerificationCode,
} from './auth.js'

dotenv.config({ path: '.env.local' })

const app = express()
const PORT = Number(process.env.PORT) || Number(process.env.API_PORT) || 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

/* ── Constants ── */
const FRESH_TTL_MS = 15 * 24 * 60 * 60 * 1000
const STALE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/* ── Helpers ── */
function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

function getApiKey(): string | null {
  return process.env.VITE_DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || null
}

const refreshingCities = new Set<string>()

async function backgroundRefresh(cityId: string, cityName: string, cityNameEn: string, season: string) {
  const key = `${cityId}_${season}`
  if (refreshingCities.has(key)) return
  refreshingCities.add(key)
  try {
    const apiKey = getApiKey()
    if (!apiKey) return
    console.log(`[BG Refresh] ${cityName} (${season}) — fetching from Qwen...`)
    const pois = await fetchPOIsFromQwen(cityName, cityNameEn, cityId, season, apiKey)
    if (pois.length > 0) {
      upsertPOIs(cityId, season, pois)
      console.log(`[BG Refresh] ${cityName} (${season}) — saved ${pois.length} POIs`)
    }
  } catch (err) {
    console.error(`[BG Refresh] ${cityName} (${season}) — failed:`, err)
  } finally {
    refreshingCities.delete(key)
  }
}

/* ═══════════════════════ POI Routes (existing) ═══════════════════════ */

app.get('/api/pois/:cityId', async (req, res) => {
  const { cityId } = req.params
  const cityName = (req.query.cityName as string) || cityId
  const cityNameEn = (req.query.cityNameEn as string) || cityId
  const season = getCurrentSeason()
  try {
    const cached = getCachedPOIs(cityId, season)
    const ageMs = getCacheAge(cityId, season)
    if (cached && ageMs !== null) {
      const isStale = ageMs >= STALE_TTL_MS
      const needsRefresh = ageMs >= FRESH_TTL_MS
      // 即使缓存过期也先返回旧数据，后台异步刷新
      if (needsRefresh) backgroundRefresh(cityId, cityName, cityNameEn, season)
      // 对缓存数据也执行去重（兼容旧缓存中存在的重复）
      const { pois: dedupedCached, stats } = deduplicatePOIs(cached as any[])
      if (stats.removedCount > 0) {
        console.log(`[Dedup/Cache] ${cityName}: 缓存去重移除 ${stats.removedCount} 个重复POI`)
      }
      return res.json({ success: true, data: dedupedCached, fromCache: true, refreshing: needsRefresh, cacheAgeHours: Math.round(ageMs / (1000 * 60 * 60)), dedupStats: stats.removedCount > 0 ? stats : undefined, stale: isStale })
    }
    const apiKey = getApiKey()
    if (!apiKey) {
      return res.status(503).json({ success: false, error: 'NO_API_KEY', message: '服务端未配置 DashScope API Key，且无缓存数据' })
    }
    console.log(`[API] Fetching POIs for ${cityName} (${season})...`)
    const pois = await fetchPOIsFromQwen(cityName, cityNameEn, cityId, season, apiKey)
    if (pois.length > 0) upsertPOIs(cityId, season, pois)
    return res.json({ success: true, data: pois, fromCache: false, refreshing: false })
  } catch (err) {
    const cached = getCachedPOIs(cityId, season)
    if (cached) {
      const { pois: dedupedCached } = deduplicatePOIs(cached as any[])
      return res.json({ success: true, data: dedupedCached, fromCache: true, refreshing: false, warning: 'API failed, cached data' })
    }
    return res.status(500).json({ success: false, error: 'API_ERROR', message: (err as Error).message })
  }
})

app.post('/api/pois/:cityId/refresh', async (req, res) => {
  const { cityId } = req.params
  const cityName = (req.query.cityName as string) || (req.body?.cityName as string) || cityId
  const cityNameEn = (req.query.cityNameEn as string) || (req.body?.cityNameEn as string) || cityId
  const season = getCurrentSeason()
  const apiKey = getApiKey()
  if (!apiKey) return res.status(503).json({ success: false, error: 'NO_API_KEY', message: '服务端未配置 API Key' })
  try {
    const pois = await fetchPOIsFromQwen(cityName, cityNameEn, cityId, season, apiKey)
    if (pois.length > 0) upsertPOIs(cityId, season, pois)
    return res.json({ success: true, data: pois, fromCache: false, refreshing: false })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'API_ERROR', message: (err as Error).message })
  }
})

/* ═══════════════════════ Hotel Routes ═══════════════════════ */

const refreshingHotels = new Set<string>()

async function backgroundRefreshHotels(cityId: string, cityName: string, cityNameEn: string) {
  if (refreshingHotels.has(cityId)) return
  refreshingHotels.add(cityId)
  try {
    const apiKey = getApiKey()
    if (!apiKey) return
    console.log(`[BG Refresh Hotels] ${cityName} — fetching from Qwen...`)
    const hotels = await fetchHotelsFromQwen(cityName, cityNameEn, cityId, apiKey)
    if (hotels.length > 0) {
      upsertHotels(cityId, hotels)
      console.log(`[BG Refresh Hotels] ${cityName} — saved ${hotels.length} hotels`)
    }
  } catch (err) {
    console.error(`[BG Refresh Hotels] ${cityName} — failed:`, err)
  } finally {
    refreshingHotels.delete(cityId)
  }
}

/** GET /api/hotels/:cityId – Get hotels for a city (with 3-tier cache) */
app.get('/api/hotels/:cityId', async (req, res) => {
  const { cityId } = req.params
  const cityName = (req.query.cityName as string) || cityId
  const cityNameEn = (req.query.cityNameEn as string) || cityId
  try {
    const cached = getCachedHotels(cityId)
    const ageMs = getHotelCacheAge(cityId)
    if (cached && ageMs !== null) {
      const needsRefresh = ageMs >= FRESH_TTL_MS
      const isStale = ageMs >= STALE_TTL_MS
      if (needsRefresh) backgroundRefreshHotels(cityId, cityName, cityNameEn)
      return res.json({ success: true, data: cached, fromCache: true, refreshing: needsRefresh, cacheAgeHours: Math.round(ageMs / (1000 * 60 * 60)), stale: isStale })
    }
    const apiKey = getApiKey()
    if (!apiKey) {
      return res.status(503).json({ success: false, error: 'NO_API_KEY', message: '服务端未配置 DashScope API Key，且无缓存数据' })
    }
    console.log(`[API] Fetching hotels for ${cityName}...`)
    const hotels = await fetchHotelsFromQwen(cityName, cityNameEn, cityId, apiKey)
    if (hotels.length > 0) upsertHotels(cityId, hotels)
    return res.json({ success: true, data: hotels, fromCache: false, refreshing: false })
  } catch (err) {
    const cached = getCachedHotels(cityId)
    if (cached) return res.json({ success: true, data: cached, fromCache: true, refreshing: false, warning: 'API failed, cached data' })
    return res.status(500).json({ success: false, error: 'API_ERROR', message: (err as Error).message })
  }
})

/* ═══════════════════════ Booking Routes ═══════════════════════ */

/** POST /api/bookings – Create a booking */
app.post('/api/bookings', requireAuth, (req: any, res) => {
  const { hotelId, hotelName, hotelAddress, hotelImage, roomTypeId, roomTypeName, checkIn, checkOut, nights, guestName, guestPhone, guestEmail, totalPrice, cityName } = req.body
  if (!hotelId || !roomTypeId || !checkIn || !checkOut || !guestName || !guestPhone) {
    return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: '请填写完整的预订信息' })
  }

  const booking = createBooking({
    id: `booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: req.user.id,
    hotel_id: hotelId,
    hotel_name: hotelName || '',
    hotel_address: hotelAddress || '',
    hotel_image: hotelImage || '',
    room_type_id: roomTypeId,
    room_type_name: roomTypeName || '',
    check_in: checkIn,
    check_out: checkOut,
    nights: nights || 1,
    guest_name: guestName,
    guest_phone: guestPhone,
    guest_email: guestEmail || '',
    total_price: totalPrice || 0,
    status: 'confirmed',
    city_name: cityName || '',
  })

  return res.json({ success: true, booking })
})

/** GET /api/bookings – List current user's bookings */
app.get('/api/bookings', requireAuth, (req: any, res) => {
  const bookings = getUserBookings(req.user.id)
  return res.json({ success: true, bookings })
})

/** GET /api/bookings/:id – Get single booking */
app.get('/api/bookings/:id', requireAuth, (req: any, res) => {
  const booking = getBookingById(req.params.id)
  if (!booking) return res.status(404).json({ success: false, error: 'NOT_FOUND' })
  if (booking.user_id !== req.user.id) return res.status(403).json({ success: false, error: 'FORBIDDEN' })
  return res.json({ success: true, booking })
})

/** PUT /api/bookings/:id/cancel – Cancel a booking */
app.put('/api/bookings/:id/cancel', requireAuth, (req: any, res) => {
  const booking = getBookingById(req.params.id)
  if (!booking) return res.status(404).json({ success: false, error: 'NOT_FOUND' })
  if (booking.user_id !== req.user.id) return res.status(403).json({ success: false, error: 'FORBIDDEN' })
  if (booking.status === 'cancelled') return res.status(400).json({ success: false, error: 'ALREADY_CANCELLED' })
  if (booking.status === 'checked-in' || booking.status === 'completed') {
    return res.status(400).json({ success: false, error: 'CANNOT_CANCEL', message: '已入住或已完成的订单无法取消' })
  }
  cancelBooking(req.params.id)
  return res.json({ success: true })
})

/** PUT /api/bookings/:id/status – Update booking status */
app.put('/api/bookings/:id/status', requireAuth, (req: any, res) => {
  const { status } = req.body
  const validStatuses = ['pending', 'confirmed', 'checked-in', 'completed', 'cancelled']
  if (!status || !validStatuses.includes(status)) return res.status(400).json({ success: false, error: 'INVALID_STATUS' })
  const booking = getBookingById(req.params.id)
  if (!booking) return res.status(404).json({ success: false, error: 'NOT_FOUND' })
  if (booking.user_id !== req.user.id) return res.status(403).json({ success: false, error: 'FORBIDDEN' })
  updateBookingStatus(req.params.id, status)
  return res.json({ success: true })
})

/* ═══════════════════════ Transit Route (existing) ═══════════════════════ */

app.get('/api/transit/route', async (req, res) => {
  const coords = req.query.coords as string
  if (!coords) return res.status(400).json({ success: false, error: 'coords parameter required' })
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&steps=false&annotations=false`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(osrmUrl, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) throw new Error(`OSRM returned ${response.status}`)
    const data = await response.json() as { code: string; routes: Array<{ legs: Array<{ distance: number; duration: number }> }> }
    if (data.code !== 'Ok' || !data.routes?.[0]) return res.json({ success: false, error: `OSRM error: ${data.code}` })
    const legs = data.routes[0].legs.map((leg) => ({
      driving: { distance: Math.round(leg.distance / 100) / 10, duration: Math.max(1, Math.round(leg.duration / 60)) },
      transit: estimatePublicTransit(leg.distance / 1000),
    }))
    return res.json({ success: true, legs })
  } catch (err) {
    console.warn('[Transit] OSRM failed:', (err as Error).message)
    return res.json({ success: false, error: 'OSRM unavailable' })
  }
})

function estimatePublicTransit(distKm: number) {
  if (distKm < 0.8) return { mode: 'walk', modeLabel: '步行', distance: Math.round(distKm * 10) / 10, duration: Math.max(3, Math.round(distKm / 4.5 * 60)) }
  if (distKm < 5) return { mode: 'metro', modeLabel: '地铁/公交', distance: Math.round(distKm * 10) / 10, duration: Math.round(distKm / 20 * 60) + 10 }
  return { mode: 'bus', modeLabel: '公交/打车', distance: Math.round(distKm * 10) / 10, duration: Math.round(distKm / 15 * 60) + 10 }
}

/* ═══════════════════════ Auth Routes ═══════════════════════ */

/** POST /api/auth/register */
app.post('/api/auth/register', (req, res) => {
  const { email, password, nickname } = req.body
  if (!email || !password) return res.status(400).json({ error: 'MISSING_FIELDS', message: '邮箱和密码不能为空' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'INVALID_EMAIL', message: '邮箱格式不正确' })
  if (password.length < 6) return res.status(400).json({ error: 'WEAK_PASSWORD', message: '密码至少需要6位' })

  const existing = getUserByEmail(email)
  if (existing) return res.status(409).json({ error: 'EMAIL_EXISTS', message: '该邮箱已注册' })

  const hashed = hashPassword(password)
  const user = createUser(email, hashed, nickname || email.split('@')[0])
  const token = createToken(user.id, user.email)

  return res.json({
    success: true,
    token,
    user: { id: user.id, email: user.email, nickname: user.nickname, avatar: user.avatar },
  })
})

/** POST /api/auth/login */
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'MISSING_FIELDS', message: '邮箱和密码不能为空' })

  const user = getUserByEmail(email)
  if (!user) return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '邮箱或密码错误' })

  if (!verifyPassword(password, user.password)) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '邮箱或密码错误' })
  }

  const token = createToken(user.id, user.email)
  return res.json({
    success: true,
    token,
    user: { id: user.id, email: user.email, nickname: user.nickname, avatar: user.avatar },
  })
})

/** GET /api/auth/me */
app.get('/api/auth/me', requireAuth, (req: any, res) => {
  const user = getUserById(req.user.id)
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' })
  return res.json({
    success: true,
    user: { id: user.id, email: user.email, nickname: user.nickname, avatar: user.avatar },
  })
})

/** POST /api/auth/send-code – Send verification code (mock: logs to console) */
app.post('/api/auth/send-code', (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'MISSING_EMAIL' })

  const user = getUserByEmail(email)
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND', message: '该邮箱未注册' })

  const code = generateVerificationCode()
  saveVerifyCode(email, code, 'reset')

  // In production, send actual email. For demo, log to console.
  console.log(`\n📧 验证码发送到 ${email}: ${code}\n`)

  return res.json({ success: true, message: '验证码已发送到邮箱' })
})

/** POST /api/auth/reset-password */
app.post('/api/auth/reset-password', (req, res) => {
  const { email, code, newPassword } = req.body
  if (!email || !code || !newPassword) return res.status(400).json({ error: 'MISSING_FIELDS' })
  if (newPassword.length < 6) return res.status(400).json({ error: 'WEAK_PASSWORD', message: '密码至少需要6位' })

  if (!verifyCode(email, code, 'reset')) {
    return res.status(400).json({ error: 'INVALID_CODE', message: '验证码无效或已过期' })
  }

  const user = getUserByEmail(email)
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' })

  updateUserPassword(user.id, hashPassword(newPassword))
  return res.json({ success: true, message: '密码已重置' })
})

/** PUT /api/auth/nickname */
app.put('/api/auth/nickname', requireAuth, (req: any, res) => {
  const { nickname } = req.body
  if (!nickname || nickname.trim().length === 0) return res.status(400).json({ error: 'MISSING_NICKNAME' })
  updateUserNickname(req.user.id, nickname.trim())
  return res.json({ success: true })
})

/* ═══════════════════════ Trips Routes ═══════════════════════ */

/** GET /api/trips – List current user's trips */
app.get('/api/trips', requireAuth, (req: any, res) => {
  const trips = getUserTrips(req.user.id)
  // Return trips without full trip_data (just metadata)
  const summary = trips.map((t) => ({
    id: t.id,
    cityId: t.city_id,
    cityName: t.city_name,
    title: t.title,
    coverImage: t.cover_image,
    isPublished: !!t.is_published,
    allowComments: !!t.allow_comments,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    // Parse trip_data to get day count and budget
    ...(() => {
      try {
        const d = JSON.parse(t.trip_data)
        return { startDate: d.startDate, endDate: d.endDate, dayCount: d.days?.length || 0, totalBudget: d.totalBudget || 0 }
      } catch { return { dayCount: 0, totalBudget: 0 } }
    })(),
  }))
  return res.json({ success: true, trips: summary })
})

/** POST /api/trips – Save a trip */
app.post('/api/trips', requireAuth, (req: any, res) => {
  const { tripData, title, coverImage } = req.body
  if (!tripData) return res.status(400).json({ error: 'MISSING_DATA' })

  const parsed = typeof tripData === 'string' ? JSON.parse(tripData) : tripData
  const trip = saveTrip({
    id: parsed.id || `trip-${Date.now()}`,
    user_id: req.user.id,
    city_id: parsed.cityId || '',
    city_name: parsed.cityName || '',
    title: title || `${parsed.cityName || ''}之旅`,
    cover_image: coverImage || '',
    trip_data: typeof tripData === 'string' ? tripData : JSON.stringify(tripData),
    is_published: 0,
    allow_comments: 1,
    publish_note: '',
  })

  return res.json({ success: true, tripId: trip.id })
})

/** GET /api/trips/:id – Load a single trip with full data */
app.get('/api/trips/:id', requireAuth, (req: any, res) => {
  const { id } = req.params
  const trip = getTripById(id)
  if (!trip) return res.status(404).json({ error: 'NOT_FOUND' })
  if (trip.user_id !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' })

  let tripData: any = null
  try {
    tripData = JSON.parse(trip.trip_data)
  } catch {
    return res.status(500).json({ error: 'CORRUPT_DATA' })
  }

  return res.json({
    success: true,
    trip: {
      id: trip.id,
      cityId: trip.city_id,
      cityName: trip.city_name,
      title: trip.title,
      coverImage: trip.cover_image,
      isPublished: !!trip.is_published,
      tripData,
    },
  })
})

/** PUT /api/trips/:id – Update trip */
app.put('/api/trips/:id', requireAuth, (req: any, res) => {
  const { id } = req.params
  const existing = getTripById(id)
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND' })
  if (existing.user_id !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' })

  const { tripData, title, coverImage } = req.body
  saveTrip({
    id,
    user_id: req.user.id,
    city_id: existing.city_id,
    city_name: existing.city_name,
    title: title || existing.title,
    cover_image: coverImage !== undefined ? coverImage : existing.cover_image,
    trip_data: tripData ? (typeof tripData === 'string' ? tripData : JSON.stringify(tripData)) : existing.trip_data,
    is_published: existing.is_published,
    allow_comments: existing.allow_comments,
    publish_note: existing.publish_note,
  })

  return res.json({ success: true })
})

/** DELETE /api/trips/:id */
app.delete('/api/trips/:id', requireAuth, (req: any, res) => {
  const { id } = req.params
  const existing = getTripById(id)
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND' })
  if (existing.user_id !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' })
  deleteTrip(id)
  return res.json({ success: true })
})

/** POST /api/trips/:id/publish */
app.post('/api/trips/:id/publish', requireAuth, (req: any, res) => {
  const { id } = req.params
  const existing = getTripById(id)
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND' })
  if (existing.user_id !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' })
  // Must have at least one micro-note to publish
  const notes = getTripMicroNotes(id)
  if (notes.length === 0) {
    return res.status(400).json({ success: false, error: 'NO_CONTENT', message: '请先为行程中的景点添加至少一条微游记，才能发布为游记' })
  }
  publishTrip(id, req.body.publishNote || '')
  return res.json({ success: true })
})

/** POST /api/trips/:id/unpublish */
app.post('/api/trips/:id/unpublish', requireAuth, (req: any, res) => {
  const { id } = req.params
  const existing = getTripById(id)
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND' })
  if (existing.user_id !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' })
  unpublishTrip(id)
  return res.json({ success: true })
})

/** PUT /api/trips/:id/comments-toggle */
app.put('/api/trips/:id/comments-toggle', requireAuth, (req: any, res) => {
  const { id } = req.params
  const existing = getTripById(id)
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND' })
  if (existing.user_id !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' })
  toggleComments(id, !!req.body.allow)
  return res.json({ success: true })
})

/* ═══════════════════════ Public Notes Routes ═══════════════════════ */

/** GET /api/notes – List published travel notes */
app.get('/api/notes', optionalAuth, (_req, res) => {
  const limit = Math.min(50, Number(_req.query.limit) || 20)
  const offset = Number(_req.query.offset) || 0
  const notes = getPublishedNotes(limit, offset)
  const total = getPublishedNotesCount()

  const result = notes.map((n) => {
    const author = getUserById(n.user_id)
    let dayCount = 0, totalBudget = 0, startDate = '', endDate = ''
    try {
      const d = JSON.parse(n.trip_data)
      dayCount = d.days?.length || 0
      totalBudget = d.totalBudget || 0
      startDate = d.startDate || ''
      endDate = d.endDate || ''
    } catch { /* ignore */ }
    return {
      id: n.id,
      cityName: n.city_name,
      title: n.title,
      coverImage: n.cover_image,
      publishNote: n.publish_note,
      authorName: author?.nickname || '匿名用户',
      authorAvatar: author?.avatar || '',
      dayCount,
      totalBudget,
      startDate,
      endDate,
      allowComments: !!n.allow_comments,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
    }
  })

  return res.json({ success: true, notes: result, total })
})

/** GET /api/notes/:id – Get single note with full data */
app.get('/api/notes/:id', optionalAuth, (req: any, res) => {
  const note = getTripById(req.params.id)
  if (!note) return res.status(404).json({ error: 'NOT_FOUND' })
  if (!note.is_published) {
    // Only owner can see unpublished
    if (!req.user || req.user.id !== note.user_id) {
      return res.status(404).json({ error: 'NOT_FOUND' })
    }
  }
  const author = getUserById(note.user_id)
  return res.json({
    success: true,
    note: {
      id: note.id,
      cityName: note.city_name,
      title: note.title,
      coverImage: note.cover_image,
      publishNote: note.publish_note,
      tripData: note.trip_data,
      authorId: note.user_id,
      authorName: author?.nickname || '匿名用户',
      authorAvatar: author?.avatar || '',
      allowComments: !!note.allow_comments,
      isOwner: req.user?.id === note.user_id,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    },
  })
})

/** GET /api/notes/:id/comments */
app.get('/api/notes/:id/comments', (_req, res) => {
  const note = getTripById(_req.params.id)
  if (!note || !note.is_published) return res.status(404).json({ error: 'NOT_FOUND' })
  const comments = getComments(_req.params.id)
  return res.json({ success: true, comments })
})

/** POST /api/notes/:id/comments */
app.post('/api/notes/:id/comments', requireAuth, (req: any, res) => {
  const note = getTripById(req.params.id)
  if (!note || !note.is_published) return res.status(404).json({ error: 'NOT_FOUND' })
  if (!note.allow_comments) return res.status(403).json({ error: 'COMMENTS_DISABLED', message: '该游记已关闭评论' })
  const { content } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'EMPTY_CONTENT' })
  const comment = addComment(req.params.id, req.user.id, content.trim())
  const user = getUserById(req.user.id)
  return res.json({
    success: true,
    comment: { ...comment, nickname: user?.nickname || '', avatar: user?.avatar || '' },
  })
})

/** DELETE /api/notes/:id/comments/:cid */
app.delete('/api/notes/:id/comments/:cid', requireAuth, (req: any, res) => {
  const note = getTripById(req.params.id)
  if (!note) return res.status(404).json({ error: 'NOT_FOUND' })
  // Only note owner or comment owner can delete
  const cid = Number(req.params.cid)
  const comments = getComments(req.params.id)
  const comment = comments.find((c) => c.id === cid)
  if (!comment) return res.status(404).json({ error: 'COMMENT_NOT_FOUND' })
  if (comment.user_id !== req.user.id && note.user_id !== req.user.id) {
    return res.status(403).json({ error: 'FORBIDDEN' })
  }
  deleteComment(cid)
  return res.json({ success: true })
})

/* ═══════════════════════ Micro Notes (微游记) ═══════════════════════ */

/** GET /api/trips/:id/micro-notes — List all micro notes for a trip */
app.get('/api/trips/:id/micro-notes', optionalAuth, (req: any, res) => {
  const trip = getTripById(req.params.id)
  if (!trip) return res.status(404).json({ success: false, error: 'NOT_FOUND' })
  const notes = getTripMicroNotes(req.params.id)
  const mapped = notes.map(n => ({
    id: n.id,
    tripId: n.trip_id,
    poiId: n.poi_id,
    poiName: n.poi_name,
    poiLat: n.poi_lat,
    poiLng: n.poi_lng,
    poiType: n.poi_type,
    dayNumber: n.day_number,
    content: n.content,
    images: JSON.parse(n.images || '[]'),
    mood: n.mood,
    authorName: n.nickname,
    authorAvatar: n.avatar,
    authorId: n.user_id,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  }))
  return res.json({ success: true, data: mapped })
})

/** POST /api/trips/:id/micro-notes — Create or update a micro note */
app.post('/api/trips/:id/micro-notes', requireAuth, (req: any, res) => {
  const trip = getTripById(req.params.id)
  if (!trip) return res.status(404).json({ success: false, error: 'NOT_FOUND' })
  if (trip.user_id !== req.user.id) return res.status(403).json({ success: false, error: 'FORBIDDEN' })

  const { id, poiId, poiName, poiLat, poiLng, poiType, dayNumber, content, images, mood } = req.body
  if (!poiId || !content) {
    return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: '请填写游记内容' })
  }

  const note = saveMicroNote({
    id: id || `mn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    trip_id: req.params.id,
    user_id: req.user.id,
    poi_id: poiId,
    poi_name: poiName || '',
    poi_lat: poiLat || 0,
    poi_lng: poiLng || 0,
    poi_type: poiType || 'scenic',
    day_number: dayNumber || 1,
    content: content.slice(0, 280),
    images: JSON.stringify((images || []).slice(0, 9)),
    mood: mood || '',
  })

  return res.json({
    success: true,
    data: {
      id: note.id,
      tripId: note.trip_id,
      poiId: note.poi_id,
      poiName: note.poi_name,
      poiLat: note.poi_lat,
      poiLng: note.poi_lng,
      poiType: note.poi_type,
      dayNumber: note.day_number,
      content: note.content,
      images: JSON.parse(note.images || '[]'),
      mood: note.mood,
      authorName: req.user.nickname,
      authorAvatar: req.user.avatar || '',
      authorId: req.user.id,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    }
  })
})

/** DELETE /api/trips/:id/micro-notes/:noteId — Delete a micro note */
app.delete('/api/trips/:id/micro-notes/:noteId', requireAuth, (req: any, res) => {
  const note = getMicroNoteById(req.params.noteId)
  if (!note) return res.status(404).json({ success: false, error: 'NOT_FOUND' })
  if (note.user_id !== req.user.id) return res.status(403).json({ success: false, error: 'FORBIDDEN' })
  deleteMicroNote(req.params.noteId)
  return res.json({ success: true })
})

/* ═══════════════════════ Health ═══════════════════════ */

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasApiKey: !!getApiKey() })
})

/* ═══════════════════════ Static Files (Production) ═══════════════════════ */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.join(__dirname, '..', 'dist')

// Serve Vite build output
app.use(express.static(distPath))

// SPA fallback: any non-API route → index.html
app.get('{*path}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

/* ═══════════════════════ Init ═══════════════════════ */

// When running on Vercel, the serverless function entry point handles init.
// When running locally, start the server directly.
if (!process.env.VERCEL) {
  initDB()
  app.listen(PORT, () => {
    console.log(`\n  🚀 API Server running at http://localhost:${PORT}`)
    console.log(`  📦 Database: ${DB_PATH}`)
    console.log(`  🔑 API Key: ${getApiKey() ? 'configured' : '⚠ NOT configured'}\n`)
  })
}

export default app
