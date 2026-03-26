/**
 * poiName.ts – POI 名称显示工具
 *
 * 统一处理 POI 中文名称的展示逻辑：
 *   - 如果 name 和 nameZh 相同（或 nameZh 缺失）→ 只显示 name
 *   - 如果不同 → 显示 "中文名 (原名)"
 */

import type { Attraction } from '../types'

/**
 * 获取 POI 的显示名称
 *
 * 优先展示中文名，如果原名与中文名不同则附加原名
 * 例如：
 *   - name="浅草寺", nameZh="浅草寺" → "浅草寺"
 *   - name="Sensō-ji", nameZh="浅草寺" → "浅草寺 (Sensō-ji)"
 *   - name="東京タワー", nameZh="东京塔" → "东京塔 (東京タワー)"
 */
export function displayName(a: Pick<Attraction, 'name' | 'nameZh'> | null | undefined, fallback = '未知'): string {
  if (!a) return fallback
  const { name, nameZh } = a
  if (!name && !nameZh) return fallback
  if (!nameZh || nameZh === name) return name || fallback
  if (!name) return nameZh
  return `${nameZh} (${name})`
}

/**
 * 获取 POI 的纯中文名称（不附加原名）
 * 用于空间有限的场景，如迷你时间线、地图标注等
 */
export function displayNameShort(a: Pick<Attraction, 'name' | 'nameZh'> | null | undefined, fallback = '未知'): string {
  if (!a) return fallback
  return a.nameZh || a.name || fallback
}
