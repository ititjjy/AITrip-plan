/**
 * AttractionDetailPage – Full-screen POI detail view
 */
import { useApp } from '@/context/AppContext'
import { cityAttractions, getAttractionTypeLabel, getAttractionTypeIcon, getAllAttractions } from '@/data/mock-data'
import { displayName } from '@/utils/poiName'
import { Button } from '@/components/ui/button'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { handleImgError } from '@/utils/imageProxy'
import {
  ArrowLeft, Star, Clock, MapPin, Coins, Tag, Sparkles,
  Calendar, ExternalLink, Flame
} from 'lucide-react'

const typeColors: Record<string, string> = {
  scenic: 'bg-orange-100 text-orange-700',
  food: 'bg-red-100 text-red-700',
  shopping: 'bg-violet-100 text-violet-700',
  activity: 'bg-cyan-100 text-cyan-700',
  transport: 'bg-slate-100 text-slate-700',
  hotel: 'bg-indigo-100 text-indigo-700',
}

export default function AttractionDetailPage() {
  const { state, dispatch } = useApp()
  const trip = state.currentTrip
  const attractionId = state.detailAttractionId

  // Find the attraction
  const allAttractions = trip ? (getAllAttractions(trip.cityId)) : []
  const attraction = allAttractions.find((a) => a.id === attractionId)

  if (!attraction) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">景点信息未找到</p>
          <Button variant="ghost" className="mt-4" onClick={() => dispatch({ type: 'GO_BACK', fallback: 'planner' })}>
            <ArrowLeft className="mr-1 h-4 w-4" /> 返回
          </Button>
        </div>
      </div>
    )
  }

  const markerIcon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width:32px;height:32px;border-radius:50%;
      background:hsl(var(--primary));color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;
      box-shadow:0 2px 8px rgba(0,0,0,.3);
      border:2px solid #fff;
    ">${getAttractionTypeIcon(attraction.type)}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${attraction.lat},${attraction.lng}`

  return (
    <div className="flex h-[100svh] flex-col bg-background">
      {/* Hero header */}
      <div className="relative h-56 sm:h-72 flex-shrink-0">
        <img
          src={attraction.image}
          alt={displayName(attraction)}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-3 left-3 z-10 h-9 w-9 rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/50 hover:text-white"
          onClick={() => dispatch({ type: 'GO_BACK', fallback: 'planner' })}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Title overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeColors[attraction.type] || 'bg-gray-100 text-gray-700'}`}>
              {getAttractionTypeIcon(attraction.type)} {getAttractionTypeLabel(attraction.type)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/90 px-2 py-0.5 text-xs font-medium text-amber-700">
              <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> {attraction.rating}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{displayName(attraction)}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6 space-y-5">

          {/* Recommend reason */}
          {attraction.recommendReason && (
            <div className="flex items-start gap-3 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/15 p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-primary mb-0.5">推荐理由</p>
                <p className="text-sm text-foreground leading-relaxed">{attraction.recommendReason}</p>
              </div>
            </div>
          )}

          {/* Seasonal play index */}
          {attraction.seasonalIndex != null && attraction.seasonalIndex > 0 && (
            <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/50 p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <Flame className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-800 mb-1">当季推荐游玩指数</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-amber-200/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                      style={{ width: `${(attraction.seasonalIndex / 5) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-amber-700">{attraction.seasonalIndex.toFixed(1)}/5</span>
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-2">景点介绍</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{attraction.description}</p>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2.5 rounded-xl bg-secondary/50 p-3">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">建议游玩</p>
                <p className="text-sm font-semibold text-foreground">
                  {attraction.duration >= 60
                    ? `${Math.floor(attraction.duration / 60)}h${attraction.duration % 60 > 0 ? ` ${attraction.duration % 60}min` : ''}`
                    : `${attraction.duration}min`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl bg-secondary/50 p-3">
              <Coins className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">参考费用</p>
                <p className="text-sm font-semibold text-foreground">
                  {attraction.cost > 0 ? `¥${attraction.cost}` : '免费'}
                </p>
              </div>
            </div>
            {(attraction.openTime && attraction.closeTime) && (
              <div className="flex items-center gap-2.5 rounded-xl bg-secondary/50 p-3 col-span-2">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground">营业时间</p>
                  <p className="text-sm font-semibold text-foreground">
                    {attraction.openTime} – {attraction.closeTime}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Address */}
          <div className="flex items-start gap-2.5">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] text-muted-foreground">地址</p>
              <p className="text-sm text-foreground">{attraction.address}</p>
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {attraction.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                <Tag className="h-2.5 w-2.5" /> {tag}
              </span>
            ))}
          </div>

          {/* Map */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-2">位置</h2>
            <div className="h-[200px] rounded-xl overflow-hidden border border-border">
              <MapContainer
                center={[attraction.lat, attraction.lng]}
                zoom={15}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
                  url="/api/tiles/{z}/{x}/{y}"
                  subdomains=""
                  maxZoom={20}
                />
                <Marker position={[attraction.lat, attraction.lng]} icon={markerIcon}>
                  <Popup>{displayName(attraction)}</Popup>
                </Marker>
              </MapContainer>
            </div>
          </div>

          {/* Google Maps link */}
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-3 text-sm font-medium text-foreground hover:bg-secondary transition-smooth"
          >
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            在 Google Maps 中查看
          </a>

          {/* Bottom padding */}
          <div className="h-4" />
        </div>
      </div>
    </div>
  )
}
