#!/usr/bin/env python3
import sys
fp = '/Users/eleme/行程规划 demo/miniprogram/src/pages/create-trip/index.tsx'
with open(fp, 'r', encoding='utf-8') as f:
    lines = f.readlines()

sys.stdout.write(f"Start: {len(lines)} lines\n")

# ── STEP A: Replace doGenerateRoute (lines 193-215, 0-indexed) ──
new_gen = """  const doGenerateRoute = (overrideIds?: Set<string>) => {
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

  /** 用户确认丢弃溢出 POI，继续 */
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
  }
"""
lines[193:216] = [new_gen]
with open(fp, 'w', encoding='utf-8') as f:
    f.writelines(lines)
sys.stdout.write(f"After genRoute replace: {len(lines)} lines\n")

# ── STEP B: Replace step5 JSX ──
with open(fp, 'r', encoding='utf-8') as f:
    lines = f.readlines()

step5_start = step5_end = None
for i, ln in enumerate(lines):
    if '步骤5：生成中过渡页' in ln and step5_start is None:
        step5_start = i
    if step5_start is not None and i > step5_start and ln.strip() == ')}' and step5_end is None:
        step5_end = i
        break

if step5_start is None or step5_end is None:
    sys.stderr.write(f"step5 JSX not found: {step5_start} {step5_end}\n")
    sys.exit(1)
sys.stdout.write(f"step5 JSX: {step5_start+1}-{step5_end+1}\n")

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
            {/* 状态B：有 POI 无法安排 → 显示确认 */}
            {!generating && showSkipConfirm && (
              <View>
                <View style='margin-bottom: 24rpx;'>
                  <Text style='font-size: 36rpx; font-weight: 700; color: #1C1917; display: block; margin-bottom: 8rpx;'>⚠️ 行程有点满了</Text>
                  <Text style='font-size: 26rpx; color: #7A7068; line-height: 1.6;'>以下 {pendingSkippedPOIs.length} 个地点因时间/冲突无法安排进行程，可以选择跳过或返回调整。</Text>
                </View>
                <ScrollView scrollY style='max-height: 45vh; margin-bottom: 24rpx;'>
                  {pendingSkippedPOIs.map(p => (
                    <View key={p.id}
                      style='border-radius: 16rpx; background: #ffffff; border: 2rpx solid #E7E0D8; padding: 20rpx 24rpx; margin-bottom: 12rpx; display: flex; align-items: center; gap: 16rpx;'
                      onClick={() => setPoiDetailItem(p)}>
                      {p.image ? (
                        <Image src={p.image} style='width: 80rpx; height: 80rpx; border-radius: 12rpx; flex-shrink: 0;' mode='aspectFill' />
                      ) : (
                        <View style='width: 80rpx; height: 80rpx; border-radius: 12rpx; background: #F5F0EB; display: flex; align-items: center; justify-content: center; flex-shrink: 0;'>
                          <Text style='font-size: 36rpx;'>📍</Text>
                        </View>
                      )}
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
                <View style='display: flex; flex-direction: column; gap: 16rpx;'>
                  <View style='border-radius: 999rpx; background: #E8735A; padding: 28rpx 0; text-align: center;'
                    onClick={handleConfirmSkip}>
                    <Text style='font-size: 30rpx; font-weight: 600; color: #ffffff;'>跳过这些地点，继续生成行程</Text>
                  </View>
                  <View style='border-radius: 999rpx; background: #F5F0EB; padding: 28rpx 0; text-align: center;'
                    onClick={handleGoBackToAdjust}>
                    <Text style='font-size: 30rpx; color: #5A4A42;'>返回调整要去的地点</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
"""
lines[step5_start:step5_end+1] = [new_step5]
with open(fp, 'w', encoding='utf-8') as f:
    f.writelines(lines)
sys.stdout.write(f"Done! Final lines: {len(lines)}\n")
