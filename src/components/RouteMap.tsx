import { displayNameShort } from '@/utils/poiName'
/**
 * RouteMap – Shows POI markers and route lines on a Leaflet map.
 * Used in both PlannerPage and OverviewPage.
 */
import { useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Attraction, ItineraryItem, HotelPOI } from '@/types'
import { getAttractions, getAllAttractions } from '@/data/mock-data'

/* ── Custom marker icons ── */
function createNumberIcon(num: number, color: string) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${color};color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;
      box-shadow:0 2px 6px rgba(0,0,0,.3);
      border:2px solid #fff;
    ">${num}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

const hotelIcon = L.divIcon({
  className: 'custom-marker',
  html: `<div style="
    width:30px;height:30px;border-radius:50%;
    background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;
    display:flex;align-items:center;justify-content:center;
    font-size:14px;font-weight:700;
    box-shadow:0 2px 8px rgba(99,102,241,.4);
    border:2px solid #fff;
  ">🏨</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})

/* ── Fly to bounds helper + invalidateSize fix ── */
function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap()
  useMemo(() => {
    // Fix: invalidate size first so tiles load in dynamically-sized containers
    setTimeout(() => {
      map.invalidateSize()
      if (bounds) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
      }
    }, 100)
  }, [bounds, map])
  return null
}

/* ── Props ── */
interface Props {
  items: ItineraryItem[]
  hotel?: HotelPOI | null
  cityId: string
  /** Callback when a marker is clicked */
  onMarkerClick?: (attractionId: string) => void
  /** Height CSS class – defaults to h-[300px] */
  className?: string
}

const typeColor: Record<string, string> = {
  scenic: '#f97316',
  food: '#ef4444',
  shopping: '#8b5cf6',
  activity: '#06b6d4',
  hotel: '#6366f1',
}

export default function RouteMap({ items, hotel, cityId, onMarkerClick, className = 'h-[300px]' }: Props) {
  const allAttractions = getAllAttractions(cityId)
  const lookup = useMemo(() => {
    const map = new Map<string, Attraction>()
    allAttractions.forEach((a) => map.set(a.id, a))
    return map
  }, [allAttractions])

  // Build ordered coords for polyline
  const coords: [number, number][] = useMemo(() => {
    const pts: [number, number][] = []
    if (hotel) pts.push([hotel.lat, hotel.lng])
    items.forEach((item) => {
      const a = lookup.get(item.attractionId)
      if (a) pts.push([a.lat, a.lng])
    })
    if (hotel && pts.length > 1) pts.push([hotel.lat, hotel.lng]) // return to hotel
    return pts
  }, [items, hotel, lookup])

  // Compute bounds
  const bounds = useMemo(() => {
    if (coords.length === 0) return null
    return L.latLngBounds(coords.map(([lat, lng]) => L.latLng(lat, lng)))
  }, [coords])

  const center: [number, number] = coords.length > 0 ? coords[0] : [35.6762, 139.6503]

  return (
    <div className={`relative rounded-xl overflow-hidden border border-border ${className}`}>
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />
        <FitBounds bounds={bounds} />

        {/* Hotel marker */}
        {hotel && (
          <Marker position={[hotel.lat, hotel.lng]} icon={hotelIcon}>
            <Popup>
              <div className="text-xs font-semibold">{hotel.name}</div>
              <div className="text-[10px] text-gray-500">酒店</div>
            </Popup>
          </Marker>
        )}

        {/* POI markers */}
        {items.map((item, idx) => {
          const a = lookup.get(item.attractionId)
          if (!a) return null
          const color = typeColor[a.type] || '#64748b'
          return (
            <Marker
              key={item.id}
              position={[a.lat, a.lng]}
              icon={createNumberIcon(idx + 1, color)}
              eventHandlers={{
                click: () => onMarkerClick?.(a.id),
              }}
            >
              <Popup>
                <div className="text-xs font-semibold">{displayNameShort(a)}</div>
                <div className="text-[10px] text-gray-500">{item.startTime} - {item.endTime}</div>
              </Popup>
            </Marker>
          )
        })}

        {/* Route polyline */}
        {coords.length >= 2 && (
          <Polyline
            positions={coords}
            pathOptions={{
              color: 'hsl(var(--primary))',
              weight: 3,
              opacity: 0.6,
              dashArray: '8 6',
            }}
          />
        )}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 z-[400] flex items-center gap-2 rounded-lg bg-card/90 backdrop-blur-sm px-2.5 py-1.5 text-[10px] shadow-sm border border-border">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: '#f97316' }} />景点</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: '#ef4444' }} />美食</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: '#8b5cf6' }} />购物</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: '#06b6d4' }} />体验</span>
      </div>
    </div>
  )
}
