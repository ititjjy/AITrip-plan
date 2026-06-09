/**
 * agent/utils.ts — 工具函数
 *
 * 距离计算、坐标转换 (GCJ-02 → WGS-84)、并发池等。
 */

/* ── Haversine 距离计算 (km) ── */

const EARTH_RADIUS_KM = 6371

export function haversineDistance(
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

/* ── GCJ-02 → WGS-84 坐标转换 (高德坐标校正) ── */

const PI = Math.PI
const A = 6378245.0
const EE = 0.00669342162296594323

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0
  return ret
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0
  return ret
}

function isInChina(lat: number, lng: number): boolean {
  return lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55
}

/**
 * 将高德 GCJ-02 坐标转换为 WGS-84 坐标。
 * 非中国区域直接返回原坐标。
 */
export function gcj02ToWgs84(lat: number, lng: number): { lat: number; lng: number } {
  if (!isInChina(lat, lng)) return { lat, lng }

  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = lat / 180.0 * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI)
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI)

  return { lat: lat - dLat, lng: lng - dLng }
}

/* ── 数值约束 ── */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/* ── 并发池 ── */

/**
 * 并发控制：同时最多执行 maxConcurrent 个任务。
 */
export async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrent: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = []
  const executing = new Set<Promise<void>>()

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    const p = (async () => {
      try {
        const result = await task()
        results[i] = { status: 'fulfilled', value: result }
      } catch (e) {
        results[i] = { status: 'rejected', reason: e }
      }
    })()
    executing.add(p)
    p.finally(() => executing.delete(p))

    if (executing.size >= maxConcurrent) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
  return results
}

/* ── 速率限制器 ── */

export class RateLimiter {
  private lastCall = 0

  constructor(private intervalMs: number) {}

  async wait(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastCall
    if (elapsed < this.intervalMs) {
      await new Promise(r => setTimeout(r, this.intervalMs - elapsed))
    }
    this.lastCall = Date.now()
  }
}

/* ── 延迟工具 ── */

export function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/* ── JSON 修复 (从 LLM 截断输出中恢复) ── */

export function repairTruncatedJSON(text: string): string | null {
  let clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const arrStart = clean.indexOf('[')
  if (arrStart === -1) return null
  clean = clean.slice(arrStart)
  if (clean.endsWith(']')) return clean

  const lastBrace = clean.lastIndexOf('}')
  if (lastBrace === -1) return null
  const truncated = clean.slice(0, lastBrace + 1) + ']'
  try {
    JSON.parse(truncated)
    return truncated
  } catch {
    return null
  }
}

/**
 * 修复格式错误的 JSON（处理未引号属性名、单引号等问题）
 * 主要用于处理轻量级模型（如 Spark Lite）输出的不规范 JSON
 */
export function repairMalformedJSON(text: string): string | null {
  let clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()

  // 找到数组起始位置
  const arrStart = clean.indexOf('[')
  if (arrStart === -1) return null
  clean = clean.slice(arrStart)

  // 修复未引号的属性名: {name: "value"} → {"name": "value"}
  // 匹配 { 或 , 后面跟着的非引号标识符
  clean = clean.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3')

  // 修复单引号字符串: {'name': 'value'} → {"name": "value"}
  // 注意：这个替换可能不够完美，但能处理大部分情况
  clean = clean.replace(/'([^']*)'/g, '"$1"')

  // 移除尾部逗号: [1,2,3,] → [1,2,3]
  clean = clean.replace(/,\s*([}\]])/g, '$1')

  // 尝试解析
  try {
    JSON.parse(clean)
    return clean
  } catch {
    // 如果仍然失败，尝试截断修复
    const lastBrace = clean.lastIndexOf('}')
    if (lastBrace === -1) return null
    const truncated = clean.slice(0, lastBrace + 1) + ']'
    try {
      JSON.parse(truncated)
      return truncated
    } catch {
      return null
    }
  }
}
