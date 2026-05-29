import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'

const BREADCRUMBS: Record<string, string> = {
  '': '仪表盘',
  cities: '城市管理',
  pois: 'POI 浏览',
  updates: '数据更新',
  review: '审核发布',
}

interface HeaderProps {
  onToggleSidebar: () => void
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)
  const pageName = segments.length === 0 ? '' : segments[0]
  const title = BREADCRUMBS[pageName] || pageName

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
      <button
        onClick={onToggleSidebar}
        className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">POI Admin</span>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-foreground">{title}</span>
        {segments.length > 1 && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground">{segments.slice(1).join(' / ')}</span>
          </>
        )}
      </div>
    </header>
  )
}
