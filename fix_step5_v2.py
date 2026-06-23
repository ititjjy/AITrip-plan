#!/usr/bin/env python3
"""
修改 create-trip/index.tsx 实现步骤5三态逻辑：
1. 新增状态变量（pendingSkippedPOIs, showSkipConfirm, pendingTripResult）
2. 改造 doGenerateRoute：生成后若有 skipped POI 则暂停等确认
3. 改造步骤5 JSX：生成中/溢出确认/无溢出直接跳转
"""
import re

filepath = "/Users/eleme/行程规划 demo/miniprogram/src/pages/create-trip/index.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# ─── 1. 在状态变量区新增3个变量（trip 定义后插入）───
old_state = """  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [trip, setTrip] = useState<Trip | null>(null)
  // ── 酒店选择增强状态 ──"""

new_state = """  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [trip, setTrip] = useState<Trip | null>(null)
  // ── 步骤5：POI 溢出确认状态 ──
  const [pendingSkippedPOIs, setPendingSkippedPOIs] = useState<Attraction[]>([])
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [pendingTripResult, setPendingTripResult] = useState<{ newTrip: Trip; skipped: Attraction[] } | null>(null)
  // ── 酒店选择增强状态 ──"""

if old_state not in content:
    print("ERROR: state block not found")
    exit(1)
content = content.replace(old_state, new_state, 1)
print("✓ Step 1: state variables added")

# ─── 2. 改造 doGenerateRoute ───
old_generate = """  const doGenerateRoute = () => {
    if (!trip || selectedPoiIds.size === 0) return
    setGenerating(true)
    setTimeout(() => {
      try {
        const selected = pois.filter(p => selectedPoiIds.has(p.id))
        const result = generateItinerary(trip, selected)
        const newTrip = {
          ...trip,
          days: trip.days.map((day, i) => ({ ...day, items: result.dayItems[i] || [] })),
          totalBudget: result.dayItems.flat().reduce((s, item) => s + item.cost, 0),
        }
        setTrip(newTrip)
        setState({ currentTrip: newTrip, skippedPOIs: result.skippedPOIs || [] })
        setGenerating(false)
        // 生成完成后自动跳转到预览页（步骤6）
        setTimeout(() => setStep(6), 600)
      } catch (err) {
        Taro.showToast({ title: '路线生成失败', icon: 'none' })
        setGenerating(false)
      }
    }, 100)
  }"""

new_generate = """  const doGenerateRoute = (overrideIds?: Set<string>) => {
    const idsToUse = overrideIds || selectedPoiIds
    if (!trip || idsToUse.size === 0) return
    setGenerating(true)
    setShowSkipConfirm(false)
    setTimeout(() => {
      try {
        const selected = pois.filter(p => idsToUse.has(p.id))
        const result = generateItinerary(trip, selected)
        const skipped = result.skippedPOIs || []
        const newTrip = {
          ...trip,
          days: trip.days.map((day, i) => ({ ...day, items: result.dayItems[i] || [] })),
          totalBudget: result.dayItems.flat().reduce((s, item) => s + item.cost, 0),
        }
        setGenerating(false)
        if (skipped.length > 0) {
          // 有无法安排的 POI → 暂停，展示确认弹窗
          setPendingSkippedPOIs(skipped)
          setPendingTripResult({ newTrip, skipped })
          setShowSkipConfirm(true)
        } else {
          // 全部安排成功 → 直接保存并跳转到预览页
          setTrip(newTrip)
          setState({ currentTrip: newTrip, skippedPOIs: [] })
          setTimeout(() => setStep(6), 600)
        }
      } catch (err) {
        Taro.showToast({ title: '路线生成失败', icon: 'none' })
        setGenerating(false)
      }
    }, 100)
  }

  /** 用户确认丢弃溢出 POI，继续生成行程 */
  const handleConfirmSkip = () => {
    if (!pendingTripResult) return
    const { newTrip, skipped } = pendingTripResult
    setTrip(newTrip)
    setState({ currentTrip: newTrip, skippedPOIs: skipped })
    setPendingTripResult(null)
    setShowSkipConfirm(false)
    setTimeout(() => setStep(6), 300)
  }

  /** 用户选择回到步骤4自行调整 */
  const handleGoBackToAdjust = () => {
    setPendingTripResult(null)
    setShowSkipConfirm(false)
    setPendingSkippedPOIs([])
    setStep(4)
  }"""

if old_generate not in content:
    print("ERROR: doGenerateRoute block not found")
    exit(1)
content = content.replace(old_generate, new_generate, 1)
print("✓ Step 2: doGenerateRoute redesigned")

# ─── 3. 改造步骤5 JSX ───
old_step5_start = """        {/* ── 步骤5：生成中过渡页 ── */}
        {step === 5 && (
          <View style='display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; padding: 40rpx;'>
            <View style='text-align: center;'>
              <Text style='font-size: 80rpx; display: block; margin-bottom: 32rpx;'>🗺️</Text>
              <Text style='font-size: 36rpx; font-weight: 700; color: #1C1917; display: block; margin-bottom: 16rpx;'>正在规划最优路线</Text>
              <Text style='font-size: 26rpx; color: #7A7068; display: block; margin-bottom: 48rpx;'>AI 正在根据你的选择安排最佳游玩顺序...</Text>
              {/* 进度条动画效果 */}
              <View style='width: 400rpx; height: 8rpx; background: #F5F0EB; border-radius: 999rpx; overflow: hidden; margin: 0 auto;'>
                <View style='width: 60%; height: 100%; background: linear-gradient(90deg, #E8735A, #E8A44A); border-radius: 999rpx;' />
              </View>
            </View>
          </View>
        )}"""

new_step5 = """        {/* ── 步骤5：路线规划（生成中/溢出确认 两种状态） ── */}
        {step === 5 && (
          <View style='min-height: 80vh; padding: 40rpx;'>
            {/* 状态A：正在生成中 */}
            {generating && !showSkipConfirm && (
              <View style='display: flex; flex-direction: column; align-items: center; justify-content: center; height: 70vh;'>
                <Text style='font-size: 80rpx; display: block; margin-bottom: 32rpx;'>🗺️</Text>
                <Text style='font-size: 36rpx; font-weight: 700; color: #1C1917; display: block; margin-bottom: 16rpx;'>正在规划最优路线</Text>
                <Text style='font-size: 26rpx; color: #7A7068; display: block; margin-bottom: 48rpx;'>AI 正在根据你的选择安排最佳游玩顺序...</Text>
                <View style='width: 400rpx; height: 8rpx; background: #F5F0EB; border-radius: 999rpx; overflow: hidden;'>
                  <View style='width: 60%; height: 100%; background: linear-gradient(90deg, #E8735A, #E8A44A); border-radius: 999rpx;' />
                </View>
              </View>
            )}
            {/* 状态B：有 POI 无法安排 → 显示确认弹窗 */}
            {!generating && showSkipConfirm && (
              <View>
                {/* 标题 */}
                <View style='margin-bottom: 24rpx;'>
                  <Text style='font-size: 36rpx; font-weight: 700; color: #1C1917; display: block; margin-bottom: 8rpx;'>⚠️ 行程有点满了</Text>
                  <Text style='font-size: 26rpx; color: #7A7068; line-height: 1.6;'>以下 {pendingSkippedPOIs.length} 个地点无法安排进行程，可能原因：时间不足、营业时间冲突或地点过于分散。</Text>
                </View>
                {/* 无法安排的 POI 列表 */}
                <ScrollView scrollY style='max-height: 45vh; margin-bottom: 24rpx;'>
                  {pendingSkippedPOIs.map(p => (
                    <View key={p.id}
                      style='border-radius: 16rpx; background: #ffffff; border: 2rpx solid #E7E0D8; padding: 20rpx 24rpx; margin-bottom: 12rpx; display: flex; align-items: center; gap: 16rpx;'
                      onClick={() => setPoiDetailItem(p)}>
                      {/* 缩略图 */}
                      {p.image ? (
                        <Image src={p.image} style='width: 80rpx; height: 80rpx; border-radius: 12rpx; flex-shrink: 0;' mode='aspectFill' />
                      ) : (
                        <View style='width: 80rpx; height: 80rpx; border-radius: 12rpx; background: #F5F0EB; display: flex; align-items: center; justify-content: center; flex-shrink: 0;'>
                          <Text style='font-size: 36rpx;'>📍</Text>
                        </View>
                      )}
                      {/* 信息 */}
                      <View style='flex: 1; min-width: 0;'>
                        <Text style='font-size: 28rpx; font-weight: 600; color: #1C1917; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;'>{p.name}</Text>
                        <View style='display: flex; gap: 12rpx; margin-top: 6rpx; align-items: center;'>
                          {p.rating > 0 && <Text style='font-size: 22rpx; color: #E8A44A;'>★ {p.rating.toFixed(1)}</Text>}
                          {p.duration > 0 && <Text style='font-size: 22rpx; color: #7A7068;'>🕐 {p.duration >= 60 ? `${Math.round(p.duration/60)}h` : `${p.duration}min`}</Text>}
                          {p.tags && p.tags[0] && <Text style='font-size: 22rpx; color: #7A7068; background: #F5F0EB; border-radius: 999rpx; padding: 2rpx 12rpx;'>{p.tags[0]}</Text>}
                        </View>
                      </View>
                      <Text style='font-size: 24rpx; color: #C0B8B0;'>详情 ›</Text>
                    </View>
                  ))}
                </ScrollView>
                {/* 操作按钮 */}
                <View style='display: flex; flex-direction: column; gap: 16rpx;'>
                  {/* 确认丢弃，继续生成 */}
                  <View style='border-radius: 999rpx; background: #E8735A; padding: 28rpx 0; text-align: center;'
                    onClick={handleConfirmSkip}>
                    <Text style='font-size: 30rpx; font-weight: 600; color: #ffffff;'>跳过这些地点，继续生成行程</Text>
                  </View>
                  {/* 回到步骤4自行调整 */}
                  <View style='border-radius: 999rpx; background: #F5F0EB; padding: 28rpx 0; text-align: center;'
                    onClick={handleGoBackToAdjust}>
                    <Text style='font-size: 30rpx; color: #5A4A42;'>返回调整要去的地点</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}"""

if old_step5_start not in content:
    print("ERROR: step5 JSX block not found")
    exit(1)
content = content.replace(old_step5_start, new_step5, 1)
print("✓ Step 3: step5 JSX redesigned")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"✓ File written, total length: {len(content)}")
