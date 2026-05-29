#!/usr/bin/env node
/**
 * daily-refresh.js – 每日定时静默补全城市 POI 缓存
 *
 * 策略：
 *  1. 按旅游热度排序所有城市
 *  2. 每天选取 BATCH_SIZE 个城市，调用 Qwen API 静默刷新 POI + Hotel
 *  3. 200 个城市 ≈ 90 天完成一轮
 *  4. 一轮完成后自动回到起点开始下一轮
 *
 * 用法:
 *   node scripts/daily-refresh.js
 *   # 或带调试输出：
 *   DEBUG=1 node scripts/daily-refresh.js
 *   # 强制刷新指定城市：
 *   FORCE_CITY=tokyo node scripts/daily-refresh.js
 *
 * crontab 示例（每天凌晨 3:00 执行）：
 *   0 3 * * * cd /opt/aitrip && /usr/bin/node scripts/daily-refresh.js >> /var/log/aitrip-refresh.log 2>&1
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

/* ═══════════════════════ 配置 ═══════════════════════ */

const BATCH_SIZE = 3                      // 每天刷新城市数
const API_DELAY_MS = 5_000                // 城市之间等待间隔（避免限流）
const CATEGORY_DELAY_MS = 2_000           // 同城市分类之间等待间隔
const API_TIMEOUT_MS = 90_000             // 单个分类 API 超时
const RETRY_COUNT = 2                     // 失败重试次数
const RETRY_DELAY_MS = 10_000             // 重试间隔

/* ═══════════════════════ 路径与数据库 ═══════════════════════ */

const PERSISTENT_DIR = '/data/aitrip'
const DB_DIR = process.env.DB_DIR
  || (fs.existsSync(PERSISTENT_DIR) ? PERSISTENT_DIR : path.join(__dirname, '..', 'server', 'data'))
const DB_PATH = path.join(DB_DIR, 'pois.db')
const STATE_FILE = path.join(DB_DIR, 'refresh-state.json')
const LOG_FILE = path.join(DB_DIR, 'refresh.log')

/* ═══════════════════════ 状态管理 ═══════════════════════ */

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { currentIndex: 0, cycle: 1, lastRun: null, completed: [], failures: {} }
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
  } catch {
    return { currentIndex: 0, cycle: 1, lastRun: null, completed: [], failures: {} }
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

/* ═══════════════════════ 日志 ═══════════════════════ */

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  fs.appendFileSync(LOG_FILE, line + '\n')
}

/* ═══════════════════════ 数据库 ═══════════════════════ */

function getDB() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  return db
}

function upsertPOIs(db, cityId, season, data) {
  db.prepare(`
    INSERT INTO city_pois (city_id, season, data, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(city_id, season)
    DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(cityId, season, JSON.stringify(data), Date.now())
}

function upsertHotels(db, cityId, data) {
  db.prepare(`
    INSERT INTO hotels (city_id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(city_id)
    DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(cityId, JSON.stringify(data), Date.now())
}

/* ═══════════════════════ 季节 ═══════════════════════ */

function getSeason() {
  const m = new Date().getMonth() + 1
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'autumn'
  return 'winter'
}

/* ═══════════════════════ Qwen API 调用 ═══════════════════════ */

const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const MODEL = 'qwen-plus'
const API_KEY = process.env.VITE_DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY

const CATEGORY_PROMPTS = {
  scenic: '景点（名胜古迹、自然风光、历史建筑、公园、地标建筑、观景台）',
  food: '餐饮（餐厅、小吃、咖啡馆、酒吧）',
  shopping: '购物（商场、市场、特色店铺、免税店）',
  activity: '娱乐（主题乐园、游乐园、体验活动、表演、户外运动、休闲、水族馆、动物园）',
}

function buildPrompt(cityName, cityNameEn, seasonLabel, category) {
  const cat = CATEGORY_PROMPTS[category]
  return `推荐${cityName}（${cityNameEn}）${seasonLabel}的${cat}类旅游地点，共50个。

直接输出JSON数组，格式如下（不要输出任何说明文字，不要用markdown代码块）：
[
  {"name":"当地语言地点名","nameZh":"中文名称","description":"简介","rating":4.5,"duration":90,"cost":0,"address":"地址","lat":35.6762,"lng":139.6503,"tags":["标签1","标签2"],"openTime":"09:00","closeTime":"18:00","recommendReason":"推荐理由","seasonScore":9}
]

要求：
1. 地点真实存在，坐标准确，费用为人民币，按seasonScore从高到低排序。
2. "name"字段使用当地语言的正式名称。
3. "nameZh"字段填写对应的中文名称或中文翻译。`
}

function buildHotelPrompt(cityName, cityNameEn) {
  return `推荐${cityName}（${cityNameEn}）最值得入住的30家酒店，涵盖经济型、舒适型、高档型和豪华型各类酒店。

直接输出JSON数组，格式如下（不要输出任何说明文字，不要用markdown代码块）：
[
  {
    "name":"酒店名称","address":"详细地址","lat":35.6762,"lng":139.6503,"rating":4.5,"stars":4,
    "description":"酒店简介（30字左右）","amenities":["Wi-Fi","停车场"],"phone":"联系电话",
    "checkInTime":"14:00","checkOutTime":"12:00","tags":["商务","亲子"],"reviewCount":1500,"distance":2.5,
    "roomTypes":[{"name":"标准双床房","bedType":"双床","maxGuests":2,"area":28,"price":450,"originalPrice":580,"breakfast":true,"amenities":["空调","电视"]}]
  }
]

要求：酒店真实存在，坐标准确，价格为人民币，按推荐度从高到低排序。`
}

async function callQwen(prompt, maxTokens = 8000) {
  if (!API_KEY) throw new Error('API_KEY_MISSING')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  try {
    const res = await fetch(DASHSCOPE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: '你是一位资深旅行规划师，精通全球各地旅游资源。你只输出合法的JSON，不输出任何其他文字。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`HTTP_${res.status}: ${err.error?.message || 'unknown'}`)
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error('EMPTY_RESPONSE')

    // Parse JSON
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      // Try to repair truncated JSON
      const arrStart = text.indexOf('[')
      const lastBrace = text.lastIndexOf('}')
      if (arrStart !== -1 && lastBrace !== -1) {
        const repaired = text.slice(arrStart, lastBrace + 1) + ']'
        try { parsed = JSON.parse(repaired) } catch { throw new Error('JSON_PARSE_ERROR') }
      } else {
        throw new Error('JSON_PARSE_ERROR')
      }
    }

    return Array.isArray(parsed) ? parsed : []
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchPOIsForCity(city) {
  const season = getSeason()
  const seasonLabel = { spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季' }[season]
  const categories = ['scenic', 'food', 'shopping', 'activity']
  const allPOIs = []
  let idx = 0

  for (const cat of categories) {
    let attempts = 0
    let success = false
    while (attempts < RETRY_COUNT && !success) {
      try {
        if (attempts > 0) await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
        log(`  [${city.id}] Fetching ${cat} (attempt ${attempts + 1})...`)
        const items = await callQwen(buildPrompt(city.name, city.nameEn, seasonLabel, cat))
        if (items.length > 0) {
          for (const item of items) {
            idx++
            allPOIs.push({
              id: `ai-${city.id}-${idx}`,
              name: String(item.name || ''),
              nameZh: String(item.nameZh || item.name || ''),
              type: cat,
              image: `https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&h=300&fit=crop`,
              rating: Math.min(5, Math.max(1, Number(item.rating) || 4)),
              duration: Math.min(480, Math.max(15, Number(item.duration) || 60)),
              cost: Math.max(0, Number(item.cost) || 0),
              description: String(item.description || ''),
              address: String(item.address || ''),
              lat: Number(item.lat) || 0,
              lng: Number(item.lng) || 0,
              tags: Array.isArray(item.tags) ? item.tags.slice(0, 4) : [],
              openTime: String(item.openTime || '09:00'),
              closeTime: String(item.closeTime || '22:00'),
              recommendReason: String(item.recommendReason || ''),
              seasonScore: Math.min(10, Math.max(1, Number(item.seasonScore) || 5)),
            })
          }
          log(`  [${city.id}] ${cat}: ${items.length} items ✓`)
          success = true
        } else {
          log(`  [${city.id}] ${cat}: empty response`)
        }
      } catch (err) {
        attempts++
        log(`  [${city.id}] ${cat} failed (attempt ${attempts}): ${err.message}`)
      }
    }
    if (cat !== categories[categories.length - 1]) {
      await new Promise(r => setTimeout(r, CATEGORY_DELAY_MS))
    }
  }

  return allPOIs
}

async function fetchHotelsForCity(city) {
  let attempts = 0
  while (attempts < RETRY_COUNT) {
    try {
      if (attempts > 0) await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
      log(`  [${city.id}] Fetching hotels (attempt ${attempts + 1})...`)
      const items = await callQwen(buildHotelPrompt(city.name, city.nameEn), 16000)
      if (items.length > 0) {
        log(`  [${city.id}] Hotels: ${items.length} items ✓`)
        return items.map((h, i) => ({
          id: `hotel-${city.id}-${i + 1}`,
          name: String(h.name || ''),
          address: String(h.address || ''),
          lat: Number(h.lat) || 0,
          lng: Number(h.lng) || 0,
          rating: Math.min(5, Math.max(1, Number(h.rating) || 4)),
          stars: Math.min(5, Math.max(1, Number(h.stars) || 3)),
          priceRange: [400, 1200],
          description: String(h.description || ''),
          amenities: Array.isArray(h.amenities) ? h.amenities : [],
          images: [],
          phone: String(h.phone || ''),
          checkInTime: String(h.checkInTime || '14:00'),
          checkOutTime: String(h.checkOutTime || '12:00'),
          roomTypes: (h.roomTypes || []).map((r, ri) => ({
            id: `room-${city.id}-${i}-${ri}`,
            name: String(r.name || ''),
            bedType: String(r.bedType || '大床'),
            maxGuests: Number(r.maxGuests) || 2,
            area: Number(r.area) || 25,
            price: Math.max(100, Number(r.price) || 400),
            originalPrice: r.originalPrice || undefined,
            breakfast: !!r.breakfast,
            amenities: Array.isArray(r.amenities) ? r.amenities : [],
            available: true,
          })),
          tags: Array.isArray(h.tags) ? h.tags : [],
          reviewCount: Number(h.reviewCount) || 100,
          distance: Number(h.distance) || 3,
        }))
      }
      return []
    } catch (err) {
      attempts++
      log(`  [${city.id}] Hotels failed (attempt ${attempts}): ${err.message}`)
    }
  }
  return []
}

/* ═══════════════════════ 主流程 ═══════════════════════ */

async function main() {
  log('═══════════════════════════════════════')
  log('Daily POI Refresh Started')
  log(`API Key: ${API_KEY ? 'configured' : 'MISSING'}`)

  if (!API_KEY) {
    log('ERROR: No API key found. Exiting.')
    process.exit(1)
  }

  // 加载城市列表
  const registryPath = path.join(__dirname, 'city-registry.json')
  if (!fs.existsSync(registryPath)) {
    log(`ERROR: City registry not found at ${registryPath}`)
    process.exit(1)
  }
  const allCities = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))
  log(`Loaded ${allCities.length} cities`)

  // 按热度排序
  allCities.sort((a, b) => b.hotness - a.hotness)

  // 加载状态
  const state = loadState()
  log(`Current cycle: ${state.cycle}, index: ${state.currentIndex}`)

  // 确定今日批次
  let selectedCities = []
  const forceCity = process.env.FORCE_CITY

  if (forceCity) {
    const city = allCities.find(c => c.id === forceCity)
    if (city) {
      selectedCities = [city]
      log(`FORCE mode: refreshing ${forceCity}`)
    } else {
      log(`ERROR: Force city ${forceCity} not found`)
      process.exit(1)
    }
  } else {
    for (let i = 0; i < BATCH_SIZE; i++) {
      const idx = (state.currentIndex + i) % allCities.length
      selectedCities.push(allCities[idx])
    }
  }

  log(`Today's batch (${selectedCities.length} cities): ${selectedCities.map(c => c.id).join(', ')}`)

  // 连接数据库
  const db = getDB()

  // 处理每个城市
  let successCount = 0
  let failCount = 0

  for (const city of selectedCities) {
    try {
      log(`[${city.id}] ${city.name} (${city.nameEn}) — starting refresh...`)

      // 1. 刷新 POI
      const pois = await fetchPOIsForCity(city)
      if (pois.length > 0) {
        upsertPOIs(db, city.id, getSeason(), pois)
        log(`[${city.id}] Saved ${pois.length} POIs`)
      } else {
        log(`[${city.id}] WARNING: No POIs fetched`)
      }

      // 2. 刷新 Hotels
      const hotels = await fetchHotelsForCity(city)
      if (hotels.length > 0) {
        upsertHotels(db, city.id, hotels)
        log(`[${city.id}] Saved ${hotels.length} hotels`)
      }

      successCount++
      if (!state.completed.includes(city.id)) state.completed.push(city.id)
      delete state.failures[city.id]

    } catch (err) {
      log(`[${city.id}] FAILED: ${err.message}`)
      failCount++
      state.failures[city.id] = {
        lastFail: new Date().toISOString(),
        error: err.message,
      }
    }

    // 城市间间隔
    if (city !== selectedCities[selectedCities.length - 1]) {
      await new Promise(r => setTimeout(r, API_DELAY_MS))
    }
  }

  db.close()

  // 更新状态
  if (!forceCity) {
    state.currentIndex = (state.currentIndex + BATCH_SIZE) % allCities.length
    if (state.currentIndex === 0 && state.completed.length >= allCities.length) {
      state.cycle++
      state.completed = []
      log(`🔄 Cycle ${state.cycle} started!`)
    }
  }
  state.lastRun = new Date().toISOString()
  saveState(state)

  log(`═══════════════════════════════════════`)
  log(`Done. Success: ${successCount}, Failed: ${failCount}`)
  log(`Next index: ${state.currentIndex}, Cycle: ${state.cycle}`)
  log(`═══════════════════════════════════════`)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
