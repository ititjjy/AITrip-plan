/**
 * Route Planner v3 – Smart itinerary generation engine
 *
 * Core algorithm:
 *   1. Previous night's hotel → today's start point
 *      Today's hotel → today's end point
 *   2. Geographic centroid clustering for multi-day POI distribution
 *      (assigns POIs to days so each day covers a compact area)
 *   3. Shortest-distance routing with anti-backtracking bias
 *      (nearest-neighbour greedy + directional scoring toward end hotel)
 *   4. 2-opt path improvement considering both start & end hotels
 *   5. Meal POIs placed at proper times with geographic proximity scoring
 *      – breakfast near hotel / first destination
 *      – lunch near mid-day activities
 *      – dinner near last activity / hotel
 *   6. Operating-hour constraints (never schedule outside business hours)
 *   7. Daily window: 08:00 – 21:00
 */

import { Attraction, DayPlan, ItineraryItem, HotelPOI, Trip } from '../types'

/* ── POI 全量数据注入（由调用方传入，用于自动填充三餐和空档） ── */
let _injectedAllPOIs: Attraction[] = []
export function injectAllPOIs(pois: Attraction[]): void { _injectedAllPOIs = pois }
function getAllAttractions(_cityId: string): Attraction[] { return _injectedAllPOIs }

/* ─────────────────── Geo helpers ─────────────────── */

/** Haversine distance in km between two lat/lng points */
function haversine(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* ─────────────────── Time helpers ─────────────────── */

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function minToTime(m: number): string {
  const h = Math.floor(Math.max(0, m) / 60) % 24
  const mm = Math.max(0, m) % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Rough travel time (minutes) between two points */
function travelMinutes(distKm: number): number {
  // City average ~20 km/h including transfers; minimum 8 min transition
  return Math.max(8, Math.round((distKm / 20) * 60))
}

/* ─────────────────── Meal slot definitions ─────────────────── */

interface MealSlot {
  type: 'breakfast' | 'lunch' | 'dinner'
  earliest: number // minutes since midnight
  ideal: number
  latest: number
  label: string
}

const MEAL_SLOTS: MealSlot[] = [
  { type: 'breakfast', earliest: 7 * 60, ideal: 8 * 60, latest: 9 * 60 + 30, label: '早餐' },
  { type: 'lunch', earliest: 11 * 60, ideal: 12 * 60, latest: 13 * 60 + 30, label: '午餐' },
  { type: 'dinner', earliest: 17 * 60 + 30, ideal: 18 * 60 + 30, latest: 20 * 60, label: '晚餐' },
]

/* ─────────────────── Core constants ─────────────────── */

const DAY_START = 8 * 60  // 08:00
const DAY_END = 22 * 60   // 22:00 – allow evening activities (shows, night markets)

/* ─────────────────── Opening hour checks ─────────────────── */

/** Check if a time string is a valid HH:MM format (not "全天", "24小时" etc.) */
function isValidTimeStr(t: string | undefined | null): boolean {
  if (!t) return false
  return /^\d{1,2}:\d{2}$/.test(t.trim())
}

function isOpenDuring(a: Attraction, startMin: number): boolean {
  if (!isValidTimeStr(a.openTime) || !isValidTimeStr(a.closeTime)) return true
  let open = timeToMin(a.openTime!)
  let close = timeToMin(a.closeTime!)
  if (close <= open) close += 24 * 60
  return startMin >= open && (startMin + a.duration) <= close
}

function findEarliestOpenSlot(a: Attraction, earliest: number): number {
  if (!isValidTimeStr(a.openTime) || !isValidTimeStr(a.closeTime)) {
    // No valid time constraints – just check day window
    return earliest + a.duration <= DAY_END ? earliest : -1
  }
  let open = timeToMin(a.openTime!)
  let close = timeToMin(a.closeTime!)
  if (close <= open) close += 24 * 60
  const start = Math.max(earliest, open)
  if (start + a.duration <= Math.min(close, DAY_END)) return start
  return -1
}

/* ─────────────────── POI classification ─────────────────── */

interface ClassifiedPOIs {
  breakfast: Attraction[]
  lunch: Attraction[]
  dinner: Attraction[]
  snack: Attraction[]
  nonFood: Attraction[]
}

function classifyPOIs(attractions: Attraction[]): ClassifiedPOIs {
  const result: ClassifiedPOIs = {
    breakfast: [], lunch: [], dinner: [], snack: [], nonFood: [],
  }
  for (const a of attractions) {
    if (a.type === 'food') {
      const mt = a.mealType || inferMealType(a)
      switch (mt) {
        case 'breakfast': result.breakfast.push(a); break
        case 'lunch':     result.lunch.push(a); break
        case 'dinner':    result.dinner.push(a); break
        case 'snack':     result.snack.push(a); break
        default:          result.lunch.push(a); break
      }
    } else {
      result.nonFood.push(a)
    }
  }
  return result
}

function inferMealType(a: Attraction): Attraction['mealType'] {
  const tags = a.tags.join(' ').toLowerCase()
  const name = a.name.toLowerCase()
  const desc = a.description.toLowerCase()
  if (tags.includes('早餐') || tags.includes('早点') || name.includes('早')) return 'breakfast'
  if (tags.includes('甜品') || tags.includes('小吃') || tags.includes('面包') ||
      tags.includes('咖啡') || tags.includes('coffee') || tags.includes('cafe')) return 'snack'
  if (tags.includes('夜市') || tags.includes('烧烤') || tags.includes('bbq') ||
      tags.includes('晚') || desc.includes('夜') || name.includes('居酒屋')) return 'dinner'
  if (isValidTimeStr(a.openTime)) {
    const open = timeToMin(a.openTime!)
    if (open <= 7 * 60) return 'breakfast'
    if (open >= 17 * 60) return 'dinner'
  }
  return 'lunch'
}

/* ─────────────────── Scheduling types ─────────────────── */

interface ScheduledPOI {
  attraction: Attraction
  startMin: number
  endMin: number
  isAutoFilled?: boolean
  mealSlot?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
}

/* ─────────────────── Greedy route with anti-backtracking ─────────────────── */

/**
 * Route POIs using nearest-neighbour greedy with a directional bias
 * toward the end destination. This avoids zig-zagging / backtracking.
 *
 * Score = travelTime + waitTime*0.3 + backtrackPenalty
 * backtrackPenalty = extra distance from endPoint if we visit this POI
 */
function greedyRouteWithDirection(
  pois: Attraction[],
  startLat: number,
  startLng: number,
  endLat: number | null,
  endLng: number | null,
): Attraction[] {
  if (pois.length === 0) return []

  const remaining = [...pois]
  const ordered: Attraction[] = []
  let curLat = startLat
  let curLng = startLng
  let curTime = DAY_START

  while (remaining.length > 0) {
    let bestIdx = -1
    let bestScore = Infinity

    for (let i = 0; i < remaining.length; i++) {
      const a = remaining[i]
      const dist = haversine(curLat, curLng, a.lat, a.lng)
      const travel = travelMinutes(dist)
      const arriveAt = curTime + travel
      const slot = findEarliestOpenSlot(a, arriveAt)
      if (slot === -1) continue

      const waitTime = slot - arriveAt

      // Anti-backtracking: penalize POIs that move us further from end destination
      let backtrackPenalty = 0
      if (endLat != null && endLng != null) {
        const distToEndNow = haversine(curLat, curLng, endLat, endLng)
        const distToEndAfterVisit = haversine(a.lat, a.lng, endLat, endLng)
        // Only penalize if we're moving AWAY from end
        backtrackPenalty = Math.max(0, distToEndAfterVisit - distToEndNow) * 1.5
      }

      // Time-of-day preference: scenic → day-time, shopping → noon/evening
      let timePrefPenalty = 0
      if (a.type === 'scenic' && slot > 17 * 60) {
        timePrefPenalty = (slot - 17 * 60) * 0.4 // avoid evening for scenic
      } else if (a.type === 'shopping') {
        if (slot < 11 * 60) timePrefPenalty = (11 * 60 - slot) * 0.2 // avoid early morning
      } else if (a.type === 'activity' && slot > 18 * 60) {
        timePrefPenalty = (slot - 18 * 60) * 0.4 // avoid evening for activities
      }

      const score = travel + waitTime * 0.3 + backtrackPenalty + timePrefPenalty
      if (score < bestScore) {
        bestScore = score
        bestIdx = i
      }
    }

    if (bestIdx === -1) break

    const chosen = remaining.splice(bestIdx, 1)[0]
    ordered.push(chosen)

    const dist = haversine(curLat, curLng, chosen.lat, chosen.lng)
    const travel = travelMinutes(dist)
    const arriveAt = curTime + travel
    const slot = findEarliestOpenSlot(chosen, arriveAt)!
    curTime = slot + chosen.duration
    curLat = chosen.lat
    curLng = chosen.lng
  }

  return ordered
}

/* ─────────────────── 2-opt improvement ─────────────────── */

/**
 * 2-opt local search to reduce total route distance.
 * Considers both start point and end point (hotel) in distance calculations.
 * Tries reversing sub-segments to find a shorter overall path.
 */
function twoOptImprove(
  pois: Attraction[],
  startLat: number,
  startLng: number,
  endLat?: number | null,
  endLng?: number | null,
): Attraction[] {
  if (pois.length <= 2) return pois
  const route = [...pois]
  let improved = true
  let iterations = 0

  // Helper: get coordinates of the point after index j
  const afterJ = (j: number) => {
    if (j + 1 < route.length) return { lat: route[j + 1].lat, lng: route[j + 1].lng }
    // Last element → end point is the hotel (or loop back to start)
    if (endLat != null && endLng != null) return { lat: endLat, lng: endLng }
    return { lat: startLat, lng: startLng }
  }

  while (improved && iterations < 50) {
    improved = false
    iterations++
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const prevI = i === 0 ? { lat: startLat, lng: startLng } : route[i - 1]
        const nextJ = afterJ(j)

        const currentDist =
          haversine(prevI.lat, prevI.lng, route[i].lat, route[i].lng) +
          haversine(route[j].lat, route[j].lng, nextJ.lat, nextJ.lng)
        const newDist =
          haversine(prevI.lat, prevI.lng, route[j].lat, route[j].lng) +
          haversine(route[i].lat, route[i].lng, nextJ.lat, nextJ.lng)

        if (newDist < currentDist - 0.01) {
          const reversed = route.slice(i, j + 1).reverse()
          route.splice(i, j - i + 1, ...reversed)
          improved = true
        }
      }
    }
  }
  return route
}

/* ─────────────────── Meal insertion (v3 – geography-aware) ─────────────────── */

/**
 * Insert a meal POI into the schedule at the best position.
 *
 * v3 scoring: combines time deviation AND geographic detour.
 *
 * 核心原则：
 *   - 早餐：靠近出发酒店或当天第一个目的地
 *   - 午餐：靠近上午/下午活动的中间位置
 *   - 晚餐：靠近最后一个活动或回程酒店
 *   - "吃完顺便玩，玩完附近吃"
 *
 * Geographic detour = dist(prev→meal) + dist(meal→next) - dist(prev→next)
 * Combined score = timeDeviation + detourKm * 5 (5min penalty per km detour)
 */
function insertMealIntoSchedule(
  schedule: ScheduledPOI[],
  meal: Attraction,
  slot: MealSlot,
  startHotelLat: number,
  startHotelLng: number,
  endHotelLat: number | null,
  endHotelLng: number | null,
  isAutoFilled = false,
): ScheduledPOI[] {
  const result = [...schedule]

  // ── Guard: never insert a second meal of the same type ──
  if (result.some(s => s.mealSlot === slot.type)) {
    console.warn(`[routePlanner] Day already has ${slot.type}, skipping: ${meal.name}`)
    return result
  }

  let bestInsertIdx = result.length
  let bestStartTime = slot.ideal
  let bestScore = Infinity

  for (let i = 0; i <= result.length; i++) {
    let prevEndTime: number
    let prevLat: number
    let prevLng: number

    if (i === 0) {
      prevEndTime = DAY_START
      prevLat = startHotelLat
      prevLng = startHotelLng
    } else {
      prevEndTime = result[i - 1].endMin
      prevLat = result[i - 1].attraction.lat
      prevLng = result[i - 1].attraction.lng
    }

    // Next point: next scheduled POI, or end hotel, or start hotel
    let nextLat: number
    let nextLng: number
    if (i < result.length) {
      nextLat = result[i].attraction.lat
      nextLng = result[i].attraction.lng
    } else if (endHotelLat != null && endHotelLng != null) {
      nextLat = endHotelLat
      nextLng = endHotelLng
    } else {
      nextLat = startHotelLat
      nextLng = startHotelLng
    }

    const distToMeal = haversine(prevLat, prevLng, meal.lat, meal.lng)
    const travel = travelMinutes(distToMeal)
    const arriveAt = prevEndTime + travel
    const startTime = Math.max(arriveAt, slot.earliest)

    if (startTime > slot.latest) continue
    if (startTime + meal.duration > DAY_END) continue

    // Check overlap with next item
    if (i < result.length) {
      const mealEnd = startTime + meal.duration
      const nextDist = haversine(meal.lat, meal.lng, result[i].attraction.lat, result[i].attraction.lng)
      const nextTravel = travelMinutes(nextDist)
      if (mealEnd + nextTravel > result[i].startMin + 20) continue
    }

    // ── Geographic detour calculation ──
    // How much extra distance does inserting the meal here add?
    const directDist = haversine(prevLat, prevLng, nextLat, nextLng)
    const mealToNext = haversine(meal.lat, meal.lng, nextLat, nextLng)
    const detourKm = Math.max(0, distToMeal + mealToNext - directDist)

    // ── Time deviation from ideal meal time ──
    const timeDeviation = Math.abs(startTime - slot.ideal)

    // ── Combined score: time + geography ──
    // 5 min penalty per km of detour → strongly prefer nearby meals
    const score = timeDeviation + detourKm * 5

    if (score < bestScore) {
      bestScore = score
      bestInsertIdx = i
      bestStartTime = startTime
    }
  }

  // Validate opening hours
  if (!isOpenDuring(meal, bestStartTime)) {
    const openSlot = findEarliestOpenSlot(meal, slot.earliest)
    if (openSlot !== -1 && openSlot <= slot.latest) {
      bestStartTime = openSlot
    }
  }

  result.splice(bestInsertIdx, 0, {
    attraction: meal,
    startMin: bestStartTime,
    endMin: bestStartTime + meal.duration,
    isAutoFilled,
    mealSlot: slot.type,
  })

  return result
}

/* ─────────────────── Auto-fill meals from AI data ─────────────────── */

/**
 * Find a suitable meal POI from the full AI dataset.
 * Picks the nearest food POI matching the desired meal type,
 * that hasn't already been used.
 */
function findAutoFillMeal(
  mealType: 'breakfast' | 'lunch' | 'dinner',
  nearLat: number,
  nearLng: number,
  cityId: string,
  usedIds: Set<string>,
  maxDistKm?: number,
): Attraction | null {
  const allPOIs = getAllAttractions(cityId)
  const candidates = allPOIs.filter(a => {
    if (a.type !== 'food') return false
    if (usedIds.has(a.id)) return false
    if (maxDistKm != null) {
      const dist = haversine(nearLat, nearLng, a.lat, a.lng)
      if (dist > maxDistKm) return false
    }
    const mt = a.mealType || inferMealType(a)
    // For lunch/dinner: accept matching type or generic
    if (mealType === 'breakfast') return mt === 'breakfast'
    if (mealType === 'lunch') return mt === 'lunch' || mt === 'snack'
    if (mealType === 'dinner') return mt === 'dinner' || mt === 'lunch'
    return false
  })

  if (candidates.length === 0) {
    // Fallback: any food POI not yet used (still respect maxDistKm)
    const fallback = allPOIs.filter(a => {
      if (a.type !== 'food') return false
      if (usedIds.has(a.id)) return false
      if (maxDistKm != null) {
        const dist = haversine(nearLat, nearLng, a.lat, a.lng)
        if (dist > maxDistKm) return false
      }
      return true
    })
    if (fallback.length === 0) return null
    // Pick nearest
    fallback.sort((a, b) =>
      haversine(nearLat, nearLng, a.lat, a.lng) - haversine(nearLat, nearLng, b.lat, b.lng)
    )
    return fallback[0]
  }

  // Sort by distance from the reference point (nearest first)
  candidates.sort((a, b) =>
    haversine(nearLat, nearLng, a.lat, a.lng) - haversine(nearLat, nearLng, b.lat, b.lng)
  )
  return candidates[0]
}

/* ─────────────────── Auto-fill attractions for empty time slots ─────────────────── */

/** Minimum gap (minutes) worth filling with a recommended POI */
const MIN_GAP_TO_FILL = 60

/** Target amount of scheduled time per day (minutes) before we stop filling */
const TARGET_DAY_FILL = 8 * 60 // 8 hours of activities is a healthy day

/**
 * Find a suitable non-food POI to fill a time gap.
 * Picks candidates that:
 *   1. Fit within the gap (duration + travel ≤ gap)
 *   2. Are geographically close to the reference point
 *   3. Have high seasonalIndex & rating
 *   4. Haven't been used yet
 *   5. Are open during the gap
 */
function findAutoFillAttraction(
  nearLat: number,
  nearLng: number,
  availableMinutes: number,
  gapStartMin: number,
  cityId: string,
  usedIds: Set<string>,
): Attraction | null {
  const allPOIs = getAllAttractions(cityId)
  const validTypes = ['scenic', 'activity', 'shopping']

  const candidates = allPOIs.filter(a => {
    if (!validTypes.includes(a.type)) return false
    if (usedIds.has(a.id)) return false
    // Duration must fit in the gap (with some travel buffer)
    if (a.duration > availableMinutes - 15) return false
    // Check if open during the gap
    const openSlot = findEarliestOpenSlot(a, gapStartMin)
    if (openSlot === -1) return false
    if (openSlot + a.duration > gapStartMin + availableMinutes) return false
    return true
  })

  if (candidates.length === 0) return null

  // Score: higher is better
  // Combine proximity, seasonal index, and rating
  const scored = candidates.map(a => {
    const dist = haversine(nearLat, nearLng, a.lat, a.lng)
    const travelTime = travelMinutes(dist)
    // Penalise far POIs, reward high season score + rating
    const proximityScore = Math.max(0, 1 - dist / 10) // 10km → 0
    const seasonScore = (a.seasonalIndex || 3) / 5     // 0-1
    const ratingScore = (a.rating || 3) / 5             // 0-1
    const fitScore = a.duration <= availableMinutes - travelTime ? 1 : 0
    const score = fitScore * (proximityScore * 0.5 + seasonScore * 0.25 + ratingScore * 0.25)
    return { attraction: a, score, dist, travelTime }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.score > 0 ? scored[0].attraction : null
}

/**
 * Detect free time gaps in a schedule and fill them with recommended POIs.
 * Returns the augmented schedule with auto-filled items marked.
 */
function autoFillGaps(
  schedule: ScheduledPOI[],
  cityId: string,
  usedIds: Set<string>,
  startLat: number,
  startLng: number,
): ScheduledPOI[] {
  // Calculate total scheduled activity time
  const totalScheduled = schedule.reduce((sum, s) => sum + (s.endMin - s.startMin), 0)
  if (totalScheduled >= TARGET_DAY_FILL) return schedule // Day is full enough

  let result = [...schedule]
  let filled = totalScheduled
  const maxAttempts = 6 // Safety: don't add more than 6 POIs per day

  for (let attempt = 0; attempt < maxAttempts && filled < TARGET_DAY_FILL; attempt++) {
    // Re-sort to find gaps
    result.sort((a, b) => a.startMin - b.startMin)

    // Collect all gaps
    const gaps: { start: number; end: number; refLat: number; refLng: number }[] = []

    // Gap before first item
    if (result.length === 0) {
      gaps.push({
        start: DAY_START, end: DAY_END,
        refLat: startLat, refLng: startLng,
      })
    } else {
      if (result[0].startMin - DAY_START >= MIN_GAP_TO_FILL) {
        gaps.push({
          start: DAY_START,
          end: result[0].startMin,
          refLat: result[0].attraction.lat,
          refLng: result[0].attraction.lng,
        })
      }
      // Gaps between items
      for (let i = 0; i < result.length - 1; i++) {
        const gapStart = result[i].endMin
        const gapEnd = result[i + 1].startMin
        if (gapEnd - gapStart >= MIN_GAP_TO_FILL) {
          gaps.push({
            start: gapStart,
            end: gapEnd,
            refLat: result[i].attraction.lat,
            refLng: result[i].attraction.lng,
          })
        }
      }
      // Gap after last item
      const lastEnd = result[result.length - 1].endMin
      if (DAY_END - lastEnd >= MIN_GAP_TO_FILL) {
        gaps.push({
          start: lastEnd,
          end: DAY_END,
          refLat: result[result.length - 1].attraction.lat,
          refLng: result[result.length - 1].attraction.lng,
        })
      }
    }

    if (gaps.length === 0) break

    // Pick the largest gap first
    gaps.sort((a, b) => (b.end - b.start) - (a.end - a.start))
    const gap = gaps[0]
    const gapDuration = gap.end - gap.start

    const poi = findAutoFillAttraction(
      gap.refLat, gap.refLng,
      gapDuration,
      gap.start,
      cityId, usedIds,
    )

    if (!poi) break // No more suitable POIs

    usedIds.add(poi.id)
    const dist = haversine(gap.refLat, gap.refLng, poi.lat, poi.lng)
    const travel = travelMinutes(dist)
    const poiStart = gap.start + travel
    const openSlot = findEarliestOpenSlot(poi, poiStart)
    const actualStart = openSlot !== -1 ? openSlot : poiStart

    result.push({
      attraction: poi,
      startMin: actualStart,
      endMin: actualStart + poi.duration,
      isAutoFilled: true,
    })
    filled += poi.duration
  }

  result.sort((a, b) => a.startMin - b.startMin)
  return result
}

/* ─────────────────── Resolve overlaps ─────────────────── */

function resolveOverlaps(schedule: ScheduledPOI[]): ScheduledPOI[] {
  if (schedule.length <= 1) return schedule
  const resolved: ScheduledPOI[] = [schedule[0]]

  for (let i = 1; i < schedule.length; i++) {
    const prev = resolved[resolved.length - 1]
    const cur = schedule[i]
    const dist = haversine(
      prev.attraction.lat, prev.attraction.lng,
      cur.attraction.lat, cur.attraction.lng,
    )
    const travel = travelMinutes(dist)
    const earliestStart = prev.endMin + travel

    if (cur.startMin < earliestStart) {
      const newStart = findEarliestOpenSlot(cur.attraction, earliestStart)
      if (newStart !== -1 && newStart + cur.attraction.duration <= DAY_END) {
        resolved.push({
          ...cur,
          startMin: newStart,
          endMin: newStart + cur.attraction.duration,
        })
      }
      // else skip – can't fit
    } else {
      resolved.push(cur)
    }
  }
  return resolved
}

/* ─────────────────── Main planner ─────────────────── */

export interface PlanResult {
  dayItems: ItineraryItem[][]
  /** POIs selected by user but could not be scheduled (time/space constraints) */
  skippedPOIs?: Attraction[]
}

/**
 * Main entry: generate a complete multi-day itinerary.
 *
 * Algorithm:
 *   1. Classify user-selected POIs into food (by meal) and non-food
 *   2. Distribute non-food POIs across days using geographic clustering
 *   3. For each day:
 *      a. Determine start hotel (prev day's hotel) and end hotel (today's hotel)
 *      b. Route non-food POIs with anti-backtracking greedy + 2-opt
 *      c. Build time schedule respecting opening hours
 *      d. Insert user-selected meals at proper time slots
 *      e. Auto-fill missing lunch/dinner from AI recommendations
 *   4. Return ItineraryItem[][] ready for dispatch
 */
export function generateItinerary(
  trip: Trip,
  selectedAttractions: Attraction[],
  allPois?: Attraction[],
  mustVisitIds?: Set<string>,
): PlanResult {
  // 注入全量 POI 数据，用于自动填充三餐和空档
  if (allPois && allPois.length > 0) _injectedAllPOIs = allPois
  const days = trip.days
  const cityId = trip.cityId
  const numDays = days.length
  if (numDays === 0 || selectedAttractions.length === 0) {
    return { dayItems: days.map(() => []) }
  }

  // ───── 1. Classify POIs ─────
  const classified = classifyPOIs(selectedAttractions)

  // ───── 2. Distribute non-food POIs across days (centroid clustering) ─────
  // Use hotel locations as initial cluster centers, then assign POIs
  // to the nearest day's cluster to keep each day geographically compact.

  const poisPerDay: Attraction[][] = Array.from({ length: numDays }, () => [])

  // Full-day activities first (duration >= 360 min) — one per day
  const fullDayPOIs: Attraction[] = []
  const regularPOIs: Attraction[] = []
  for (const poi of classified.nonFood) {
    if (poi.duration >= 360) fullDayPOIs.push(poi)
    else regularPOIs.push(poi)
  }

  let fullDayIdx = 0
  for (const fdp of fullDayPOIs) {
    if (fullDayIdx < numDays) {
      poisPerDay[fullDayIdx].push(fdp)
      fullDayIdx++
    }
  }

  // Initialize cluster centroids based on hotel locations
  const centroids: { lat: number; lng: number }[] = []
  for (let d = 0; d < numDays; d++) {
    const hotel = days[d].hotel
    if (hotel?.lat && hotel?.lng) {
      centroids.push({ lat: hotel.lat, lng: hotel.lng })
    } else if (classified.nonFood.length > 0) {
      // Fallback: spread centroids evenly across POI range
      const allLats = classified.nonFood.map(p => p.lat)
      const allLngs = classified.nonFood.map(p => p.lng)
      const minLat = Math.min(...allLats), maxLat = Math.max(...allLats)
      const minLng = Math.min(...allLngs), maxLng = Math.max(...allLngs)
      const t = numDays > 1 ? d / (numDays - 1) : 0.5
      centroids.push({
        lat: minLat + t * (maxLat - minLat),
        lng: minLng + t * (maxLng - minLng),
      })
    } else {
      centroids.push({ lat: 0, lng: 0 })
    }
  }

  // Time budgets per day
  const dayTimeBudgets = poisPerDay.map(dayPois =>
    dayPois.reduce((sum, p) => sum + p.duration, 0)
  )
  const maxDayMinutes = (DAY_END - DAY_START) * 0.7

  // Sort regularPOIs by distance to nearest centroid (assign close ones first)
  // 必打卡 POI 优先分配，绝不被时间预算拖出包外
  const mustVisitPOIs = regularPOIs.filter(p => mustVisitIds?.has(p.id))
  const normalPOIs = regularPOIs.filter(p => !mustVisitIds?.has(p.id))

  function assignPOIsTodays(poiList: Attraction[], forceFit: boolean) {
    const poisWithDist = poiList.map(poi => ({
      poi,
      dists: centroids.map(c => haversine(poi.lat, poi.lng, c.lat, c.lng)),
    }))
    poisWithDist.sort((a, b) => Math.min(...a.dists) - Math.min(...b.dists))

    for (const { poi, dists } of poisWithDist) {
      const typePenalty = (dayIdx: number) => {
        const dayPois = poisPerDay[dayIdx]
        const sameTypeCount = dayPois.filter(p => p.type === poi.type).length
        return sameTypeCount * sameTypeCount * 10
      }

      let bestDay = -1
      let bestScore = Infinity

      for (let d = 0; d < numDays; d++) {
        if (forceFit || dayTimeBudgets[d] + poi.duration <= maxDayMinutes) {
          const score = dists[d] + typePenalty(d)
          if (score < bestScore) {
            bestScore = score
            bestDay = d
          }
        }
      }

      if (bestDay === -1) {
        // 所有天都超预算，分配到用时最少的天
        bestDay = dayTimeBudgets.indexOf(Math.min(...dayTimeBudgets))
      }

      poisPerDay[bestDay].push(poi)
      dayTimeBudgets[bestDay] += poi.duration + 30
    }
  }

  // 第一轮：必打卡 POI 优先分配（forceFit=true，绝不拖出包外）
  assignPOIsTodays(mustVisitPOIs, true)
  // 第二轮：普通 POI 按正常预算分配
  assignPOIsTodays(normalPOIs, false)

  // Update centroids based on assigned POIs (one refinement pass)
  for (let d = 0; d < numDays; d++) {
    if (poisPerDay[d].length > 0) {
      centroids[d] = {
        lat: poisPerDay[d].reduce((s, p) => s + p.lat, 0) / poisPerDay[d].length,
        lng: poisPerDay[d].reduce((s, p) => s + p.lng, 0) / poisPerDay[d].length,
      }
    }
  }

  // ───── 3. Distribute user-selected meals across days ─────
  const mealsByDay: {
    breakfast: Attraction | null
    lunch: Attraction | null
    dinner: Attraction | null
    snacks: Attraction[]
  }[] = Array.from({ length: numDays }, () => ({
    breakfast: null, lunch: null, dinner: null, snacks: [],
  }))

  const distributeMeals = (meals: Attraction[], key: 'breakfast' | 'lunch' | 'dinner') => {
    let dayIdx = 0
    for (const meal of meals) {
      let attempts = 0
      while (mealsByDay[dayIdx][key] !== null && attempts < numDays) {
        dayIdx = (dayIdx + 1) % numDays
        attempts++
      }
      if (mealsByDay[dayIdx][key] === null) {
        mealsByDay[dayIdx][key] = meal
      } else {
        // All days already have this meal type — skip the extra.
        // Previously this pushed the overflow meal into poisPerDay,
        // which caused it to appear as a regular POI AND a duplicate
        // meal on the same day (e.g. two lunches).
        console.warn(`[routePlanner] All ${numDays} days already have ${key}, skipping: ${meal.name}`)
      }
      dayIdx = (dayIdx + 1) % numDays
    }
  }

  distributeMeals(classified.breakfast, 'breakfast')
  distributeMeals(classified.lunch, 'lunch')
  distributeMeals(classified.dinner, 'dinner')

  // Distribute snacks with time gap constraint: no snack within 2 hours of a main meal
  for (let i = 0; i < classified.snack.length; i++) {
    const snack = classified.snack[i]
    // Find a day that doesn't have too many snacks yet (max 2 per day)
    const targetDay = i % numDays
    if (mealsByDay[targetDay].snacks.length < 2) {
      mealsByDay[targetDay].snacks.push(snack)
    } else {
      // Try to find another day with fewer snacks
      let placed = false
      for (let d = 0; d < numDays; d++) {
        if (mealsByDay[d].snacks.length < 2) {
          mealsByDay[d].snacks.push(snack)
          placed = true
          break
        }
      }
      if (!placed) {
        console.warn(`[routePlanner] Too many snacks, skipping: ${snack.name}`)
      }
    }
  }

  // Track all used POI IDs (to avoid duplicating in auto-fill)
  const usedIds = new Set(selectedAttractions.map(a => a.id))

  // ───── 4. Build each day's schedule ─────
  const dayItems: ItineraryItem[][] = []

  for (let d = 0; d < numDays; d++) {
    const day = days[d]

    // Start point: previous day's hotel → today's departure
    // End point: today's hotel → tonight's destination
    // Day 0: no "previous" hotel, use today's hotel if available (or first POI as fallback)
    const startHotel: HotelPOI | null | undefined = d > 0 ? days[d - 1].hotel : null
    const endHotel: HotelPOI | null | undefined = day.hotel

    const startLat = startHotel?.lat ?? endHotel?.lat ?? selectedAttractions[0]?.lat ?? 0
    const startLng = startHotel?.lng ?? endHotel?.lng ?? selectedAttractions[0]?.lng ?? 0
    const endLat = endHotel?.lat ?? null
    const endLng = endHotel?.lng ?? null

    // 4a. Route non-food POIs with anti-backtracking greedy
    // Defensive: filter out any food items that may have leaked into poisPerDay
    const nonFoodPOIs = poisPerDay[d].filter(p => p.type !== 'food')
    let routedPOIs = greedyRouteWithDirection(
      nonFoodPOIs, startLat, startLng, endLat, endLng,
    )

    // 4b. 2-opt improvement (with end hotel as destination)
    routedPOIs = twoOptImprove(routedPOIs, startLat, startLng, endLat, endLng)

    // 4c. Build time schedule
    let schedule: ScheduledPOI[] = []
    let curTime = DAY_START
    let curLat = startLat
    let curLng = startLng

    for (const poi of routedPOIs) {
      const dist = haversine(curLat, curLng, poi.lat, poi.lng)
      const travel = travelMinutes(dist)
      const arriveAt = curTime + travel
      const startTime = findEarliestOpenSlot(poi, arriveAt)
      if (startTime === -1) continue

      schedule.push({
        attraction: poi,
        startMin: startTime,
        endMin: startTime + poi.duration,
      })
      curTime = startTime + poi.duration
      curLat = poi.lat
      curLng = poi.lng
    }

    // 4d. Insert user-selected meals at appropriate time slots
    // New v3 signature: pass both start and end hotel coordinates for geo-aware placement
    const meals = mealsByDay[d]

    if (meals.lunch) {
      schedule = insertMealIntoSchedule(
        schedule, meals.lunch, MEAL_SLOTS[1], startLat, startLng, endLat, endLng, false,
      )
    }
    if (meals.dinner) {
      schedule = insertMealIntoSchedule(
        schedule, meals.dinner, MEAL_SLOTS[2], startLat, startLng, endLat, endLng, false,
      )
    }
    if (meals.breakfast) {
      schedule = insertMealIntoSchedule(
        schedule, meals.breakfast, MEAL_SLOTS[0], startLat, startLng, endLat, endLng, false,
      )
    }

    // 4e. Auto-fill missing breakfast, lunch and dinner from AI recommendations
    if (cityId) {
      const hasBreakfast = schedule.some(s => s.mealSlot === 'breakfast')
      const hasLunch = schedule.some(s => s.mealSlot === 'lunch')
      const hasDinner = schedule.some(s => s.mealSlot === 'dinner')

      // Auto-fill breakfast: search near hotel (departure point)
      if (!hasBreakfast) {
        const bfRefLat = startLat
        const bfRefLng = startLng
        // If there's a first non-food POI, use midpoint of hotel and first POI
        const firstNonFood = schedule.find(s => s.attraction.type !== 'food')
        const refLat = firstNonFood
          ? (bfRefLat + firstNonFood.attraction.lat) / 2
          : bfRefLat
        const refLng = firstNonFood
          ? (bfRefLng + firstNonFood.attraction.lng) / 2
          : bfRefLng

        // Breakfast: restrict to 3km from hotel to avoid long detours for morning meal
        const bfPOI = findAutoFillMeal('breakfast', refLat, refLng, cityId, usedIds, 3)
        if (bfPOI) {
          usedIds.add(bfPOI.id)
          schedule = insertMealIntoSchedule(
            schedule, bfPOI, MEAL_SLOTS[0], startLat, startLng, endLat, endLng, true,
          )
        }
      }

      if (!hasLunch) {
        // Find the center of mid-day activities for proximity
        const midDayPOIs = schedule.filter(s => s.startMin >= 10 * 60 && s.startMin <= 14 * 60)
        const refLat = midDayPOIs.length > 0
          ? midDayPOIs.reduce((s, p) => s + p.attraction.lat, 0) / midDayPOIs.length
          : startLat
        const refLng = midDayPOIs.length > 0
          ? midDayPOIs.reduce((s, p) => s + p.attraction.lng, 0) / midDayPOIs.length
          : startLng

        const lunchPOI = findAutoFillMeal('lunch', refLat, refLng, cityId, usedIds)
        if (lunchPOI) {
          usedIds.add(lunchPOI.id)
          schedule = insertMealIntoSchedule(
            schedule, lunchPOI, MEAL_SLOTS[1], startLat, startLng, endLat, endLng, true,
          )
        }
      }

      if (!hasDinner) {
        // Dinner: search near the last scheduled POI or end hotel
        const sortedSchedule = [...schedule].sort((a, b) => b.startMin - a.startMin)
        const lastPOI = sortedSchedule.find(s => s.attraction.type !== 'food')
        const refLat = lastPOI
          ? lastPOI.attraction.lat
          : endLat ?? startLat
        const refLng = lastPOI
          ? lastPOI.attraction.lng
          : endLng ?? startLng

        let dinnerPOI = findAutoFillMeal('dinner', refLat, refLng, cityId, usedIds)
        // If no dinner found nearby, try searching near the hotel as fallback
        if (!dinnerPOI) {
          dinnerPOI = findAutoFillMeal('dinner', endLat ?? startLat, endLng ?? startLng, cityId, usedIds)
        }
        if (dinnerPOI) {
          usedIds.add(dinnerPOI.id)
          schedule = insertMealIntoSchedule(
            schedule, dinnerPOI, MEAL_SLOTS[2], startLat, startLng, endLat, endLng, true,
          )
        }
      }
    }

    // Insert snacks in schedule gaps with time constraints:
    // - No snack within 90 minutes after a main meal (breakfast/lunch/dinner)
    // - Snack should be at least 2 hours before the next main meal
    for (const snack of meals.snacks) {
      let inserted = false
      for (let i = 0; i < schedule.length - 1; i++) {
        const gapStart = schedule[i].endMin
        const gapEnd = schedule[i + 1].startMin
        
        // Check if previous item is a main meal — enforce 90-minute gap
        const prevIsMeal = schedule[i].mealSlot && ['breakfast', 'lunch', 'dinner'].includes(schedule[i].mealSlot as string)
        const minGapAfterMeal = prevIsMeal ? 90 : 10
        
        // Check if next item is a main meal — enforce 2-hour gap before it
        const nextIsMeal = schedule[i + 1].mealSlot && ['breakfast', 'lunch', 'dinner'].includes(schedule[i + 1].mealSlot as string)
        const minGapBeforeMeal = nextIsMeal ? 120 : 10
        
        const requiredGap = minGapAfterMeal + minGapBeforeMeal + snack.duration
        if (gapEnd - gapStart >= requiredGap) {
          const snackStart = gapStart + minGapAfterMeal
          if (isOpenDuring(snack, snackStart) || !snack.openTime) {
            schedule.splice(i + 1, 0, {
              attraction: snack,
              startMin: snackStart,
              endMin: snackStart + snack.duration,
              mealSlot: 'snack',
            })
            inserted = true
            break
          }
        }
      }
      if (!inserted && schedule.length > 0) {
        const lastEnd = schedule[schedule.length - 1].endMin
        const lastItem = schedule[schedule.length - 1]
        const lastIsMeal = lastItem.mealSlot && ['breakfast', 'lunch', 'dinner'].includes(lastItem.mealSlot)
        const minGapAfterLast = lastIsMeal ? 90 : 10
        
        const snackStart = lastEnd + minGapAfterLast
        if (snackStart + snack.duration <= DAY_END) {
          schedule.push({
            attraction: snack,
            startMin: snackStart,
            endMin: snackStart + snack.duration,
            mealSlot: 'snack',
          })
        }
      }
    }

    // 4f. Auto-fill empty time gaps with recommended non-food POIs
    if (cityId) {
      schedule = autoFillGaps(schedule, cityId, usedIds, startLat, startLng)
    }

    // 4g. Re-sort and resolve overlaps
    schedule.sort((a, b) => a.startMin - b.startMin)
    schedule = resolveOverlaps(schedule)

    // 4g. Convert to ItineraryItem[]
    const items: ItineraryItem[] = schedule.map((sp, idx) => ({
      id: `auto-${d}-${idx}-${sp.attraction.id}`,
      attractionId: sp.attraction.id,
      startTime: minToTime(sp.startMin),
      endTime: minToTime(sp.endMin),
      notes: '',
      cost: sp.attraction.cost,
      type: sp.attraction.type,
      isAutoFilled: sp.isAutoFilled || false,
      mealSlot: sp.mealSlot,
    }))

    dayItems.push(items)
  }

  // Determine which user-selected POIs could not be scheduled
  const usedAttractionIds = new Set(dayItems.flatMap(items => items.map(i => i.attractionId)))
  const skippedPOIs = selectedAttractions.filter(a => !usedAttractionIds.has(a.id))

  return { dayItems, skippedPOIs }
}

/* ─────────────────── One-click day optimization ─────────────────── */

/**
 * Re-optimize a single day's route.
 * Keeps the same POIs but reorders them optimally,
 * recalculates times, and re-fills missing meals.
 */
export function optimizeDayRoute(
  currentItems: ItineraryItem[],
  allAttractions: Attraction[],
  startHotel: HotelPOI | null,
  endHotel: HotelPOI | null,
  cityId: string,
): ItineraryItem[] {
  if (currentItems.length === 0) return []

  const attrMap = new Map<string, Attraction>()
  for (const a of allAttractions) attrMap.set(a.id, a)

  // Separate food and non-food items
  const foodItems: { item: ItineraryItem; attraction: Attraction }[] = []
  const nonFoodItems: Attraction[] = []

  for (const item of currentItems) {
    const a = attrMap.get(item.attractionId)
    if (!a) continue
    if (a.type === 'food') {
      foodItems.push({ item, attraction: a })
    } else {
      nonFoodItems.push(a)
    }
  }

  const startLat = startHotel?.lat ?? (nonFoodItems[0]?.lat ?? 0)
  const startLng = startHotel?.lng ?? (nonFoodItems[0]?.lng ?? 0)
  const endLat = endHotel?.lat ?? null
  const endLng = endHotel?.lng ?? null

  // Route non-food POIs with anti-backtracking greedy + 2-opt
  let routed = greedyRouteWithDirection(nonFoodItems, startLat, startLng, endLat, endLng)
  routed = twoOptImprove(routed, startLat, startLng, endLat, endLng)

  // Build schedule
  let schedule: ScheduledPOI[] = []
  let curTime = DAY_START
  let curLat = startLat
  let curLng = startLng

  for (const poi of routed) {
    const dist = haversine(curLat, curLng, poi.lat, poi.lng)
    const travel = travelMinutes(dist)
    const arriveAt = curTime + travel
    const startTime = findEarliestOpenSlot(poi, arriveAt)
    if (startTime === -1) continue

    schedule.push({
      attraction: poi,
      startMin: startTime,
      endMin: startTime + poi.duration,
    })
    curTime = startTime + poi.duration
    curLat = poi.lat
    curLng = poi.lng
  }

  // Re-insert food items at proper meal slots
  for (const { item, attraction } of foodItems) {
    const mealSlot = item.mealSlot || inferMealType(attraction) || 'lunch'
    const slotDef = MEAL_SLOTS.find(s => s.type === mealSlot) || MEAL_SLOTS[1]
    schedule = insertMealIntoSchedule(
      schedule, attraction, slotDef, startLat, startLng, endLat, endLng, item.isAutoFilled || false,
    )
  }

  // Re-sort and resolve overlaps
  schedule.sort((a, b) => a.startMin - b.startMin)
  schedule = resolveOverlaps(schedule)

  return schedule.map((sp, idx) => ({
    id: `opt-${Date.now()}-${idx}-${sp.attraction.id}`,
    attractionId: sp.attraction.id,
    startTime: minToTime(sp.startMin),
    endTime: minToTime(sp.endMin),
    notes: currentItems.find(i => i.attractionId === sp.attraction.id)?.notes || '',
    cost: sp.attraction.cost,
    type: sp.attraction.type,
    isAutoFilled: sp.isAutoFilled || false,
    mealSlot: sp.mealSlot,
  }))
}
