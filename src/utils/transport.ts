/**
 * Transport utilities – v2
 *
 * Provides two modes:
 *   1. Heuristic estimation (synchronous, no API needed)
 *   2. Real routing via OSRM API (async, through our backend proxy)
 *
 * The heuristic is used for instant rendering, then upgraded with OSRM data.
 */

/* ═══════════════════════ Types ═══════════════════════ */

export interface TransportSegment {
  distance: number    // km
  duration: number    // minutes
  mode: 'walk' | 'metro' | 'taxi' | 'bus'
  modeLabel: string
  modeEmoji: string
  costEstimate: number // CNY
  tip: string
}

/** Full transit info with both driving and public transit data */
export interface TransitLeg {
  driving: {
    distance: number // km
    duration: number // minutes
  }
  transit: {
    mode: string
    modeLabel: string
    distance: number // km
    duration: number // minutes
  }
}

/* ═══════════════════════ Haversine ═══════════════════════ */

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* ═══════════════════════ Heuristic Estimation ═══════════════════════ */

/**
 * Synchronous heuristic-based transport estimate.
 * Used for instant rendering before OSRM data arrives.
 */
export function estimateTransport(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  cityId?: string,
): TransportSegment {
  const dist = haversine(fromLat, fromLng, toLat, toLng)
  const roundDist = Math.round(dist * 10) / 10

  // Walk: < 0.8 km
  if (dist < 0.8) {
    return {
      distance: roundDist,
      duration: Math.max(5, Math.round(dist / 4.5 * 60)),
      mode: 'walk',
      modeLabel: '步行',
      modeEmoji: '🚶',
      costEstimate: 0,
      tip: '距离很近，建议步行前往，沿途可以欣赏街景',
    }
  }

  // Metro/Bus: 0.8 – 5 km
  if (dist < 5) {
    const metroTime = Math.round(dist / 25 * 60) + 8
    const busTime = Math.round(dist / 15 * 60) + 5
    const isMetroCity = ['tokyo', 'paris', 'bangkok', 'kyoto'].includes(cityId || '')

    if (isMetroCity) {
      return {
        distance: roundDist,
        duration: metroTime,
        mode: 'metro',
        modeLabel: '地铁',
        modeEmoji: '🚇',
        costEstimate: cityId === 'tokyo' ? 10 : cityId === 'paris' ? 15 : cityId === 'bangkok' ? 5 : 8,
        tip: '推荐乘坐地铁，快捷准时避免堵车',
      }
    }

    return {
      distance: roundDist,
      duration: busTime,
      mode: 'bus',
      modeLabel: '公交',
      modeEmoji: '🚌',
      costEstimate: cityId === 'bali' ? 3 : 5,
      tip: '建议乘坐公交或包车前往',
    }
  }

  // Taxi: > 5 km
  const taxiTime = Math.round(dist / 30 * 60) + 5
  const taxiCost = (() => {
    switch (cityId) {
      case 'tokyo': return Math.round(8 + dist * 6)
      case 'paris': return Math.round(10 + dist * 8)
      case 'bali': return Math.round(3 + dist * 2)
      case 'kyoto': return Math.round(8 + dist * 6)
      case 'santorini': return Math.round(5 + dist * 4)
      case 'bangkok': return Math.round(2 + dist * 2)
      default: return Math.round(5 + dist * 4)
    }
  })()

  return {
    distance: roundDist,
    duration: taxiTime,
    mode: 'taxi',
    modeLabel: cityId === 'bali' ? '包车' : '打车',
    modeEmoji: '🚕',
    costEstimate: taxiCost,
    tip: dist > 15
      ? '距离较远，建议打车或包车，路上可以休息'
      : '建议打车前往，方便快捷',
  }
}

/* ═══════════════════════ OSRM Real Routing ═══════════════════════ */

/**
 * Fetch real driving + public transit estimates for a list of waypoints.
 * Uses our backend proxy to OSRM.
 *
 * @param waypoints Array of [lat, lng] coordinates
 * @returns Array of TransitLeg for each consecutive pair (length = waypoints.length - 1)
 */
export async function fetchTransitLegs(
  waypoints: [number, number][],
): Promise<TransitLeg[] | null> {
  if (waypoints.length < 2) return null

  try {
    // OSRM uses lng,lat format
    const coordStr = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';')
    const response = await fetch(`/api/transit/route?coords=${encodeURIComponent(coordStr)}`)

    if (!response.ok) return null

    const data = await response.json()
    if (!data.success) return null

    return data.legs as TransitLeg[]
  } catch (err) {
    console.warn('[transport] fetchTransitLegs failed:', err)
    return null
  }
}

/**
 * Build a full waypoint list for a day's itinerary:
 * startHotel → poi1 → poi2 → ... → endHotel
 */
export function buildWaypoints(
  items: { lat: number; lng: number }[],
  startHotel?: { lat: number; lng: number } | null,
  endHotel?: { lat: number; lng: number } | null,
): [number, number][] {
  const pts: [number, number][] = []
  if (startHotel) pts.push([startHotel.lat, startHotel.lng])
  for (const item of items) {
    pts.push([item.lat, item.lng])
  }
  if (endHotel) pts.push([endHotel.lat, endHotel.lng])
  return pts
}
