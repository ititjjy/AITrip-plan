/**
 * scripts/enrich-district-amap.ts
 *
 * 使用高德逆地理编码 API 为缺失 district 的国内酒店补充行政区信息。
 */

import * as fs from 'fs'
import * as path from 'path'
import Database from 'better-sqlite3'

// Load env from .env.local
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length > 0 && !key.startsWith('#')) {
      process.env[key.trim()] = rest.join('=').trim()
    }
  }
}

const AMAP_KEY = process.env.AMAP_API_KEY || ''
if (!AMAP_KEY) {
  console.error('AMAP_API_KEY not found in environment')
  process.exit(1)
}

const coordsMap: Record<string, { isDomestic: boolean }> =
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'agent', 'data', 'city-coords.json'), 'utf-8'))

const dbPath = path.join(process.cwd(), 'agent', 'data', 'agent.db')
const db = new Database(dbPath)

interface HotelRow {
  city_id: string
  lat: number
  lng: number
  name: string
}

const rows = db.prepare(`
  SELECT city_id,
         json_extract(value, '$.lat') as lat,
         json_extract(value, '$.lng') as lng,
         json_extract(value, '$.namePrimary') as name
  FROM city_pois, json_each(data)
  WHERE json_extract(value, '$.categoryL1') = 'hotel'
    AND (json_extract(value, '$.district') IS NULL OR json_extract(value, '$.district') = '')
`).all() as HotelRow[]

const domestic = rows.filter(r => coordsMap[r.city_id]?.isDomestic)
console.log(`Domestic hotels needing district: ${domestic.length}`)

// Batch by city to minimize API calls per update
const byCity = new Map<string, HotelRow[]>()
for (const h of domestic) {
  const list = byCity.get(h.city_id) || []
  list.push(h)
  byCity.set(h.city_id, list)
}

async function fetchDistrict(lng: number, lat: number): Promise<string> {
  const url = `https://restapi.amap.com/v3/geocode/regeo?key=${AMAP_KEY}&location=${lng},${lat}&extensions=base`
  const res = await fetch(url)
  const data = await res.json()
  if (data.status === '1' && data.regeocode?.addressComponent?.district) {
    return data.regeocode.addressComponent.district
  }
  return ''
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

let successCount = 0
let failCount = 0

for (const [cityId, hotels] of byCity) {
  console.log(`\n━━━ ${cityId} (${hotels.length} hotels) ━━━`)

  // Load current city data
  const row = db.prepare('SELECT data FROM city_pois WHERE city_id = ?').get(cityId) as { data: string }
  const pois = JSON.parse(row.data)

  for (const h of hotels) {
    try {
      const district = await fetchDistrict(h.lng, h.lat)
      if (district) {
        const poi = pois.find((p: any) => p.namePrimary === h.name && p.categoryL1 === 'hotel')
        if (poi) {
          poi.district = district
          successCount++
          console.log(`  ✓ ${h.name} → ${district}`)
        }
      } else {
        failCount++
        console.log(`  ✗ ${h.name} → no district returned`)
      }
    } catch (e: any) {
      failCount++
      console.log(`  ✗ ${h.name} → error: ${e.message}`)
    }
    await sleep(100) // Rate limit: ~10 req/sec
  }

  // Save updated city data
  db.prepare('UPDATE city_pois SET data = ? WHERE city_id = ?')
    .run(JSON.stringify(pois), cityId)
}

console.log(`\n========================================`)
console.log(`Success: ${successCount}, Failed: ${failCount}`)
console.log(`========================================`)

db.close()
