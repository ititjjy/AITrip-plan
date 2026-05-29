/**
 * agent/init-db.ts — Agent DB 初始化脚本
 *
 * 创建 agent/data/agent.db 并用城市注册表预填充 city_stats 表。
 * 可安全重复执行（已存在的城市会被跳过）。
 *
 * Usage: npx tsx agent/init-db.ts
 */

import { getDB } from './db.js'
import { loadCities } from './config.js'

console.log('Initializing Agent DB...\n')

// 1. getDB() 自动创建 agent.db + 所有表
const db = getDB()

// 2. 读取城市注册表（合并 city-registry.json + city-coords.json）
const cities = loadCities()
console.log(`Loaded ${cities.length} cities from registry`)

// 3. 预填充 city_stats（INSERT OR IGNORE 跳过已存在的）
const insert = db.prepare(`
  INSERT OR IGNORE INTO city_stats (city_id) VALUES (?)
`)

let created = 0
for (const city of cities) {
  const result = insert.run(city.id)
  if (result.changes > 0) created++
}

// 4. 打印摘要
const statsCount = (db.prepare('SELECT COUNT(*) as cnt FROM city_stats').get() as any).cnt
const poiCount = (db.prepare('SELECT COUNT(*) as cnt FROM city_pois').get() as any).cnt

console.log(`\nAgent DB initialized:`)
console.log(`  Cities in city_stats: ${statsCount} (${created} newly created)`)
console.log(`  Cities with POI data: ${poiCount}`)
console.log(`  Database: agent/data/agent.db`)
