/**
 * agent/db.ts — Agent 本地 SQLite 数据库
 *
 * 独立于网站的 pois.db，存储采集数据和日志。
 * 新 schema: POI 表按 city_id 分组，月度指数嵌入数据内部。
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { AGENT_CONFIG } from './config.js'
import type { RawPOI } from './sources/base.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let db: Database.Database

export function getDB(): Database.Database {
  if (db) return db

  const dbDir = path.dirname(AGENT_CONFIG.dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  db = new Database(AGENT_CONFIG.dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initTables()
  return db
}

function initTables() {
  // POI 数据 (含全部 6 大类目，含酒店)
  db.exec(`
    CREATE TABLE IF NOT EXISTS city_pois (
      city_id    TEXT    NOT NULL PRIMARY KEY,
      data       TEXT    NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // 采集日志
  db.exec(`
    CREATE TABLE IF NOT EXISTS collection_logs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      city_id         TEXT    NOT NULL,
      source          TEXT    NOT NULL,
      status          TEXT    NOT NULL,
      items_collected INTEGER NOT NULL DEFAULT 0,
      items_accepted  INTEGER NOT NULL DEFAULT 0,
      error_message   TEXT    DEFAULT '',
      duration_ms     INTEGER NOT NULL DEFAULT 0,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_logs_city_source
    ON collection_logs (city_id, source)
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_logs_created
    ON collection_logs (created_at)
  `)

  // 刷新周期记录
  db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_cycles (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_type   TEXT    NOT NULL,
      status       TEXT    NOT NULL,
      started_at   INTEGER NOT NULL,
      completed_at INTEGER,
      config       TEXT    NOT NULL DEFAULT '{}',
      results      TEXT    NOT NULL DEFAULT '{}'
    )
  `)

  // city_pois version 列 (安全 ALTER)
  const cols = db.prepare("PRAGMA table_info('city_pois')").all() as any[]
  if (!cols.some(c => c.name === 'version')) {
    db.exec('ALTER TABLE city_pois ADD COLUMN version INTEGER NOT NULL DEFAULT 1')
  }

  // 原始采集数据 (城市 × 来源，只保留最新一次)
  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_pois (
      city_id      TEXT    NOT NULL,
      source       TEXT    NOT NULL,
      data         TEXT    NOT NULL,
      items_count  INTEGER NOT NULL DEFAULT 0,
      collected_at INTEGER NOT NULL,
      PRIMARY KEY (city_id, source)
    )
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_raw_city ON raw_pois (city_id)
  `)

  // 待确认更新 (每城市最多一条)
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_updates (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      city_id       TEXT    NOT NULL UNIQUE,
      data          TEXT    NOT NULL,
      quality_score REAL    DEFAULT NULL,
      by_category   TEXT    NOT NULL DEFAULT '{}',
      score_dist    TEXT    NOT NULL DEFAULT '{}',
      total_pois    INTEGER NOT NULL DEFAULT 0,
      sources_used  TEXT    NOT NULL DEFAULT '[]',
      issues_count  INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL
    )
  `)

  // 城市统计
  db.exec(`
    CREATE TABLE IF NOT EXISTS city_stats (
      city_id            TEXT    PRIMARY KEY,
      total_pois         INTEGER NOT NULL DEFAULT 0,
      quality_score      REAL    DEFAULT NULL,
      last_collection_at INTEGER DEFAULT NULL,
      collection_count   INTEGER NOT NULL DEFAULT 0,
      failure_count      INTEGER NOT NULL DEFAULT 0,
      sources_used       TEXT    NOT NULL DEFAULT '[]',
      by_category        TEXT    NOT NULL DEFAULT '{}'
    )
  `)
}

/* ── POI CRUD ── */

export function upsertPOIs(cityId: string, data: any[]): void {
  const d = getDB()
  d.prepare(`
    INSERT INTO city_pois (city_id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(city_id)
    DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(cityId, JSON.stringify(data), Date.now())
}

export function getCachedPOIs(cityId: string): any[] | null {
  const d = getDB()
  const row = d.prepare('SELECT data FROM city_pois WHERE city_id = ?')
    .get(cityId) as { data: string } | undefined
  return row ? JSON.parse(row.data) : null
}

export function getAllCityPOIs(): Array<{ city_id: string; data: string; updated_at: number }> {
  const d = getDB()
  return d.prepare('SELECT city_id, data, updated_at FROM city_pois').all() as any[]
}

/* ── 采集日志 ── */

export function logCollection(entry: {
  city_id: string
  source: string
  status: string
  items_collected: number
  items_accepted: number
  error_message?: string
  duration_ms: number
}): void {
  const d = getDB()
  d.prepare(`
    INSERT INTO collection_logs (city_id, source, status, items_collected, items_accepted, error_message, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(entry.city_id, entry.source, entry.status, entry.items_collected, entry.items_accepted,
    entry.error_message || '', entry.duration_ms)
}

/* ── 城市统计 ── */

export function updateCityStats(cityId: string, updates: {
  totalPois?: number
  qualityScore?: number
  source?: string
  success?: boolean
  byCategory?: Record<string, number>
}): void {
  const d = getDB()
  const existing = d.prepare('SELECT * FROM city_stats WHERE city_id = ?').get(cityId) as any

  if (!existing) {
    d.prepare(`
      INSERT INTO city_stats (city_id, total_pois, quality_score, last_collection_at, collection_count, failure_count, sources_used, by_category)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      cityId,
      updates.totalPois ?? 0,
      updates.qualityScore ?? null,
      Date.now(),
      updates.success === false ? 1 : 0,
      JSON.stringify(updates.source ? [updates.source] : []),
      JSON.stringify(updates.byCategory || {}),
    )
    return
  }

  const prevSources: string[] = JSON.parse(existing.sources_used || '[]')
  const newSources = updates.source && !prevSources.includes(updates.source)
    ? [...prevSources, updates.source]
    : prevSources

  const failureCount = updates.success === false
    ? existing.failure_count + 1
    : (updates.success === true ? 0 : existing.failure_count)

  d.prepare(`
    UPDATE city_stats SET
      total_pois = COALESCE(?, total_pois),
      quality_score = COALESCE(?, quality_score),
      last_collection_at = ?,
      collection_count = collection_count + 1,
      failure_count = ?,
      sources_used = ?,
      by_category = COALESCE(?, by_category)
    WHERE city_id = ?
  `).run(
    updates.totalPois ?? null,
    updates.qualityScore ?? null,
    Date.now(),
    failureCount,
    JSON.stringify(newSources),
    updates.byCategory ? JSON.stringify(updates.byCategory) : null,
    cityId,
  )
}

export function getCityStats(cityId: string): any | null {
  const d = getDB()
  return d.prepare('SELECT * FROM city_stats WHERE city_id = ?').get(cityId) || null
}

export function getAllCityStats(): any[] {
  const d = getDB()
  return d.prepare('SELECT * FROM city_stats ORDER BY last_collection_at DESC').all()
}

export function getCityCount(): { total: number; withPois: number } {
  const d = getDB()
  const poiCount = d.prepare('SELECT COUNT(DISTINCT city_id) as cnt FROM city_pois').get() as any
  const statsCount = d.prepare('SELECT COUNT(*) as cnt FROM city_stats').get() as any
  return {
    total: statsCount.cnt,
    withPois: poiCount.cnt,
  }
}

/* ── Refresh Cycles ── */

export interface RefreshCycle {
  cycle_type: 'baseline' | 'incremental' | 'full_refresh'
  status: 'running' | 'completed' | 'failed'
  config?: Record<string, any>
}

export function insertRefreshCycle(cycle: RefreshCycle): number {
  const d = getDB()
  const result = d.prepare(`
    INSERT INTO refresh_cycles (cycle_type, status, started_at, config)
    VALUES (?, ?, ?, ?)
  `).run(cycle.cycle_type, cycle.status, Date.now(), JSON.stringify(cycle.config || {}))
  return Number(result.lastInsertRowid)
}

export function updateRefreshCycle(id: number, updates: {
  status?: string
  results?: Record<string, any>
}): void {
  const d = getDB()
  const sets: string[] = []
  const params: any[] = []

  if (updates.status) {
    sets.push('status = ?')
    params.push(updates.status)
    if (updates.status === 'completed' || updates.status === 'failed') {
      sets.push('completed_at = ?')
      params.push(Date.now())
    }
  }
  if (updates.results) {
    sets.push('results = ?')
    params.push(JSON.stringify(updates.results))
  }

  if (sets.length === 0) return
  params.push(id)
  d.prepare(`UPDATE refresh_cycles SET ${sets.join(', ')} WHERE id = ?`).run(...params)
}

export function getLatestRefreshCycle(): any | null {
  const d = getDB()
  return d.prepare('SELECT * FROM refresh_cycles ORDER BY id DESC LIMIT 1').get() || null
}

export function getRefreshHistory(limit: number = 20): any[] {
  const d = getDB()
  return d.prepare('SELECT * FROM refresh_cycles ORDER BY id DESC LIMIT ?').all(limit)
}

/* ── City Version ── */

export function incrementCityVersion(cityId: string): number {
  const d = getDB()
  d.prepare(`
    UPDATE city_pois SET version = version + 1 WHERE city_id = ?
  `).run(cityId)
  return getCityVersion(cityId)
}

export function getCityVersion(cityId: string): number {
  const d = getDB()
  const row = d.prepare('SELECT version FROM city_pois WHERE city_id = ?').get(cityId) as any
  return row?.version ?? 0
}

/* ── Raw POI CRUD ── */

/**
 * 保存某城市某数据源的原始采集数据。
 * INSERT OR REPLACE 语义：每次覆盖该 (city_id, source) 的旧数据，只保留最新一次。
 */
export function saveRawPOIs(cityId: string, source: string, data: RawPOI[]): void {
  const d = getDB()
  d.prepare(`
    INSERT OR REPLACE INTO raw_pois (city_id, source, data, items_count, collected_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(cityId, source, JSON.stringify(data), data.length, Date.now())
}

/**
 * 加载某城市所有来源的原始采集数据。
 * 返回空数组表示该城市尚未采集任何 raw 数据。
 */
export function loadRawPOIs(cityId: string): { source: string; data: RawPOI[]; collected_at: number }[] {
  const d = getDB()
  const rows = d.prepare('SELECT source, data, collected_at FROM raw_pois WHERE city_id = ?')
    .all(cityId) as { source: string; data: string; collected_at: number }[]
  return rows.map(r => ({ source: r.source, data: JSON.parse(r.data) as RawPOI[], collected_at: r.collected_at }))
}

/**
 * 加载某城市某来源的原始采集数据。
 * 返回 null 表示该 (city_id, source) 无数据。
 */
export function loadRawPOIsBySource(cityId: string, source: string): RawPOI[] | null {
  const d = getDB()
  const row = d.prepare('SELECT data FROM raw_pois WHERE city_id = ? AND source = ?')
    .get(cityId, source) as { data: string } | undefined
  return row ? JSON.parse(row.data) as RawPOI[] : null
}

/**
 * 获取所有城市×来源的 raw 数据摘要（不解析 JSON，用于 status 命令展示）。
 */
export function getRawPOIsSummary(): { city_id: string; source: string; items_count: number; collected_at: number }[] {
  const d = getDB()
  return d.prepare('SELECT city_id, source, items_count, collected_at FROM raw_pois ORDER BY city_id, source')
    .all() as { city_id: string; source: string; items_count: number; collected_at: number }[]
}

/* ── Pending Updates ── */

export interface PendingMeta {
  qualityScore?: number
  byCategory: Record<string, number>
  scoreDist: Record<string, number>
  totalPois: number
  sourcesUsed: string[]
  issuesCount: number
}

export function upsertPendingUpdate(cityId: string, data: any[], meta: PendingMeta): void {
  const d = getDB()
  d.prepare(`
    INSERT OR REPLACE INTO pending_updates
      (city_id, data, quality_score, by_category, score_dist, total_pois, sources_used, issues_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cityId,
    JSON.stringify(data),
    meta.qualityScore ?? null,
    JSON.stringify(meta.byCategory),
    JSON.stringify(meta.scoreDist),
    meta.totalPois,
    JSON.stringify(meta.sourcesUsed),
    meta.issuesCount,
    Date.now(),
  )
}

export function getPendingUpdates(): Array<{
  id: number; city_id: string; quality_score: number | null;
  by_category: string; score_dist: string; total_pois: number;
  sources_used: string; issues_count: number; created_at: number;
}> {
  const d = getDB()
  return d.prepare(`
    SELECT id, city_id, quality_score, by_category, score_dist,
           total_pois, sources_used, issues_count, created_at
    FROM pending_updates ORDER BY created_at DESC
  `).all() as any[]
}

export function getPendingUpdate(cityId: string): {
  id: number; city_id: string; data: string; quality_score: number | null;
  by_category: string; score_dist: string; total_pois: number;
  sources_used: string; issues_count: number; created_at: number;
} | null {
  const d = getDB()
  return d.prepare('SELECT * FROM pending_updates WHERE city_id = ?').get(cityId) as any || null
}

export function getPendingUpdateCount(): number {
  const d = getDB()
  const row = d.prepare('SELECT COUNT(*) as cnt FROM pending_updates').get() as any
  return row.cnt
}

export function deletePendingUpdate(cityId: string): void {
  const d = getDB()
  d.prepare('DELETE FROM pending_updates WHERE city_id = ?').run(cityId)
}

export function applyPendingUpdate(cityId: string): number {
  const pending = getPendingUpdate(cityId)
  if (!pending) return 0

  const pois = JSON.parse(pending.data)
  upsertPOIs(cityId, pois)

  updateCityStats(cityId, {
    totalPois: pending.total_pois,
    qualityScore: pending.quality_score ?? undefined,
    source: JSON.parse(pending.sources_used).join(','),
    byCategory: JSON.parse(pending.by_category),
    success: true,
  })

  deletePendingUpdate(cityId)
  return pois.length
}


/* ── Close ── */

export function closeDB(): void {
  if (db) {
    db.close()
    db = undefined as any
  }
}
