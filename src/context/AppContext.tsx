import React, { createContext, useContext, useReducer, ReactNode } from 'react'
import { Trip, DayPlan, ItineraryItem, AppView, HotelPOI, Attraction } from '@/types'

interface AppState {
  currentView: AppView
  /** Tracks the previous view for smart back-navigation from detail pages */
  previousView: AppView | null
  currentTrip: Trip | null
  selectedDayIndex: number
  showAttractionPanel: boolean
  selectedPlaceIds: string[]
  /** For POI detail view */
  detailAttractionId: string | null
  /** City ID pre-selected from homepage (consumed by CreateTripPage) */
  preSelectedCityId: string | null
  /** For hotel detail view – stores the hotel JSON */
  detailHotelData: string | null
  /** Server-side trip ID (set when loaded from or saved to server) */
  savedTripId: string | null
  /** POIs selected by user but not scheduled in the itinerary */
  skippedPOIs: Attraction[]
}

type Action =
  | { type: 'SET_VIEW'; payload: AppView }
  | { type: 'CREATE_TRIP'; payload: Trip }
  | { type: 'SELECT_DAY'; payload: number }
  | { type: 'ADD_ITEM'; payload: { dayIndex: number; item: ItineraryItem } }
  | { type: 'REMOVE_ITEM'; payload: { dayIndex: number; itemId: string } }
  | { type: 'REORDER_ITEMS'; payload: { dayIndex: number; items: ItineraryItem[] } }
  | { type: 'UPDATE_ITEM'; payload: { dayIndex: number; item: ItineraryItem } }
  | { type: 'UPDATE_DAY_NOTES'; payload: { dayIndex: number; notes: string } }
  | { type: 'SET_DAY_HOTEL'; payload: { dayIndex: number; hotel: HotelPOI | null } }
  | { type: 'SET_DAYS_HOTEL'; payload: { dayIndices: number[]; hotel: HotelPOI | null } }
  | { type: 'TOGGLE_PLACE'; payload: string }
  | { type: 'SET_ALL_DAYS_ITEMS'; payload: { dayItems: ItineraryItem[][]; skippedPOIs?: Attraction[] } }
  | { type: 'VIEW_DETAIL'; payload: string }
  | { type: 'VIEW_HOTEL_DETAIL'; payload: string }
  | { type: 'GO_BACK'; fallback?: AppView }
  | { type: 'TOGGLE_ATTRACTION_PANEL' }
  | { type: 'PRE_SELECT_CITY'; payload: string | null }
  | { type: 'SET_SAVED_TRIP_ID'; payload: string | null }
  | { type: 'RESET' }

const initialState: AppState = {
  currentView: 'home',
  previousView: null,
  currentTrip: null,
  selectedDayIndex: 0,
  showAttractionPanel: true,
  selectedPlaceIds: [],
  detailAttractionId: null,
  preSelectedCityId: null,
  detailHotelData: null,
  savedTripId: null,
  skippedPOIs: [],
}

function generateDays(startDate: string, endDate: string): DayPlan[] {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const days: DayPlan[] = []
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

function recalcBudget(days: DayPlan[]): number {
  return days.reduce((total, day) => {
    return total + day.items.reduce((dayTotal, item) => dayTotal + item.cost, 0)
  }, 0)
}

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, previousView: state.currentView, currentView: action.payload }

    case 'CREATE_TRIP': {
      const trip = action.payload
      const hasExistingDays = Array.isArray(trip.days) && trip.days.length > 0 && trip.days.some((d: DayPlan) => d.items?.length > 0 || d.hotel)
      if (!hasExistingDays) {
        trip.days = generateDays(trip.startDate, trip.endDate)
      }
      return { ...state, currentTrip: trip, currentView: hasExistingDays ? state.currentView : 'hotel-step', selectedDayIndex: 0, selectedPlaceIds: [], skippedPOIs: [] }
    }

    case 'SELECT_DAY':
      return { ...state, selectedDayIndex: action.payload }

    case 'ADD_ITEM': {
      if (!state.currentTrip) return state
      const newDays = [...state.currentTrip.days]
      const day = { ...newDays[action.payload.dayIndex] }
      day.items = [...day.items, action.payload.item]
      newDays[action.payload.dayIndex] = day
      return {
        ...state,
        currentTrip: { ...state.currentTrip, days: newDays, totalBudget: recalcBudget(newDays) },
      }
    }

    case 'REMOVE_ITEM': {
      if (!state.currentTrip) return state
      const newDays2 = [...state.currentTrip.days]
      const day2 = { ...newDays2[action.payload.dayIndex] }
      day2.items = day2.items.filter((i) => i.id !== action.payload.itemId)
      newDays2[action.payload.dayIndex] = day2
      return {
        ...state,
        currentTrip: { ...state.currentTrip, days: newDays2, totalBudget: recalcBudget(newDays2) },
      }
    }

    case 'REORDER_ITEMS': {
      if (!state.currentTrip) return state
      const newDays3 = [...state.currentTrip.days]
      newDays3[action.payload.dayIndex] = { ...newDays3[action.payload.dayIndex], items: action.payload.items }
      return { ...state, currentTrip: { ...state.currentTrip, days: newDays3 } }
    }

    case 'UPDATE_ITEM': {
      if (!state.currentTrip) return state
      const newDays4 = [...state.currentTrip.days]
      const day4 = { ...newDays4[action.payload.dayIndex] }
      day4.items = day4.items.map((i) => i.id === action.payload.item.id ? action.payload.item : i)
      newDays4[action.payload.dayIndex] = day4
      return {
        ...state,
        currentTrip: { ...state.currentTrip, days: newDays4, totalBudget: recalcBudget(newDays4) },
      }
    }

    case 'UPDATE_DAY_NOTES': {
      if (!state.currentTrip) return state
      const newDays5 = [...state.currentTrip.days]
      newDays5[action.payload.dayIndex] = { ...newDays5[action.payload.dayIndex], notes: action.payload.notes }
      return { ...state, currentTrip: { ...state.currentTrip, days: newDays5 } }
    }

    case 'SET_DAY_HOTEL': {
      if (!state.currentTrip) return state
      const newDays6 = [...state.currentTrip.days]
      newDays6[action.payload.dayIndex] = { ...newDays6[action.payload.dayIndex], hotel: action.payload.hotel }
      return { ...state, currentTrip: { ...state.currentTrip, days: newDays6 } }
    }

    case 'SET_DAYS_HOTEL': {
      if (!state.currentTrip) return state
      const newDays7 = [...state.currentTrip.days]
      for (const idx of action.payload.dayIndices) {
        newDays7[idx] = { ...newDays7[idx], hotel: action.payload.hotel }
      }
      return { ...state, currentTrip: { ...state.currentTrip, days: newDays7 } }
    }

    case 'TOGGLE_PLACE': {
      const id = action.payload
      const ids = state.selectedPlaceIds
      return {
        ...state,
        selectedPlaceIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
      }
    }

    case 'SET_ALL_DAYS_ITEMS': {
      if (!state.currentTrip) return state
      const newDaysAll = [...state.currentTrip.days]
      const { dayItems, skippedPOIs } = action.payload
      for (let i = 0; i < newDaysAll.length && i < dayItems.length; i++) {
        newDaysAll[i] = { ...newDaysAll[i], items: dayItems[i] }
      }
      return {
        ...state,
        currentTrip: { ...state.currentTrip, days: newDaysAll, totalBudget: recalcBudget(newDaysAll) },
        skippedPOIs: skippedPOIs || [],
      }
    }

    case 'TOGGLE_ATTRACTION_PANEL':
      return { ...state, showAttractionPanel: !state.showAttractionPanel }

    case 'VIEW_DETAIL':
      return { ...state, previousView: state.currentView, detailAttractionId: action.payload, currentView: 'detail' }

    case 'VIEW_HOTEL_DETAIL':
      return { ...state, previousView: state.currentView, detailHotelData: action.payload, currentView: 'hotel-detail' }

    case 'GO_BACK':
      return { ...state, previousView: null, currentView: state.previousView || action.fallback || 'home' }

    case 'PRE_SELECT_CITY':
      return { ...state, preSelectedCityId: action.payload }

    case 'SET_SAVED_TRIP_ID':
      return { ...state, savedTripId: action.payload }

    case 'RESET':
      return initialState

    default:
      return state
  }
}

const AppContext = createContext<{
  state: AppState
  dispatch: React.Dispatch<Action>
} | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within AppProvider')
  return context
}
