import { L1_LABELS, type L1Category } from '../types'

export function formatDate(ts: number | undefined | null): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function formatRelativeTime(ts: number | undefined | null): string {
  if (!ts) return '-'
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`
  return `${Math.floor(months / 12)} 年前`
}

export function formatCoord(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

export function formatCategory(l1: L1Category): string {
  return L1_LABELS[l1]?.zh || l1
}

export function formatCategoryPath(l1?: string, l2?: string, l3?: string): string {
  const parts: string[] = []
  if (l1) parts.push(L1_LABELS[l1 as L1Category]?.zh || l1)
  if (l2) parts.push(l2)
  if (l3) parts.push(l3)
  return parts.join(' > ')
}

export function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '-'
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`
}
