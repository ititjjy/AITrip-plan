/**
 * aiRecommend.ts – Frontend client for POI recommendations
 *
 * All AI logic and caching is handled server-side.
 * This module provides a clean API for the UI to fetch POIs.
 *
 * Server cache strategy:
 *   a) < 15 days  → return cached data directly
 *   b) 15–30 days → return cached + trigger background refresh on server
 *   c) > 30 days  → server refreshes from Qwen API first, then returns
 */
import { Attraction } from '@/types'

/* ═══════════════════════ API base URL ═══════════════════════ */

const API_BASE = '/api'

/* ═══════════════════════ Public result type ═══════════════════════ */

export interface AIRecommendResult {
  /** All POIs (up to 200) – full dataset */
  attractions: Attraction[]
  fromCache: boolean
  /** If server returned cached data and is refreshing in background */
  refreshing: boolean
  error?: string
}

/* ═══════════════════════ Load POIs ═══════════════════════ */

/**
 * Load POI recommendations for a city from the backend.
 *
 * The server handles all caching logic:
 *   - Fresh cache → immediate return
 *   - Stale cache → return cache + background refresh
 *   - Expired/no cache → fetch from Qwen API first
 *
 * @param onBackgroundRefresh Called when server finishes background refresh
 *   (poll mechanism: if `refreshing` is true, we poll until fresh data arrives)
 */
export async function loadPOIRecommendations(
  cityName: string,
  cityNameEn: string,
  cityId: string,
  onBackgroundRefresh?: (attractions: Attraction[]) => void,
): Promise<AIRecommendResult> {
  try {
    const params = new URLSearchParams({ cityName, cityNameEn })
    const response = await fetch(`${API_BASE}/pois/${encodeURIComponent(cityId)}?${params}`)

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      const error = errData.error || `HTTP_${response.status}`
      const message = errData.message || `Server error ${response.status}`
      return { attractions: [], fromCache: false, refreshing: false, error: `${error}: ${message}` }
    }

    const result = await response.json()

    if (!result.success) {
      return {
        attractions: [],
        fromCache: false,
        refreshing: false,
        error: result.error || result.message || 'Unknown server error',
      }
    }

    const attractions = castAttractions(result.data || [])

    // If server said it's refreshing in background, start polling
    if (result.refreshing && onBackgroundRefresh) {
      pollForFreshData(cityId, cityName, cityNameEn, onBackgroundRefresh)
    }

    return {
      attractions,
      fromCache: !!result.fromCache,
      refreshing: !!result.refreshing,
    }
  } catch (err) {
    console.error('[aiRecommend] loadPOIRecommendations error:', err)
    return {
      attractions: [],
      fromCache: false,
      refreshing: false,
      error: '网络错误，请检查网络连接后重试',
    }
  }
}

/**
 * Force refresh POIs from Qwen API (user-initiated).
 */
export async function forceRefreshPOIs(
  cityName: string,
  cityNameEn: string,
  cityId: string,
): Promise<AIRecommendResult> {
  try {
    const params = new URLSearchParams({ cityName, cityNameEn })
    const response = await fetch(
      `${API_BASE}/pois/${encodeURIComponent(cityId)}/refresh?${params}`,
      { method: 'POST' },
    )

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      const error = errData.error || `HTTP_${response.status}`
      const message = errData.message || `Server error ${response.status}`
      return { attractions: [], fromCache: false, refreshing: false, error: `${error}: ${message}` }
    }

    const result = await response.json()

    if (!result.success) {
      return {
        attractions: [],
        fromCache: false,
        refreshing: false,
        error: result.error || result.message || 'Unknown error',
      }
    }

    return {
      attractions: castAttractions(result.data || []),
      fromCache: false,
      refreshing: false,
    }
  } catch (err) {
    console.error('[aiRecommend] forceRefreshPOIs error:', err)
    return {
      attractions: [],
      fromCache: false,
      refreshing: false,
      error: '刷新失败，请检查网络连接后重试',
    }
  }
}

/* ═══════════════════════ Top-N helper ═══════════════════════ */

/**
 * From the full dataset (up to 50 per category), return TOP N per category.
 * Sorted by seasonScore (API returns them already sorted).
 */
export function getTopNPerCategory(allPOIs: Attraction[], n = 20): Attraction[] {
  const buckets: Record<string, Attraction[]> = {}
  for (const a of allPOIs) {
    if (!buckets[a.type]) buckets[a.type] = []
    buckets[a.type].push(a)
  }
  const result: Attraction[] = []
  for (const items of Object.values(buckets)) {
    result.push(...items.slice(0, n))
  }
  return result
}

/* ═══════════════════════ Polling for background refresh ═══════════════════════ */

/**
 * When the server returns `refreshing: true`, it means stale cache was returned
 * and a background Qwen API call is in flight. We poll until fresh data arrives.
 */
function pollForFreshData(
  cityId: string,
  cityName: string,
  cityNameEn: string,
  onFresh: (attractions: Attraction[]) => void,
) {
  let attempts = 0
  const maxAttempts = 20 // max ~100 seconds
  const interval = 5000 // poll every 5 seconds

  const timer = setInterval(async () => {
    attempts++
    if (attempts > maxAttempts) {
      clearInterval(timer)
      return
    }

    try {
      const params = new URLSearchParams({ cityName, cityNameEn })
      const response = await fetch(`${API_BASE}/pois/${encodeURIComponent(cityId)}?${params}`)
      if (!response.ok) return

      const result = await response.json()
      if (result.success && !result.refreshing) {
        // Server now has fresh data
        clearInterval(timer)
        const attractions = castAttractions(result.data || [])
        if (attractions.length > 0) {
          onFresh(attractions)
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, interval)
}

/* ═══════════════════════ Type casting helper ═══════════════════════ */

/**
 * Ensure raw POI data from server matches Attraction interface.
 */
function castAttractions(raw: unknown[]): Attraction[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const r = item as Record<string, unknown>
    return {
      id: String(r.id || ''),
      name: String(r.name || ''),
      nameZh: String(r.nameZh || r.name || ''),
      type: String(r.type || 'scenic') as Attraction['type'],
      image: String(r.image || ''),
      rating: Number(r.rating) || 4.0,
      duration: Number(r.duration) || 60,
      cost: Number(r.cost) || 0,
      description: String(r.description || ''),
      address: String(r.address || ''),
      lat: Number(r.lat) || 0,
      lng: Number(r.lng) || 0,
      tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
      openTime: String(r.openTime || '09:00'),
      closeTime: String(r.closeTime || '22:00'),
      recommendReason: String(r.recommendReason || ''),
      ...(r.mealType ? { mealType: String(r.mealType) as Attraction['mealType'] } : {}),
      // Map server seasonScore (1-10) to frontend seasonalIndex (1-5)
      ...(r.seasonScore != null ? { seasonalIndex: Math.round((Number(r.seasonScore) / 2) * 10) / 10 } : {}),
    } satisfies Attraction
  })
}

/* ═══════════════════════ Legacy compat (no longer needed) ═══════════════════════ */

/** @deprecated API Key is now managed server-side */
export function hasApiKey(): boolean {
  return true // Server manages API key
}

/** @deprecated No longer used – cache is server-side */
export function clearCityCache(_cityId: string) {
  // No-op: cache is in server database
}
