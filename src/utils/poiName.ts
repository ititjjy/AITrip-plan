/**
 * poiName.ts – POI 名称显示工具
 *
 * 统一处理 POI 名称的展示逻辑：
 *   namePrimary = 中文名（主名称）
 *   nameZh = 当地语言别名（日文/韩文等）
 *   nameEn = 英文别名
 */

import type { Attraction } from '../types'

/**
 * 获取 POI 的显示名称
 *
 * namePrimary 已是中文主名称，直接展示
 * 如有当地语言别名则附加展示
 * 例如：
 *   - name="浅草寺", nameZh="" → "浅草寺"
 *   - name="东京塔", nameZh="東京タワー" → "东京塔 (東京タワー)"
 *   - name="故宫", nameZh="" → "故宫"
 */
export function displayName(a: Pick<Attraction, 'name' | 'nameZh'> | null | undefined, fallback = '未知'): string {
  if (!a) return fallback
  const { name, nameZh } = a
  if (!name && !nameZh) return fallback
  if (!nameZh || nameZh === name) return name || fallback
  if (!name) return nameZh
  return `${name} (${nameZh})`
}

/**
 * 获取 POI 的纯主名称（不附加别名）
 * 用于空间有限的场景，如迷你时间线、地图标注等
 */
export function displayNameShort(a: Pick<Attraction, 'name' | 'nameZh'> | null | undefined, fallback = '未知'): string {
  if (!a) return fallback
  return a.name || a.nameZh || fallback
}
