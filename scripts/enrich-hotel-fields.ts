/**
 * scripts/enrich-hotel-fields.ts
 *
 * 批量为所有酒店 POI 补充 distanceFromCenter 和 district 字段。
 * 读取 agent.db 的 city_pois 表，更新后写回。
 */

import * as fs from 'fs'
import * as path from 'path'
import Database from 'better-sqlite3'
import type { POI } from '../agent/sources/base.js'

const EARTH_RADIUS_KM = 6371

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (deg: number) => deg * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

function extractDistrict(address: string, addressEn: string, isDomestic: boolean): string {
  if (isDomestic && address) {
    const m = address.match(/([^省市]+(?:区|县))/)
    if (m) return m[1]
  }
  if (addressEn) {
    const enPatterns = [
      /([A-Z][a-zA-Z\s]+(?:District|Regency|County|Borough)),/,
      /,\s*([A-Z][a-zA-Z\s]+(?:District|Regency|County|Borough)),/,
    ]
    for (const p of enPatterns) {
      const m = addressEn.match(p)
      if (m) return m[1].trim()
    }
    const parts = addressEn.split(',').map(s => s.trim()).filter(Boolean)
    if (parts.length >= 3) {
      const candidate = parts[parts.length - 2]
      if (candidate && !/\d/.test(candidate)) return candidate
    }
  }
  return ''
}

// ── Load city coordinates ──
const coordsPath = path.join(process.cwd(), 'agent', 'data', 'city-coords.json')
const coordsMap: Record<string, { lat: number; lng: number; isDomestic: boolean }> =
  fs.existsSync(coordsPath) ? JSON.parse(fs.readFileSync(coordsPath, 'utf-8')) : {}

// ── Open agent DB ──
const dbPath = path.join(process.cwd(), 'agent', 'data', 'agent.db')
const db = new Database(dbPath)

// Get all cities with data
const cityRows = db.prepare('SELECT city_id, data FROM city_pois').all() as
  { city_id: string; data: string }[]

console.log(`Processing ${cityRows.length} cities...\n`)

let totalHotels = 0
let updatedHotels = 0
let missingDistrict = 0

for (const row of cityRows) {
  const cityId = row.city_id
  const coords = coordsMap[cityId]
  if (!coords) {
    console.log(`  [Skip] ${cityId}: no coordinates found`)
    continue
  }

  const pois: POI[] = JSON.parse(row.data)
  const hotels = pois.filter(p => p.categoryL1 === 'hotel')
  if (hotels.length === 0) continue

  totalHotels += hotels.length
  let cityUpdated = 0

  for (const poi of pois) {
    if (poi.categoryL1 !== 'hotel') continue

    const dist = Math.round(haversineDistance(poi.lat, poi.lng, coords.lat, coords.lng) * 10) / 10
    const district = extractDistrict(poi.address, poi.addressEn, coords.isDomestic)

    if (!poi.distanceFromCenter || poi.distanceFromCenter !== dist) {
      poi.distanceFromCenter = dist
      cityUpdated++
    }
    if (!poi.district || poi.district !== district) {
      poi.district = district
      cityUpdated++
    }
    if (!district) missingDistrict++
  }

  if (cityUpdated > 0) {
    db.prepare('UPDATE city_pois SET data = ? WHERE city_id = ?')
      .run(JSON.stringify(pois), cityId)
    updatedHotels += cityUpdated / 2  // each hotel has 2 fields
  }

  console.log(`  ${cityId}: ${hotels.length} hotels, ${cityUpdated > 0 ? 'updated' : 'no change'}`)
}

console.log(`\n========================================`)
console.log(`Total hotels: ${totalHotels}`)
console.log(`Hotels updated: ${Math.floor(updatedHotels)}`)
console.log(`Missing district: ${missingDistrict}`)
console.log(`========================================`)

db.close()
