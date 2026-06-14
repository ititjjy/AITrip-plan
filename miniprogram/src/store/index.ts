/* ═══════════════════════ AITrip 小程序 — 全局状态管理 ═══════════════════════
 * 基于Taro事件系统 + Storage持久化，替代Web端的React Context
 * 跨页面共享行程数据、用户状态等
 * ═══════════════════════════════════════════════════════════════════ */

import Taro from '@tarojs/taro'
import type { Trip, User, Attraction, HotelPOI } from '../types'

/* ── State Shape ── */

export interface AppState {
  /** 当前行程 */
  currentTrip: Trip | null
  /** 预选城市ID（从首页点击传入创建页） */
  preSelectedCityId: string | null
  /** 服务端保存的行程ID */
  savedTripId: string | null
  /** 当前选中的日期索引 */
  selectedDayIndex: number
  /** 景点详情ID */
  detailAttractionId: string | null
  /** 酒店详情JSON */
  detailHotelData: string | null
  /** 用户未安排的POI */
  skippedPOIs: Attraction[]
  /** POI ID → Attraction 映射表（用于行程页显示名称和详情页） */
  poiMap: Record<string, Attraction>
  /** 用户信息 */
  user: User | null
  /** JWT token */
  token: string | null
}

const initialState: AppState = {
  currentTrip: null,
  preSelectedCityId: null,
  savedTripId: null,
  selectedDayIndex: 0,
  detailAttractionId: null,
  detailHotelData: null,
  skippedPOIs: [],
  poiMap: {},
  user: null,
  token: null,
}

/* ── Storage Keys ── */

const STORE_KEY = 'aitrip_store'
const TOKEN_KEY = 'aitrip_token'
const USER_KEY = 'aitrip_user'

/* ── Core Store (sync + event) ── */

let _state: AppState = { ...initialState }

/** 从Storage恢复状态（App启动时调用） */
export async function initStore(): Promise<void> {
  try {
    const [storeStr, token, userStr] = await Promise.all([
      Taro.getStorage({ key: STORE_KEY }).catch(() => ({ data: '' })),
      Taro.getStorage({ key: TOKEN_KEY }).catch(() => ({ data: '' })),
      Taro.getStorage({ key: USER_KEY }).catch(() => ({ data: '' })),
    ])
    if (storeStr.data) {
      try { _state = { ...initialState, ...JSON.parse(storeStr.data) } } catch { /* ignore */ }
    }
    if (token.data) _state.token = token.data
    if (userStr.data) {
      try { _state.user = JSON.parse(userStr.data) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/** 获取当前状态快照 */
export function getState(): Readonly<AppState> {
  return _state
}

/** 更新状态并持久化 */
export function setState(partial: Partial<AppState>): void {
  Object.assign(_state, partial)
  // 持久化非运行时数据
  const toSave = {
    currentTrip: _state.currentTrip,
    preSelectedCityId: _state.preSelectedCityId,
    savedTripId: _state.savedTripId,
    skippedPOIs: _state.skippedPOIs,
    poiMap: _state.poiMap,
  }
  Taro.setStorage({ key: STORE_KEY, data: JSON.stringify(toSave) }).catch(() => {})
  // 单独存token和user
  if (partial.token !== undefined) {
    if (partial.token) {
      Taro.setStorage({ key: TOKEN_KEY, data: partial.token }).catch(() => {})
    } else {
      Taro.removeStorage({ key: TOKEN_KEY }).catch(() => {})
    }
  }
  if (partial.user !== undefined) {
    if (partial.user) {
      Taro.setStorage({ key: USER_KEY, data: JSON.stringify(partial.user) }).catch(() => {})
    } else {
      Taro.removeStorage({ key: USER_KEY }).catch(() => {})
    }
  }
  // 通知所有监听者
  Taro.eventCenter.trigger('appStateChange', _state)
}

/** 监听状态变化 */
export function onStateChange(callback: (state: AppState) => void): () => void {
  Taro.eventCenter.on('appStateChange', callback)
  return () => Taro.eventCenter.off('appStateChange', callback)
}

/** 清除所有状态 */
export function clearStore(): void {
  _state = { ...initialState }
  Taro.removeStorage({ key: STORE_KEY }).catch(() => {})
  Taro.removeStorage({ key: TOKEN_KEY }).catch(() => {})
  Taro.removeStorage({ key: USER_KEY }).catch(() => {})
}

/* ── 便捷方法 ── */

/** 获取认证Header */
export function getAuthHeaders(): Record<string, string> {
  return _state.token ? { Authorization: `Bearer ${_state.token}` } : {}
}

/** 更新行程中的某一天 */
export function updateDay(dayIndex: number, updater: (day: any) => any): void {
  if (!_state.currentTrip) return
  const days = [..._state.currentTrip.days]
  days[dayIndex] = updater({ ...days[dayIndex] })
  setState({
    currentTrip: { ..._state.currentTrip, days },
  })
}

/** 生成空白天数组 */
export function generateDays(startDate: string, endDate: string) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const days = []
  let dayNum = 1
  const current = new Date(start)
  while (current <= end) {
    days.push({
      id: `day-${dayNum}`,
      date: current.toISOString().split('T')[0],
      dayNumber: dayNum,
      items: [],
      notes: '',
      hotel: null,
    })
    dayNum++
    current.setDate(current.getDate() + 1)
  }
  return days
}

/** 重新计算预算 */
export function recalcBudget(days: any[]): number {
  return days.reduce((total, day) => {
    return total + day.items.reduce((dayTotal, item) => dayTotal + item.cost, 0)
  }, 0)
}

/** 通过ID查找POI */
export function getPoiById(id: string): Attraction | undefined {
  return _state.poiMap[id]
}
