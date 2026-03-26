/**
 * ImageGrid — WeChat Moments style image grid
 * Supports 1-9 images with adaptive layouts
 */
import { useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  images: string[]
  /** Click to open full-screen viewer */
  clickable?: boolean
  /** Compact variant for inline display */
  compact?: boolean
}

export default function ImageGrid({ images, clickable = true, compact = false }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  if (!images.length) return null

  const count = images.length
  const gap = compact ? 'gap-[2px]' : 'gap-[3px]'
  const rounded = compact ? 'rounded-md' : 'rounded-lg'

  const handleClick = (i: number) => {
    if (clickable) setViewerIndex(i)
  }

  const ImgCell = ({ src, idx, className = '' }: { src: string; idx: number; className?: string }) => (
    <div
      onClick={() => handleClick(idx)}
      className={`relative overflow-hidden ${rounded} bg-secondary ${clickable ? 'cursor-pointer' : ''} ${className}`}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
      />
    </div>
  )

  // Layout based on count
  const renderGrid = () => {
    if (count === 1) {
      return (
        <div className={`${gap} max-w-[360px]`}>
          <ImgCell src={images[0]} idx={0} className={compact ? 'aspect-[4/3]' : 'aspect-[4/3] max-h-[280px]'} />
        </div>
      )
    }
    if (count === 2) {
      return (
        <div className={`grid grid-cols-2 ${gap} max-w-[360px]`}>
          {images.map((img, i) => <ImgCell key={i} src={img} idx={i} className="aspect-square" />)}
        </div>
      )
    }
    if (count === 3) {
      return (
        <div className={`grid grid-cols-3 ${gap} max-w-[360px]`}>
          {images.map((img, i) => <ImgCell key={i} src={img} idx={i} className="aspect-square" />)}
        </div>
      )
    }
    if (count === 4) {
      return (
        <div className={`grid grid-cols-2 ${gap} max-w-[280px]`}>
          {images.map((img, i) => <ImgCell key={i} src={img} idx={i} className="aspect-square" />)}
        </div>
      )
    }
    // 5-9: 3-column grid
    return (
      <div className={`grid grid-cols-3 ${gap} max-w-[360px]`}>
        {images.slice(0, 9).map((img, i) => <ImgCell key={i} src={img} idx={i} className="aspect-square" />)}
      </div>
    )
  }

  return (
    <>
      {renderGrid()}

      {/* Full-screen viewer */}
      {viewerIndex !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/90"
          onClick={() => setViewerIndex(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setViewerIndex(null) }}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-card/20 text-primary-foreground backdrop-blur-sm transition-smooth hover:bg-card/40"
          >
            <X className="h-5 w-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setViewerIndex((viewerIndex - 1 + count) % count) }}
                className="absolute left-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-card/20 text-primary-foreground backdrop-blur-sm transition-smooth hover:bg-card/40"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setViewerIndex((viewerIndex + 1) % count) }}
                className="absolute right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-card/20 text-primary-foreground backdrop-blur-sm transition-smooth hover:bg-card/40"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <img
            src={images[viewerIndex]}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
          />

          <div className="absolute bottom-6 text-sm text-primary-foreground/70">
            {viewerIndex + 1} / {count}
          </div>
        </div>
      )}
    </>
  )
}
