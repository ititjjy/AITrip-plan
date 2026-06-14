/**
 * db.ts – SQLite database layer
 *
 * Tables:
 *   city_pois    – AI-generated POI cache
 *   users        – User accounts
 *   trips        – Saved trip itineraries
 *   comments     – Comments on published travel notes
 *   verify_codes – Email verification codes
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isVercel = process.env.VERCEL === '1'
// 优先使用环境变量 DB_DIR 指定的目录
// 其次检测 /data/aitrip 目录是否存在（生产服务器持久化路径）
// 最后回退到项目内 server/data/ 目录（本地开发）
const PERSISTENT_DIR = '/data/aitrip'
const DB_DIR = isVercel
  ? '/tmp'
  : process.env.DB_DIR
    || (fs.existsSync(PERSISTENT_DIR) ? PERSISTENT_DIR : path.join(__dirname, 'data'))
const DB_PATH = path.join(DB_DIR, 'pois.db')

export { DB_PATH }

let db: Database.Database

export function getDB(): Database.Database {
  return db
}

export function initDB() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true })
  }

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // POI cache table (simplified: city_id single PK, seasonal data embedded in POI objects)
  db.exec(`
    CREATE TABLE IF NOT EXISTS city_pois (
      city_id    TEXT    PRIMARY KEY,
      data       TEXT    NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT    NOT NULL UNIQUE,
      password   TEXT    NOT NULL,
      nickname   TEXT    NOT NULL DEFAULT '',
      avatar     TEXT    DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `)

  // Trips table – stores full trip data as JSON
  db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id              TEXT    PRIMARY KEY,
      user_id         INTEGER NOT NULL,
      city_id         TEXT    NOT NULL,
      city_name       TEXT    NOT NULL,
      title           TEXT    NOT NULL DEFAULT '',
      cover_image     TEXT    DEFAULT '',
      trip_data       TEXT    NOT NULL,
      is_published    INTEGER NOT NULL DEFAULT 0,
      allow_comments  INTEGER NOT NULL DEFAULT 1,
      publish_note    TEXT    DEFAULT '',
      created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  // Comments on published trips (travel notes)
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id    TEXT    NOT NULL,
      user_id    INTEGER NOT NULL,
      content    TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      FOREIGN KEY (trip_id) REFERENCES trips(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  // Email verification codes
  db.exec(`
    CREATE TABLE IF NOT EXISTS verify_codes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT    NOT NULL,
      code       TEXT    NOT NULL,
      type       TEXT    NOT NULL DEFAULT 'reset',
      expires_at INTEGER NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0
    )
  `)

  // Hotel cache table (AI-generated hotel data per city)
  db.exec(`
    CREATE TABLE IF NOT EXISTS hotels (
      city_id    TEXT    PRIMARY KEY,
      data       TEXT    NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // Bookings table – hotel reservations
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id              TEXT    PRIMARY KEY,
      user_id         INTEGER NOT NULL,
      hotel_id        TEXT    NOT NULL,
      hotel_name      TEXT    NOT NULL,
      hotel_address   TEXT    DEFAULT '',
      hotel_image     TEXT    DEFAULT '',
      room_type_id    TEXT    NOT NULL,
      room_type_name  TEXT    NOT NULL,
      check_in        TEXT    NOT NULL,
      check_out       TEXT    NOT NULL,
      nights          INTEGER NOT NULL DEFAULT 1,
      guest_name      TEXT    NOT NULL,
      guest_phone     TEXT    NOT NULL,
      guest_email     TEXT    DEFAULT '',
      total_price     REAL    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'pending',
      city_name       TEXT    DEFAULT '',
      created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  console.log(`[DB] Initialized at ${DB_PATH}`)
}

/* ═══════════════════════ Micro Notes (微游记) ═══════════════════════ */

// Ensure micro_notes table exists (created lazily on first DB init after this code is deployed)
function ensureMicroNotesTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS micro_notes (
      id           TEXT    PRIMARY KEY,
      trip_id      TEXT    NOT NULL,
      user_id      INTEGER NOT NULL,
      poi_id       TEXT    NOT NULL,
      poi_name     TEXT    NOT NULL,
      poi_lat      REAL    NOT NULL DEFAULT 0,
      poi_lng      REAL    NOT NULL DEFAULT 0,
      poi_type     TEXT    NOT NULL DEFAULT 'scenic',
      day_number   INTEGER NOT NULL DEFAULT 1,
      content      TEXT    NOT NULL DEFAULT '',
      images       TEXT    NOT NULL DEFAULT '[]',
      mood         TEXT    NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      FOREIGN KEY (trip_id) REFERENCES trips(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)
}

export interface DBMicroNote {
  id: string
  trip_id: string
  user_id: number
  poi_id: string
  poi_name: string
  poi_lat: number
  poi_lng: number
  poi_type: string
  day_number: number
  content: string
  images: string  // JSON array
  mood: string
  created_at: number
  updated_at: number
}

export function saveMicroNote(note: Omit<DBMicroNote, 'created_at' | 'updated_at'>): DBMicroNote {
  ensureMicroNotesTable()
  const now = Date.now()
  db.prepare(`
    INSERT INTO micro_notes (id, trip_id, user_id, poi_id, poi_name, poi_lat, poi_lng, poi_type, day_number, content, images, mood, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      content = excluded.content,
      images = excluded.images,
      mood = excluded.mood,
      updated_at = ?
  `).run(note.id, note.trip_id, note.user_id, note.poi_id, note.poi_name,
    note.poi_lat, note.poi_lng, note.poi_type, note.day_number,
    note.content, note.images, note.mood, now, now, now)
  return { ...note, created_at: now, updated_at: now }
}

export function getTripMicroNotes(tripId: string): Array<DBMicroNote & { nickname: string; avatar: string }> {
  ensureMicroNotesTable()
  return db.prepare(`
    SELECT mn.*, u.nickname, u.avatar
    FROM micro_notes mn
    JOIN users u ON mn.user_id = u.id
    WHERE mn.trip_id = ?
    ORDER BY mn.day_number ASC, mn.created_at ASC
  `).all(tripId) as Array<DBMicroNote & { nickname: string; avatar: string }>
}

export function getMicroNoteById(noteId: string): (DBMicroNote & { nickname: string; avatar: string }) | null {
  ensureMicroNotesTable()
  return (db.prepare(`
    SELECT mn.*, u.nickname, u.avatar
    FROM micro_notes mn
    JOIN users u ON mn.user_id = u.id
    WHERE mn.id = ?
  `).get(noteId) as (DBMicroNote & { nickname: string; avatar: string })) || null
}

export function deleteMicroNote(noteId: string) {
  ensureMicroNotesTable()
  db.prepare('DELETE FROM micro_notes WHERE id = ?').run(noteId)
}

/* ═══════════════════════ POI Cache (existing) ═══════════════════════ */

export function getCachedPOIs(cityId: string): unknown[] | null {
  const row = db.prepare(
    'SELECT data FROM city_pois WHERE city_id = ?'
  ).get(cityId) as { data: string } | undefined
  if (!row) return null
  try { return JSON.parse(row.data) } catch { return null }
}

export function getCacheAge(cityId: string): number | null {
  const row = db.prepare(
    'SELECT updated_at FROM city_pois WHERE city_id = ?'
  ).get(cityId) as { updated_at: number } | undefined
  if (!row) return null
  return Date.now() - row.updated_at
}

export function upsertPOIs(cityId: string, data: unknown[]) {
  db.prepare(`
    INSERT INTO city_pois (city_id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(city_id)
    DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(cityId, JSON.stringify(data), Date.now())
  console.log(`[DB] Upserted ${data.length} POIs for ${cityId}`)
}

/* ═══════════════════════ Users ═══════════════════════ */

export interface DBUser {
  id: number
  email: string
  password: string
  nickname: string
  avatar: string
  created_at: number
}

export function createUser(email: string, password: string, nickname: string): DBUser {
  const stmt = db.prepare(
    'INSERT INTO users (email, password, nickname, created_at) VALUES (?, ?, ?, ?)'
  )
  const now = Date.now()
  const result = stmt.run(email, password, nickname, now)
  return { id: Number(result.lastInsertRowid), email, password, nickname, avatar: '', created_at: now }
}

export function getUserByEmail(email: string): DBUser | null {
  return (db.prepare('SELECT * FROM users WHERE email = ?').get(email) as DBUser) || null
}

export function getUserById(id: number): DBUser | null {
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as DBUser) || null
}

export function updateUserPassword(userId: number, newPassword: string) {
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(newPassword, userId)
}

export function updateUserNickname(userId: number, nickname: string) {
  db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, userId)
}

/* ═══════════════════════ Trips ═══════════════════════ */

export interface DBTrip {
  id: string
  user_id: number
  city_id: string
  city_name: string
  title: string
  cover_image: string
  trip_data: string
  is_published: number
  allow_comments: number
  publish_note: string
  created_at: number
  updated_at: number
}

export function saveTrip(trip: Omit<DBTrip, 'created_at' | 'updated_at'>): DBTrip {
  const now = Date.now()
  db.prepare(`
    INSERT INTO trips (id, user_id, city_id, city_name, title, cover_image, trip_data, is_published, allow_comments, publish_note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      cover_image = excluded.cover_image,
      trip_data = excluded.trip_data,
      is_published = excluded.is_published,
      allow_comments = excluded.allow_comments,
      publish_note = excluded.publish_note,
      updated_at = ?
  `).run(trip.id, trip.user_id, trip.city_id, trip.city_name, trip.title, trip.cover_image,
    trip.trip_data, trip.is_published, trip.allow_comments, trip.publish_note, now, now, now)
  return { ...trip, created_at: now, updated_at: now }
}

export function getUserTrips(userId: number): DBTrip[] {
  return db.prepare(
    'SELECT * FROM trips WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(userId) as DBTrip[]
}

export function getTripById(tripId: string): DBTrip | null {
  return (db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId) as DBTrip) || null
}

export function getPublishedNotes(limit = 20, offset = 0): DBTrip[] {
  return db.prepare(
    'SELECT * FROM trips WHERE is_published = 1 ORDER BY updated_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as DBTrip[]
}

export function getPublishedNotesCount(): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM trips WHERE is_published = 1').get() as { count: number }
  return row.count
}

export function publishTrip(tripId: string, publishNote: string) {
  db.prepare(
    'UPDATE trips SET is_published = 1, publish_note = ?, updated_at = ? WHERE id = ?'
  ).run(publishNote, Date.now(), tripId)
}

export function unpublishTrip(tripId: string) {
  db.prepare(
    'UPDATE trips SET is_published = 0, updated_at = ? WHERE id = ?'
  ).run(Date.now(), tripId)
}

export function deleteTrip(tripId: string) {
  db.prepare('DELETE FROM comments WHERE trip_id = ?').run(tripId)
  db.prepare('DELETE FROM trips WHERE id = ?').run(tripId)
}

export function toggleComments(tripId: string, allow: boolean) {
  db.prepare(
    'UPDATE trips SET allow_comments = ?, updated_at = ? WHERE id = ?'
  ).run(allow ? 1 : 0, Date.now(), tripId)
}

/* ═══════════════════════ Comments ═══════════════════════ */

export interface DBComment {
  id: number
  trip_id: string
  user_id: number
  content: string
  created_at: number
}

export function addComment(tripId: string, userId: number, content: string): DBComment {
  const now = Date.now()
  const result = db.prepare(
    'INSERT INTO comments (trip_id, user_id, content, created_at) VALUES (?, ?, ?, ?)'
  ).run(tripId, userId, content, now)
  return { id: Number(result.lastInsertRowid), trip_id: tripId, user_id: userId, content, created_at: now }
}

export function getComments(tripId: string): Array<DBComment & { nickname: string; avatar: string }> {
  return db.prepare(`
    SELECT c.*, u.nickname, u.avatar
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.trip_id = ?
    ORDER BY c.created_at DESC
  `).all(tripId) as Array<DBComment & { nickname: string; avatar: string }>
}

export function deleteComment(commentId: number) {
  db.prepare('DELETE FROM comments WHERE id = ?').run(commentId)
}

/* ═══════════════════════ Verification Codes ═══════════════════════ */

export function saveVerifyCode(email: string, code: string, type = 'reset') {
  const expiresAt = Date.now() + 10 * 60 * 1000 // 10 minutes
  db.prepare(
    'INSERT INTO verify_codes (email, code, type, expires_at) VALUES (?, ?, ?, ?)'
  ).run(email, code, type, expiresAt)
}

export function verifyCode(email: string, code: string, type = 'reset'): boolean {
  const row = db.prepare(
    'SELECT * FROM verify_codes WHERE email = ? AND code = ? AND type = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1'
  ).get(email, code, type, Date.now()) as { id: number } | undefined
  if (!row) return false
  db.prepare('UPDATE verify_codes SET used = 1 WHERE id = ?').run(row.id)
  return true
}

/* ═══════════════════════ Hotel Cache ═══════════════════════ */

export function getCachedHotels(cityId: string): unknown[] | null {
  const row = db.prepare(
    'SELECT data FROM hotels WHERE city_id = ?'
  ).get(cityId) as { data: string } | undefined
  if (!row) return null
  try { return JSON.parse(row.data) } catch { return null }
}

/**
 * 从 city_pois 表中提取酒店 POI，转换为 HotelPOI 格式。
 * 当 hotels 表无缓存时作为兖底，避免用户看到空酒店列表。
 * 支持 categoryL1=hotel（采集数据）和 type=hotel（旧AI数据）两种格式。
 */
export function getHotelFallbackFromPOIs(cityId: string): unknown[] | null {
  const row = db.prepare(
    'SELECT data FROM city_pois WHERE city_id = ?'
  ).get(cityId) as { data: string } | undefined
  if (!row) return null
  let allPOIs: any[]
  try { allPOIs = JSON.parse(row.data) } catch { return null }

  // 解析星级：hotel.comfort.fourstar → 4, hotel.luxury.fivestar → 5 …
  function parseStars(cat3: string | undefined): number | undefined {
    if (!cat3) return undefined
    const m = cat3.match(/(one|two|three|four|five)star/)
    if (!m) return undefined
    return { one: 1, two: 2, three: 3, four: 4, five: 5 }[m[1]]
  }

  // 根据星级/分类/标签推断设施列表
  function inferAmenities(p: any): string[] {
    const amenities: string[] = []
    const stars = parseStars(p.categoryL3)
    const cat2: string = p.categoryL2 || ''
    const tags: string[] = Array.isArray(p.tags) ? p.tags.map((t: string) => t.split('|')[0].toLowerCase()) : []
    const desc: string = (p.description || '').toLowerCase()
    const allText = [...tags, desc].join(' ')

    // Wi-Fi：几乎所有酒店都有
    amenities.push('Wi-Fi')

    // 停车场：舒适型以上
    if (stars && stars >= 3) amenities.push('停车场')

    // 泳池：高档酒店或描述/标签含相关词
    if ((stars && stars >= 4) || allText.includes('泳池') || allText.includes('游泳') || allText.includes('pool') || cat2.includes('luxury')) {
      amenities.push('泳池')
    }

    // 健身房：4星以上
    if ((stars && stars >= 4) || allText.includes('健身') || allText.includes('fitness') || allText.includes('gym')) {
      amenities.push('健身房')
    }

    return amenities
  }

  const hotels = allPOIs
    .filter((p) => p.categoryL1 === 'hotel' || p.type === 'hotel')
    .map((p) => ({
      id: p.id || '',
      name: p.namePrimary || p.name || '',
      address: p.address || '',
      lat: p.lat || 0,
      lng: p.lng || 0,
      rating: p.rating || undefined,
      stars: parseStars(p.categoryL3),
      priceRange: p.cost ? [p.cost, Math.round(p.cost * 1.6)] : undefined,
      description: p.description || '',
      images: p.image ? [p.image] : [],
      tags: Array.isArray(p.tags) ? p.tags.map((t: string) => t.split('|')[0]) : [],
      amenities: inferAmenities(p),
    }))

  return hotels.length > 0 ? hotels : null
}

export function getHotelCacheAge(cityId: string): number | null {
  const row = db.prepare(
    'SELECT updated_at FROM hotels WHERE city_id = ?'
  ).get(cityId) as { updated_at: number } | undefined
  if (!row) return null
  return Date.now() - row.updated_at
}

export function upsertHotels(cityId: string, data: unknown[]) {
  db.prepare(`
    INSERT INTO hotels (city_id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(city_id)
    DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(cityId, JSON.stringify(data), Date.now())
  console.log(`[DB] Upserted ${data.length} hotels for ${cityId}`)
}

/* ═══════════════════════ Bookings ═══════════════════════ */

export interface DBBooking {
  id: string
  user_id: number
  hotel_id: string
  hotel_name: string
  hotel_address: string
  hotel_image: string
  room_type_id: string
  room_type_name: string
  check_in: string
  check_out: string
  nights: number
  guest_name: string
  guest_phone: string
  guest_email: string
  total_price: number
  status: string
  city_name: string
  created_at: number
  updated_at: number
}

export function createBooking(booking: Omit<DBBooking, 'created_at' | 'updated_at'>): DBBooking {
  const now = Date.now()
  db.prepare(`
    INSERT INTO bookings (id, user_id, hotel_id, hotel_name, hotel_address, hotel_image, room_type_id, room_type_name, check_in, check_out, nights, guest_name, guest_phone, guest_email, total_price, status, city_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    booking.id, booking.user_id, booking.hotel_id, booking.hotel_name, booking.hotel_address, booking.hotel_image,
    booking.room_type_id, booking.room_type_name, booking.check_in, booking.check_out, booking.nights,
    booking.guest_name, booking.guest_phone, booking.guest_email, booking.total_price, booking.status,
    booking.city_name, now, now
  )
  return { ...booking, created_at: now, updated_at: now }
}

export function getUserBookings(userId: number): DBBooking[] {
  return db.prepare(
    'SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId) as DBBooking[]
}

export function getBookingById(bookingId: string): DBBooking | null {
  return (db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as DBBooking) || null
}

export function updateBookingStatus(bookingId: string, status: string) {
  db.prepare(
    'UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?'
  ).run(status, Date.now(), bookingId)
}

export function cancelBooking(bookingId: string) {
  updateBookingStatus(bookingId, 'cancelled')
}
