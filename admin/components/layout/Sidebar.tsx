import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'
import {
  LayoutDashboard,
  MapPin,
  Database,
  RefreshCw,
  Clock,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Activity,
} from 'lucide-react'

const navItems = [
  { to: '', icon: LayoutDashboard, label: '仪表盘', end: true },
  { to: 'cities', icon: MapPin, label: '城市管理' },
  { to: 'pois', icon: Database, label: 'POI 浏览' },
  { to: 'collection', icon: Activity, label: '采集情况' },
  { to: 'updates', icon: RefreshCw, label: '数据更新' },
  { to: 'pending', icon: Clock, label: '待确认更新' },
  { to: 'review', icon: ClipboardCheck, label: '审核发布' },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r bg-card transition-all duration-200',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b px-4">
        {!collapsed && (
          <span className="text-lg font-semibold text-foreground">POI Admin</span>
        )}
        {collapsed && (
          <span className="mx-auto text-lg font-bold text-primary">P</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                collapsed && 'justify-center px-2'
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Toggle */}
      <button
        onClick={onToggle}
        className="flex h-10 items-center justify-center border-t text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  )
}
