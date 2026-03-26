import { useApp } from '@/context/AppContext'
import { popularCities } from '@/data/mock-data'
import { Wallet, TrendingUp, Utensils, Camera, Hotel, ShoppingBag, Ticket, Car } from 'lucide-react'

export default function BudgetPanel() {
  const { state, dispatch } = useApp()
  const trip = state.currentTrip
  if (!trip) return null

  const city = popularCities.find((c) => c.id === trip.cityId)

  // Calculate budget breakdown by type
  const breakdown = trip.days.reduce(
    (acc, day) => {
      day.items.forEach((item) => {
        if (!acc[item.type]) acc[item.type] = 0
        acc[item.type] += item.cost
      })
      return acc
    },
    {} as Record<string, number>
  )

  const totalCost = trip.totalBudget
  const dayCount = trip.days.length
  const avgPerDay = dayCount > 0 ? Math.round(totalCost / dayCount) : 0
  const estimatedTotal = city ? city.avgDailyBudget * dayCount : 0

  const categories = [
    { key: 'scenic', label: '景点门票', icon: Camera, color: 'text-primary' },
    { key: 'food', label: '餐饮美食', icon: Utensils, color: 'text-accent' },
    { key: 'hotel', label: '住宿', icon: Hotel, color: 'text-purple-500' },
    { key: 'activity', label: '体验活动', icon: Ticket, color: 'text-primary' },
    { key: 'shopping', label: '购物', icon: ShoppingBag, color: 'text-ocean' },
    { key: 'transport', label: '交通', icon: Car, color: 'text-muted-foreground' },
  ]

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-coral-light">
          <Wallet className="h-4 w-4 text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">预算概览</h3>
      </div>

      {/* Total */}
      <div className="mb-4 rounded-xl gradient-warm p-4">
        <p className="mb-1 text-xs text-muted-foreground">已规划总费用</p>
        <p className="text-2xl font-bold text-foreground">¥{totalCost.toLocaleString()}</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <TrendingUp className="h-3 w-3" />
          <span>日均 ¥{avgPerDay.toLocaleString()}</span>
          {city && (
            <>
              <span>·</span>
              <span>参考 ¥{city.avgDailyBudget}/天</span>
            </>
          )}
        </div>
      </div>

      {/* Budget bar */}
      {estimatedTotal > 0 && (
        <div className="mb-5">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">预算使用</span>
            <span className="font-medium text-foreground">
              {Math.round((totalCost / estimatedTotal) * 100)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full gradient-hero transition-all duration-500"
              style={{
                width: `${Math.min(100, (totalCost / estimatedTotal) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            参考预算 ¥{estimatedTotal.toLocaleString()} ({dayCount}天 × ¥{city?.avgDailyBudget.toLocaleString()}/天)
          </p>
        </div>
      )}

      {/* Breakdown */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">费用分类</p>
        {categories.map(({ key, label, icon: Icon, color }) => {
          const amount = breakdown[key] || 0
          if (amount === 0 && !['scenic', 'food', 'hotel'].includes(key)) return null
          return (
            <div key={key} className="flex items-center justify-between rounded-lg p-2 hover:bg-secondary/50 transition-smooth">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-xs text-foreground">{label}</span>
              </div>
              <span className="text-xs font-semibold text-foreground">
                ¥{amount.toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>

      {/* Daily breakdown */}
      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">每日花费</p>
        <div className="space-y-1.5">
          {trip.days.map((day, idx) => {
            const dayCost = day.items.reduce((s, i) => s + i.cost, 0)
            return (
              <div
                key={day.id}
                className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-smooth cursor-pointer ${
                  idx === state.selectedDayIndex
                    ? 'bg-coral-light text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-secondary/50'
                }`}
                onClick={() => dispatch({ type: 'SELECT_DAY', payload: idx })}
              >
                <span>第 {day.dayNumber} 天</span>
                <div className="flex items-center gap-2">
                  <span>{day.items.length} 项活动</span>
                  <span className="font-semibold text-foreground">¥{dayCost}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}