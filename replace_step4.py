#!/usr/bin/env python3
import re

filepath = "/Users/eleme/行程规划 demo/miniprogram/src/pages/create-trip/index.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = "                {/* ── 步骤4：选择景点 ── */}"
end_marker   = "        {/* ── 步骤5：自动生成路线 ── */"

si = content.find(start_marker)
ei = content.find(end_marker)
if si == -1 or ei == -1:
    print(f"MARKER NOT FOUND: si={si}, ei={ei}")
    exit(1)

new_block = r"""                {/* ── 步骤4：选择游玩地点 ── */}
        {step === 4 && (
          <View style='padding: 16rpx 32rpx;'>
            {/* 头部行 */}
            <View style='display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx;'>
              <View style='display: flex; align-items: center; gap: 10rpx;'>
                <Text style='font-size: 28rpx;'>📍</Text>
                <Text style='font-size: 32rpx; font-weight: 700; color: #1C1917;'>想去打卡的地方</Text>
              </View>
              <View style={`display: flex; align-items: center; gap: 8rpx; padding: 8rpx 20rpx; border-radius: 999rpx; background: ${selectedPoiIds.size > 0 ? '#FFF0ED' : '#F5F0EB'};`}
                onClick={() => selectedPoiIds.size > 0 && setShowPoiCart(true)}>
                <Text style={`font-size: 22rpx; font-weight: 600; color: ${selectedPoiIds.size > 0 ? '#E8735A' : '#7A7068'};`}>已选{selectedPoiIds.size}个</Text>
                {selectedPoiIds.size > 0 && <Text style='font-size: 20rpx; color: #E8735A;'>›</Text>}
              </View>
            </View>

            {/* 分类 Tab */}
            <ScrollView scrollX style='margin-bottom: 14rpx; white-space: nowrap;'>
              <View style='display: flex; gap: 12rpx; padding-bottom: 4rpx;'>
                {POI_CATEGORIES.map(cat => (
                  <View key={cat.key}
                    style={`flex-shrink: 0; display: flex; align-items: center; gap: 6rpx; padding: 10rpx 24rpx; border-radius: 999rpx; ${poiCategoryTab === cat.key ? 'background: #E8735A;' : 'background: #F5F0EB;'}`}
                    onClick={() => { setPoiCategoryTab(cat.key); resetPoiFilters(); setPoiSearch('') }}>
                    <Text style='font-size: 22rpx;'>{cat.emoji}</Text>
                    <Text style={`font-size: 24rpx; font-weight: 500; ${poiCategoryTab === cat.key ? 'color: #ffffff;' : 'color: #7A7068;'}`}>{cat.label}</Text>
                    <Text style={`font-size: 20rpx; ${poiCategoryTab === cat.key ? 'color: rgba(255,255,255,0.8);' : 'color: #BCBCBC;'}`}>
                      {pois.filter(p => p.type === cat.key).length}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* 搜索框 */}
            <View style='display: flex; align-items: center; border-radius: 20rpx; border: 2rpx solid #E7E0D8; margin-bottom: 12rpx; background: #ffffff; padding: 0 20rpx;'>
              <Text style='color: #7A7068; font-size: 28rpx; margin-right: 10rpx;'>🔍</Text>
              <Input style='flex: 1; height: 68rpx; font-size: 26rpx;'
                placeholder={`搜索${POI_CATEGORIES.find(c => c.key === poiCategoryTab)?.label || ''}名称/地址/标签...`}
                value={poiSearch}
                onInput={e => setPoiSearch(e.detail.value)} />
              {poiSearch.length > 0 && (
                <Text style='color: #7A7068; font-size: 26rpx; padding: 8rpx;' onClick={() => setPoiSearch('')}>✕</Text>
              )}
            </View>

            {/* 工具栏：排序 + 视图切换 + 筛选 */}
            <View style='display: flex; align-items: center; justify-content: space-between; margin-bottom: 14rpx;'>
              <View style='display: flex; gap: 8rpx;'>
                {([
                  { key: 'default' as const, label: '综合' },
                  { key: 'seasonal' as const, label: '当季' },
                  { key: 'rating' as const, label: '评分' },
                  { key: 'duration' as const, label: '时长' },
                ] as const).map(s => (
                  <View key={s.key}
                    style={`padding: 6rpx 16rpx; border-radius: 999rpx; ${poiSortBy === s.key ? 'background: #E8735A;' : 'background: #F5F0EB;'}`}
                    onClick={() => setPoiSortBy(s.key)}>
                    <Text style={`font-size: 20rpx; font-weight: 500; ${poiSortBy === s.key ? 'color: #ffffff;' : 'color: #7A7068;'}`}>{s.label}</Text>
                  </View>
                ))}
              </View>
              <View style='display: flex; align-items: center; gap: 12rpx;'>
                <View style='display: flex; background: #F5F0EB; border-radius: 999rpx; padding: 3rpx;'>
                  {(['list', 'map'] as const).map(mode => (
                    <View key={mode}
                      style={`padding: 7rpx 14rpx; border-radius: 999rpx; ${poiViewMode === mode ? 'background: #ffffff;' : ''}`}
                      onClick={() => setPoiViewMode(mode)}>
                      <Text style={`font-size: 20rpx; ${poiViewMode === mode ? 'color: #E8735A; font-weight: 600;' : 'color: #7A7068;'}`}>{mode === 'list' ? '列表' : '地图'}</Text>
                    </View>
                  ))}
                </View>
                <View style={`position: relative; padding: 7rpx 18rpx; border-radius: 999rpx; background: ${activePoiFilterCount > 0 ? '#FFF0ED' : '#F5F0EB'};`}
                  onClick={() => setShowPoiFilter(true)}>
                  <Text style={`font-size: 20rpx; font-weight: 500; color: ${activePoiFilterCount > 0 ? '#E8735A' : '#7A7068'};`}>筛选</Text>
                  {activePoiFilterCount > 0 && (
                    <View style='position: absolute; top: -6rpx; right: -6rpx; min-width: 26rpx; height: 26rpx; border-radius: 999rpx; background: #E8735A; display: flex; align-items: center; justify-content: center;'>
                      <Text style='font-size: 16rpx; color: #ffffff; font-weight: 600;'>{activePoiFilterCount}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* 内容区 */}
            {loadingStep ? (
              <View style='text-align: center; padding: 80rpx 0;'>
                <Text style='font-size: 28rpx; color: #7A7068;'>加载中...</Text>
              </View>
            ) : poiViewMode === 'list' ? (
              <ScrollView scrollY style='max-height: 52vh;'>
                <View>
                  {poisByCategory.length > 0 ? poisByCategory.map(p => {
                    const isSel = selectedPoiIds.has(p.id)
                    return (
                      <View key={p.id}
                        style={`margin-bottom: 14rpx; border-radius: 20rpx; border: 3rpx solid ${isSel ? '#E8735A' : '#E7E0D8'}; padding: 18rpx 20rpx; background: #ffffff; display: flex; align-items: center; ${isSel ? 'box-shadow: 0 2rpx 10rpx rgba(232,115,90,0.15);' : ''}`}
                        onClick={() => setPoiDetailItem(p)}>
                        <View style='width: 72rpx; height: 72rpx; border-radius: 14rpx; background: #FDF9F6; display: flex; align-items: center; justify-content: center; margin-right: 16rpx; flex-shrink: 0;'>
                          <Text style='font-size: 32rpx;'>{typeEmoji[p.type] || '📍'}</Text>
                        </View>
                        <View style='flex: 1; min-width: 0;'>
                          <Text style='font-size: 28rpx; font-weight: 600; color: #1C1917; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block;'>{p.name}</Text>
                          <View style='display: flex; gap: 10rpx; margin-top: 6rpx; flex-wrap: wrap;'>
                            {p.rating ? <Text style='font-size: 22rpx; color: #f59e0b;'>★ {p.rating}</Text> : null}
                            {p.duration ? <Text style='font-size: 22rpx; color: #7A7068;'>🕐 {p.duration >= 60 ? Math.round(p.duration / 60) + 'h' : p.duration + 'min'}</Text> : null}
                            <Text style='font-size: 22rpx; color: #E8735A;'>{p.cost > 0 ? `¥${p.cost}` : '免费'}</Text>
                            {p.seasonalIndex ? <Text style='font-size: 20rpx; color: #10b981;'>🌿{p.seasonalIndex}</Text> : null}
                          </View>
                          {p.tags && p.tags.length > 0 && (
                            <View style='display: flex; gap: 6rpx; margin-top: 6rpx; flex-wrap: wrap;'>
                              {p.tags.slice(0, 3).map((t, i) => (
                                <Text key={i} style='font-size: 18rpx; color: #7A7068; background: #F5F0EB; padding: 3rpx 10rpx; border-radius: 6rpx;'>{t}</Text>
                              ))}
                            </View>
                          )}
                        </View>
                        <View style={`width: 44rpx; height: 44rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-left: 12rpx; flex-shrink: 0; ${isSel ? 'background: #E8735A;' : 'border: 3rpx solid #E7E0D8;'}`}
                          onClick={e => { e.stopPropagation(); togglePoi(p.id) }}>
                          {isSel && <Text style='color: #ffffff; font-size: 22rpx;'>✓</Text>}
                        </View>
                      </View>
                    )
                  }) : (
                    <View style='text-align: center; padding: 80rpx 0;'>
                      <Text style='font-size: 26rpx; color: #7A7068;'>暂无符合条件的地点</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            ) : (
              <View>
                <Map
                  latitude={poiMapCenter.lat}
                  longitude={poiMapCenter.lng}
                  scale={13}
                  markers={poisByCategory.map((p, idx) => ({
                    id: idx + 1,
                    latitude: p.lat || 0,
                    longitude: p.lng || 0,
                    title: p.name,
                    iconPath: '',
                    width: 30,
                    height: 30,
                    callout: {
                      content: p.name,
                      display: selectedPoiIds.has(p.id) ? 'ALWAYS' : 'BYCLICK' as const,
                      color: selectedPoiIds.has(p.id) ? '#E8735A' : '#1C1917',
                      fontSize: 12,
                      borderRadius: 8,
                      bgColor: '#ffffff',
                      padding: 5,
                    }
                  }))}
                  style='width: 100%; height: 48vh; border-radius: 20rpx;'
                  onMarkerTap={(e: any) => {
                    const idx = ((e.detail?.markerId ?? e.markerId) as number) - 1
                    if (idx >= 0 && idx < poisByCategory.length) setPoiMapSelected(poisByCategory[idx])
                  }}
                />
                {poiMapSelected && (
                  <View style={`margin-top: 12rpx; border-radius: 20rpx; border: 3rpx solid ${selectedPoiIds.has(poiMapSelected.id) ? '#E8735A' : '#E7E0D8'}; padding: 18rpx; background: #ffffff;`}>
                    <View style='display: flex; align-items: center; justify-content: space-between;'>
                      <Text style='font-size: 28rpx; font-weight: 700; color: #1C1917; flex: 1;'>{poiMapSelected.name}</Text>
                      <Text style='font-size: 22rpx; color: #7A7068;' onClick={() => setPoiDetailItem(poiMapSelected)}>详情 ›</Text>
                    </View>
                    <View style='display: flex; gap: 12rpx; margin-top: 6rpx;'>
                      {poiMapSelected.rating ? <Text style='font-size: 22rpx; color: #f59e0b;'>★ {poiMapSelected.rating}</Text> : null}
                      {poiMapSelected.duration ? <Text style='font-size: 22rpx; color: #7A7068;'>🕐 {poiMapSelected.duration}min</Text> : null}
                      <Text style='font-size: 22rpx; color: #E8735A;'>{poiMapSelected.cost > 0 ? `¥${poiMapSelected.cost}` : '免费'}</Text>
                    </View>
                    <View style='margin-top: 12rpx; border-radius: 999rpx; background: #E8735A; padding: 12rpx 0; text-align: center;'
                      onClick={() => togglePoi(poiMapSelected.id)}>
                      <Text style='font-size: 24rpx; font-weight: 600; color: #ffffff;'>
                        {selectedPoiIds.has(poiMapSelected.id) ? '取消选择' : '添加到计划'}
                      </Text>
                    </View>
                  </View>
                )}
                {!poiMapSelected && (
                  <View style='text-align: center; padding: 20rpx 0;'>
                    <Text style='font-size: 22rpx; color: #7A7068;'>点击地图标记查看详情</Text>
                  </View>
                )}
              </View>
            )}

            {/* POI 详情浮层 */}
            {poiDetailItem && (
              <View style='position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 200;'>
                <View style='position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.45);'
                  onClick={() => setPoiDetailItem(null)} />
                <View style='position: absolute; left: 0; right: 0; bottom: 0; background: #ffffff; border-radius: 32rpx 32rpx 0 0; max-height: 80vh; display: flex; flex-direction: column;'>
                  <View style='padding: 28rpx 32rpx 0;'>
                    <View style='display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16rpx;'>
                      <View style='flex: 1;'>
                        <Text style='font-size: 34rpx; font-weight: 800; color: #1C1917; display: block;'>{poiDetailItem.name}</Text>
                        {poiDetailItem.address ? <Text style='font-size: 24rpx; color: #7A7068; margin-top: 6rpx; display: block;'>{poiDetailItem.address}</Text> : null}
                      </View>
                      <Text style='font-size: 28rpx; color: #BCBCBC; padding: 0 8rpx;' onClick={() => setPoiDetailItem(null)}>✕</Text>
                    </View>
                    <View style='display: flex; gap: 20rpx; margin-bottom: 16rpx; flex-wrap: wrap;'>
                      {poiDetailItem.rating ? <View style='display: flex; align-items: center; gap: 4rpx;'><Text style='font-size: 24rpx; color: #f59e0b;'>★</Text><Text style='font-size: 24rpx; color: #1C1917; font-weight: 600;'>{poiDetailItem.rating}</Text></View> : null}
                      {poiDetailItem.duration ? <Text style='font-size: 22rpx; color: #7A7068; background: #F5F0EB; padding: 4rpx 12rpx; border-radius: 8rpx;'>🕐 {poiDetailItem.duration >= 60 ? Math.round(poiDetailItem.duration / 60) + 'h' : poiDetailItem.duration + 'min'}</Text> : null}
                      <Text style='font-size: 22rpx; color: #E8735A; font-weight: 600; background: #FFF0ED; padding: 4rpx 12rpx; border-radius: 8rpx;'>{poiDetailItem.cost > 0 ? `门票 ¥${poiDetailItem.cost}` : '免票'}</Text>
                      {poiDetailItem.seasonalIndex ? <Text style='font-size: 22rpx; color: #10b981; background: #ecfdf5; padding: 4rpx 12rpx; border-radius: 8rpx;'>🌿 当季指数 {poiDetailItem.seasonalIndex}</Text> : null}
                    </View>
                  </View>
                  <ScrollView scrollY style='flex: 1;'>
                    <View style='padding: 0 32rpx;'>
                      {poiDetailItem.openTime ? (
                        <View style='margin-bottom: 16rpx;'>
                          <Text style='font-size: 24rpx; color: #7A7068;'>🕙 开放时间：{poiDetailItem.openTime}{poiDetailItem.closeTime ? ' - ' + poiDetailItem.closeTime : ''}</Text>
                        </View>
                      ) : null}
                      {poiDetailItem.tags && poiDetailItem.tags.length > 0 && (
                        <View style='display: flex; gap: 8rpx; flex-wrap: wrap; margin-bottom: 16rpx;'>
                          {poiDetailItem.tags.map((t, i) => (
                            <Text key={i} style='font-size: 22rpx; color: #7A7068; background: #F5F0EB; padding: 6rpx 16rpx; border-radius: 8rpx;'>{t}</Text>
                          ))}
                        </View>
                      )}
                      {poiDetailItem.description ? (
                        <Text style='font-size: 26rpx; color: #4A4035; line-height: 1.6; display: block; margin-bottom: 16rpx;'>{poiDetailItem.description}</Text>
                      ) : null}
                      {poiDetailItem.recommendReason ? (
                        <View style='background: #FFF8F0; border-radius: 16rpx; padding: 16rpx; margin-bottom: 16rpx;'>
                          <Text style='font-size: 22rpx; color: #E8A44A; font-weight: 600; display: block; margin-bottom: 6rpx;'>💡 推荐理由</Text>
                          <Text style='font-size: 24rpx; color: #7A7068;'>{poiDetailItem.recommendReason}</Text>
                        </View>
                      ) : null}
                      <View style='height: 16rpx;' />
                    </View>
                  </ScrollView>
                  <View style='padding: 16rpx 32rpx; padding-bottom: calc(env(safe-area-inset-bottom) + 16rpx); background: #ffffff;'>
                    <View style={`border-radius: 999rpx; padding: 18rpx 0; text-align: center; ${selectedPoiIds.has(poiDetailItem.id) ? 'background: #F5F0EB;' : 'background: #E8735A;'}`}
                      onClick={() => { togglePoi(poiDetailItem.id); setPoiDetailItem(null) }}>
                      <Text style={`font-size: 28rpx; font-weight: 600; ${selectedPoiIds.has(poiDetailItem.id) ? 'color: #7A7068;' : 'color: #ffffff;'}`}>
                        {selectedPoiIds.has(poiDetailItem.id) ? '取消选择' : '添加到计划 +'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* 筛选抽屉 */}
            {showPoiFilter && (
              <View style='position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 200;'>
                <View style='position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4);' onClick={() => setShowPoiFilter(false)} />
                <View style='position: absolute; left: 0; right: 0; bottom: 0; background: #ffffff; border-radius: 32rpx 32rpx 0 0; max-height: 78vh; display: flex; flex-direction: column;'>
                  <View style='padding: 28rpx 32rpx 0;'>
                    <View style='display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx;'>
                      <Text style='font-size: 30rpx; font-weight: 700; color: #1C1917;'>
                        {POI_CATEGORIES.find(c => c.key === poiCategoryTab)?.label} 筛选
                      </Text>
                      <Text style='font-size: 26rpx; color: #E8735A;' onClick={resetPoiFilters}>重置</Text>
                    </View>
                  </View>
                  <ScrollView scrollY style='flex: 1;'>
                    <View style='padding: 0 32rpx;'>
                      {/* 标签（二级类目）*/}
                      {poiCategoryTags.length > 0 && (
                        <View style='margin-bottom: 28rpx;'>
                          <Text style='font-size: 26rpx; font-weight: 600; color: #1C1917; margin-bottom: 14rpx; display: block;'>
                            {poiCategoryTab === 'scenic' ? '景点类型' : poiCategoryTab === 'food' ? '美食类目' : poiCategoryTab === 'shopping' ? '购物类型' : '游玩类型'}
                          </Text>
                          <View style='display: flex; flex-wrap: wrap; gap: 10rpx;'>
                            {poiCategoryTags.map(tag => {
                              const active = filterPoiTags.includes(tag)
                              return (
                                <View key={tag}
                                  style={`padding: 10rpx 24rpx; border-radius: 999rpx; border: 2rpx solid ${active ? '#E8735A' : '#E7E0D8'}; background: ${active ? '#FFF0ED' : '#ffffff'};`}
                                  onClick={() => setFilterPoiTags(prev => active ? prev.filter(t => t !== tag) : [...prev, tag])}>
                                  <Text style={`font-size: 22rpx; color: ${active ? '#E8735A' : '#1C1917'};`}>{tag}</Text>
                                </View>
                              )
                            })}
                          </View>
                        </View>
                      )}
                      {/* 综合评分 */}
                      <View style='margin-bottom: 28rpx;'>
                        <Text style='font-size: 26rpx; font-weight: 600; color: #1C1917; margin-bottom: 14rpx; display: block;'>综合评分</Text>
                        <View style='display: flex; gap: 10rpx; flex-wrap: wrap;'>
                          {[{ label: '不限', value: null as number|null }, { label: '4.0+', value: 4.0 }, { label: '4.5+', value: 4.5 }, { label: '4.8+', value: 4.8 }].map(r => (
                            <View key={String(r.value)}
                              style={`padding: 10rpx 24rpx; border-radius: 999rpx; border: 2rpx solid ${filterPoiRating === r.value ? '#E8735A' : '#E7E0D8'}; background: ${filterPoiRating === r.value ? '#FFF0ED' : '#ffffff'};`}
                              onClick={() => setFilterPoiRating(r.value)}>
                              <Text style={`font-size: 22rpx; color: ${filterPoiRating === r.value ? '#E8735A' : '#1C1917'};`}>{r.label}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                      {/* 费用 */}
                      <View style='margin-bottom: 28rpx;'>
                        <Text style='font-size: 26rpx; font-weight: 600; color: #1C1917; margin-bottom: 14rpx; display: block;'>
                          {poiCategoryTab === 'scenic' ? '门票价格' : '人均消费'}
                        </Text>
                        <View style='display: flex; gap: 10rpx; flex-wrap: wrap;'>
                          {[{ label: '不限', value: 'all' }, { label: '免费', value: 'free' }, { label: '¥0-100', value: '0-100' }, { label: '¥100-300', value: '100-300' }, { label: '¥300+', value: '300+' }].map(c => (
                            <View key={c.value}
                              style={`padding: 10rpx 24rpx; border-radius: 999rpx; border: 2rpx solid ${filterPoiCost === c.value ? '#E8735A' : '#E7E0D8'}; background: ${filterPoiCost === c.value ? '#FFF0ED' : '#ffffff'};`}
                              onClick={() => setFilterPoiCost(c.value)}>
                              <Text style={`font-size: 22rpx; color: ${filterPoiCost === c.value ? '#E8735A' : '#1C1917'};`}>{c.label}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                      {/* 游玩时长（景点/娱乐显示） */}
                      {(poiCategoryTab === 'scenic' || poiCategoryTab === 'activity') && (
                        <View style='margin-bottom: 28rpx;'>
                          <Text style='font-size: 26rpx; font-weight: 600; color: #1C1917; margin-bottom: 14rpx; display: block;'>游玩时长</Text>
                          <View style='display: flex; gap: 10rpx; flex-wrap: wrap;'>
                            {[{ label: '不限', value: 'all' }, { label: '≤1小时', value: '0-60' }, { label: '1-2小时', value: '60-120' }, { label: '2-4小时', value: '120-240' }, { label: '4小时+', value: '240+' }].map(d => (
                              <View key={d.value}
                                style={`padding: 10rpx 24rpx; border-radius: 999rpx; border: 2rpx solid ${filterPoiDuration === d.value ? '#E8735A' : '#E7E0D8'}; background: ${filterPoiDuration === d.value ? '#FFF0ED' : '#ffffff'};`}
                                onClick={() => setFilterPoiDuration(d.value)}>
                                <Text style={`font-size: 22rpx; color: ${filterPoiDuration === d.value ? '#E8735A' : '#1C1917'};`}>{d.label}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}
                      <View style='height: 16rpx;' />
                    </View>
                  </ScrollView>
                  <View style='padding: 16rpx 32rpx; padding-bottom: calc(env(safe-area-inset-bottom) + 16rpx); background: #ffffff;'>
                    <View style='border-radius: 999rpx; background: #E8735A; padding: 18rpx 0; text-align: center;'
                      onClick={() => setShowPoiFilter(false)}>
                      <Text style='font-size: 26rpx; font-weight: 600; color: #ffffff;'>确认筛选</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* POI 购物车浮层 */}
            {showPoiCart && (
              <View style='position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 200;'>
                <View style='position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4);' onClick={() => setShowPoiCart(false)} />
                <View style='position: absolute; left: 0; right: 0; bottom: 0; background: #ffffff; border-radius: 32rpx 32rpx 0 0; max-height: 70vh; display: flex; flex-direction: column;'>
                  <View style='padding: 28rpx 32rpx 0;'>
                    <View style='display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx;'>
                      <Text style='font-size: 30rpx; font-weight: 700; color: #1C1917;'>已选地点（{selectedPoiIds.size}）</Text>
                      {selectedPoiIds.size > 0 && (
                        <Text style='font-size: 24rpx; color: #D4553D;'
                          onClick={() => { selectedPoisList.forEach(p => togglePoi(p.id)) }}>清空</Text>
                      )}
                    </View>
                  </View>
                  <ScrollView scrollY style='flex: 1;'>
                    <View style='padding: 0 32rpx;'>
                      {selectedPoisList.length > 0 ? selectedPoisList.map(p => (
                        <View key={p.id} style='display: flex; align-items: center; padding: 16rpx 0; border-bottom: 2rpx solid #F5F0EB;'>
                          <View style='width: 60rpx; height: 60rpx; border-radius: 12rpx; background: #FDF9F6; display: flex; align-items: center; justify-content: center; margin-right: 14rpx; flex-shrink: 0;'>
                            <Text style='font-size: 28rpx;'>{typeEmoji[p.type] || '📍'}</Text>
                          </View>
                          <View style='flex: 1; min-width: 0;'>
                            <Text style='font-size: 26rpx; font-weight: 600; color: #1C1917; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'>{p.name}</Text>
                            <View style='display: flex; gap: 10rpx; margin-top: 4rpx;'>
                              {p.rating ? <Text style='font-size: 20rpx; color: #f59e0b;'>★ {p.rating}</Text> : null}
                              <Text style='font-size: 20rpx; color: #E8735A;'>{p.cost > 0 ? `¥${p.cost}` : '免费'}</Text>
                            </View>
                          </View>
                          <View style='width: 40rpx; height: 40rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #F5F0EB; margin-left: 12rpx;'
                            onClick={() => togglePoi(p.id)}>
                            <Text style='font-size: 22rpx; color: #7A7068;'>✕</Text>
                          </View>
                        </View>
                      )) : (
                        <View style='text-align: center; padding: 60rpx 0;'>
                          <Text style='font-size: 26rpx; color: #7A7068;'>还没有选择任何地点</Text>
                        </View>
                      )}
                      <View style='height: 16rpx;' />
                    </View>
                  </ScrollView>
                  <View style='padding: 16rpx 32rpx; padding-bottom: calc(env(safe-area-inset-bottom) + 16rpx); background: #ffffff;'>
                    <View style='border-radius: 999rpx; background: #F5F0EB; padding: 18rpx 0; text-align: center;'
                      onClick={() => setShowPoiCart(false)}>
                      <Text style='font-size: 26rpx; font-weight: 600; color: #7A7068;'>关闭</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        """

content = content[:si] + new_block + content[ei:]
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"SUCCESS, new file length: {len(content)}")
