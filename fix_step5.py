#!/usr/bin/env python3
filepath = "/Users/eleme/行程规划 demo/miniprogram/src/pages/create-trip/index.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 找到步骤5开始和结束行
start = None
end = None
for i, line in enumerate(lines):
    if '步骤5：自动生成路线' in line and start is None:
        start = i
    if start is not None and i > start and line.strip() == ')}' and end is None:
        end = i
        break

if start is None or end is None:
    print(f"NOT FOUND: start={start}, end={end}")
    exit(1)

print(f"Found step5: lines {start+1}-{end+1}")
print("First line:", repr(lines[start]))
print("Last line:", repr(lines[end]))

new_block = """        {/* ── 步骤5：生成中过渡页（自动跳转，无需用户操作） ── */}
        {step === 5 && (
          <View style='display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; padding: 40rpx;'>
            <View style='text-align: center;'>
              <Text style='font-size: 80rpx; display: block; margin-bottom: 32rpx;'>🗺️</Text>
              <Text style='font-size: 36rpx; font-weight: 700; color: #1C1917; display: block; margin-bottom: 16rpx;'>正在规划最优路线</Text>
              <Text style='font-size: 26rpx; color: #7A7068; display: block; margin-bottom: 48rpx;'>AI 正在根据你的选择安排最佳游玩顺序...</Text>
              <View style='width: 400rpx; height: 8rpx; background: #F5F0EB; border-radius: 999rpx; overflow: hidden; margin: 0 auto;'>
                <View style='width: 60%; height: 100%; background: linear-gradient(90deg, #E8735A, #E8A44A); border-radius: 999rpx;' />
              </View>
            </View>
          </View>
        )}
"""

new_lines = lines[:start] + [new_block] + lines[end+1:]
with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print(f"SUCCESS, total lines: {len(new_lines)}")
#!/usr/bin/env python3
filepath = "/Users/eleme/行程规划 demo/miniprogram/src/pages/create-trip/index.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

old = """                {/* ── 步骤5：自动生成路线 ── */}
        {step === 5 && (
          <View style='padding: 24rpx 32rpx; text-align: center;'>
            <View style='margin-top: 120rpx; margin-bottom: 48rpx;'>
              <Text style='font-size: 28rpx; font-weight: 600; color: #E8735A; display: block; margin-bottom: 8rpx;'>🗺️ 第五步</Text>
              <Text style='font-size: 40rpx; font-weight: 800; color: #1C1917;'>智能路线规划</Text>
            </View>
            {generating ? (
              <View>
                <Text style='font-size: 64rpx; display: block; margin-bottom: 24rpx;'>⏳</Text>
                <Text style='font-size: 28rpx; color: #7A7068;'>AI 正在为你规划最优路线...</Text>
              </View>
            ) : trip ? (
              <View>
                <Text style='font-size: 64rpx; display: block; margin-bottom: 24rpx;'>✅</Text>
                <Text style='font-size: 32rpx; font-weight: 700; color: #1C1917; display: block; margin-bottom: 12rpx;'>路线生成完成</Text>
                <Text style='font-size: 26rpx; color: #7A7068;'>共 {trip.days.reduce((s, d) => s + d.items.length, 0)} 个安排 · ¥{trip.totalBudget.toLocaleString()}</Text>
              </View>
            ) : (
              <View>
                <Text style='font-size: 64rpx; display: block; margin-bottom: 24rpx;'>❌</Text>
                <Text style='font-size: 28rpx; color: #D4553D;'>路线生成失败，请返回重试</Text>
              </View>
            )}
          </View>
        )}"""

new = """        {/* ── 步骤5：生成中过渡页（自动跳转，无需用户操作） ── */}
        {step === 5 && (
          <View style='display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; padding: 40rpx;'>
            <View style='text-align: center;'>
              <Text style='font-size: 80rpx; display: block; margin-bottom: 32rpx;'>🗺️</Text>
              <Text style='font-size: 36rpx; font-weight: 700; color: #1C1917; display: block; margin-bottom: 16rpx;'>正在规划最优路线</Text>
              <Text style='font-size: 26rpx; color: #7A7068; display: block; margin-bottom: 48rpx;'>AI 正在根据你的选择安排最佳游玩顺序...</Text>
              <View style='width: 400rpx; height: 8rpx; background: #F5F0EB; border-radius: 999rpx; overflow: hidden; margin: 0 auto;'>
                <View style='width: 60%; height: 100%; background: linear-gradient(90deg, #E8735A, #E8A44A); border-radius: 999rpx;' />
              </View>
            </View>
          </View>
        )}"""

if old in content:
    content = content.replace(old, new, 1)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"SUCCESS, length: {len(content)}")
else:
    print("OLD MARKER NOT FOUND")
