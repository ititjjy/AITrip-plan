/**
 * agent/exporter.ts — JSON 导出
 *
 * 将 Agent 数据库中的 POI 数据导出为
 * 与网站 import-cache.js 兼容的 JSON 格式。
 * 6 大类目 (含酒店) 统一存储。
 */

import fs from 'fs'
import path from 'path'
import { AGENT_CONFIG } from './config.js'
import { getAllCityPOIs } from './db.js'

export interface ExportResult {
  filePath: string
  cityCount: number
  poiCount: number
  fileSizeKB: number
}

export function exportToCache(outputPath?: string): ExportResult {
  const filePath = outputPath || AGENT_CONFIG.exportPath

  // 确保输出目录存在
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // 读取数据库
  const pois = getAllCityPOIs()

  const citySet = new Set<string>()
  let totalPOICount = 0
  for (const row of pois) {
    citySet.add(row.city_id)
    const parsed = JSON.parse(row.data)
    totalPOICount += Array.isArray(parsed) ? parsed.length : 0
  }

  // 构建导出格式
  const exportData = {
    version: `agent-v2-${Date.now()}`,
    exportedAt: Date.now(),
    exportedFrom: 'local-agent',
    cityCount: citySet.size,
    pois: pois.map(row => ({
      city_id: row.city_id,
      data: row.data,
      updated_at: row.updated_at,
    })),
  }

  // 写入文件
  const json = JSON.stringify(exportData)
  fs.writeFileSync(filePath, json)

  const fileSizeKB = Math.round(fs.statSync(filePath).size / 1024)

  console.log(`Export complete:`)
  console.log(`  File: ${filePath}`)
  console.log(`  Cities: ${citySet.size}`)
  console.log(`  Total POIs: ${totalPOICount}`)
  console.log(`  Size: ${fileSizeKB} KB`)

  return {
    filePath,
    cityCount: citySet.size,
    poiCount: totalPOICount,
    fileSizeKB,
  }
}
