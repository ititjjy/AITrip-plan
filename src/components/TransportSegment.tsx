/**
 * TransportSegment – Shows transport info between two consecutive POI items
 */
import { estimateTransport, type TransportSegment as TSegment } from '@/utils/transport'
import { useMemo } from 'react'
import { Navigation, Clock, Coins } from 'lucide-react'

interface Props {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  cityId?: string
}

export default function TransportSegmentCard({ fromLat, fromLng, toLat, toLng, cityId }: Props) {
  const segment: TSegment = useMemo(
    () => estimateTransport(fromLat, fromLng, toLat, toLng, cityId),
    [fromLat, fromLng, toLat, toLng, cityId],
  )

  const modeColorClass = (() => {
    switch (segment.mode) {
      case 'walk': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'metro': return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'bus': return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'taxi': return 'bg-violet-50 text-violet-700 border-violet-200'
    }
  })()

  return (
    <div className="relative my-1 ml-[-20px] flex items-center gap-2 py-1">
      {/* Dashed connector line */}
      <div className="absolute left-[10px] top-0 bottom-0 w-0.5 border-l-2 border-dashed border-border" />

      {/* Transport badge */}
      <div className={`relative z-10 ml-[2px] flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium shadow-sm ${modeColorClass}`}>
        <span>{segment.modeEmoji}</span>
        <span>{segment.modeLabel}</span>
        <span className="mx-0.5 text-current/40">|</span>
        <Navigation className="h-2.5 w-2.5" />
        <span>{segment.distance}km</span>
        <span className="mx-0.5 text-current/40">|</span>
        <Clock className="h-2.5 w-2.5" />
        <span>{segment.duration}min</span>
        {segment.costEstimate > 0 && (
          <>
            <span className="mx-0.5 text-current/40">|</span>
            <Coins className="h-2.5 w-2.5" />
            <span>~¥{segment.costEstimate}</span>
          </>
        )}
      </div>
    </div>
  )
}
