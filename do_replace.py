import sys

with open('/Users/eleme/行程规划 demo/miniprogram/src/pages/create-trip/index.tsx', 'r') as f:
    content = f.read()

start_marker = "        {/* ── 步骤3：选择酒店 ── */}"
end_marker   = "        {/* ── 步骤4：选择景点 ── */}"

si = content.find(start_marker)
ei = content.find(end_marker)

if si == -1 or ei == -1:
    print(f"ERROR: si={si}, ei={ei}")
    sys.exit(1)

new_step3 = """        {/* ── 步骤3：选择酒店 ── */}
        {step === 3 && (
          <View style='padding: 24rpx 32rpx;'>
            <View style='text-align: center; margin-bottom: 24rpx;'>
              <Text style='font-size: 28rpx; font-weight: 600; color: #E8735A; display: block; margin-bottom: 8rpx;'>🏨 第三步</Text>
              <Text style='font-size: 40rpx; font-weight: 800; color: #1C1917;'>选择住宿</Text>
              <Text style='font-size: 26rpx; color: #7A7068; margin-top: 8rpx; display: block;'>可选，也可以跳过</Text>
            </View>

            <View style='display: flex; align-items: center; margin-bottom: 20rpx; background: #F5F0EB; border-radius: 999rpx; padding: 4rpx;'>
              <View style={`flex: 1; text-align: center; padding: 12rpx 0; border-radius: 999rpx; ${!perDayMode ? 'background: #ffffff; box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.1);' : ''}`}
                onClick={() => setPerDayMode(false)}>
                <Text style={`font-size: 26rpx; font-weight: 600; ${!perDayMode ? 'color: #E8735A;' : 'color: #7A7068;'}`}>统一选择</Text>
              </View>
              <View style={`flex: 1; text-align: center; padding: 12rpx 0; border-radius: 999rpx; ${perDayMode ? 'background: #ffffff; box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.1);' : ''}`}
                onClick={() => setPerDayMode(true)}>
                <Text style={`font-size: 26rpx; font-weight: 600; ${perDayMode ? 'color: #E8735A;' : 'color: #7A7068;'}`}>每天分别选</Text>
              </View>
            </View>

            {perDayMode && dayCount > 0 && (
              <ScrollView scrollX style='margin-bottom: 20rpx;'>
                <View style='display: flex; gap: 12rpx; padding-bottom: 4rpx;'>
                  {Array.from({ length: dayCount }, (_, i) => (
                    <View key={i}
                      style={`padding: 10rpx 28rpx; border-radius: 999rpx; flex-shrink: 0; ${currentDayTab === i ? 'background: #E8735A;' : 'background: #F5F0EB;'}`}
                      onClick={() => setCurrentDayTab(i)}>
                      <Text style={`font-size: 24rpx; font-weight: 500; ${currentDayTab === i ? 'color: #ffffff;' : 'color: #7A7068;'}`}>
                        {'Day ' + (i + 1) + (selectedHotelPerDay[i] ? ' ✓' : '')}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}

            {!loadingStep && hotels.length > 0 && (
              <View>
                <View style='display: flex; align-items: center; border-radius: 20rpx; border: 2rpx solid #E7E0D8; margin-bottom: 16rpx; background: #ffffff; padding: 0 20rpx;'>
                  <Text style='color: #7A7068; font-size: 32rpx; margin-right: 12rpx;'>🔍</Text>
                  <Input style='flex: 1; height: 72rpx; font-size: 26rpx;' placeholder='搜索酒店名称/地址/标签...' value={hotelSearch} onInput={e => setHotelSearch(e.detail.value)} confirmType='search' />
                  {hotelSearch.length > 0 && (
                    <Text style='color: #7A7068; font-size: 28rpx; padding: 8rpx;' onClick={() => setHotelSearch('')}>✕</Text>
                  )}
                </View>
                <View style='display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx;'>
                  <View style='display: flex; gap: 8rpx;'>
                    {([
                      { key: 'default' as const, label: '综合' },
                      { key: 'price_asc' as const, label: '价格↑' },
                      { key: 'rating_desc' as const, label: '评分↓' },
                    ]).map(s => (
                      <View key={s.key}
                        style={`padding: 8rpx 18rpx; border-radius: 999rpx; ${sortBy === s.key ? 'background: #E8735A;' : 'background: #F5F0EB;'}`}
                        onClick={() => setSortBy(s.key)}>
                        <Text style={`font-size: 22rpx; font-weight: 500; ${sortBy === s.key ? 'color: #ffffff;' : 'color: #7A7068;'}`}>{s.label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style='display: flex; align-items: center; gap: 16rpx;'>
                    <View style='display: flex; background: #F5F0EB; border-radius: 999rpx; padding: 4rpx;'>
                      <View style={`padding: 8rpx 16rpx; border-radius: 999rpx; ${hotelViewMode === 'list' ? 'background: #ffffff;' : ''}`}
                        onClick={() => setHotelViewMode('list')}>
                        <Text style={`font-size: 22rpx; ${hotelViewMode === 'list' ? 'color: #E8735A; font-weight: 600;' : 'color: #7A7068;'}`}>列表</Text>
                      </View>
                      <View style={`padding: 8rpx 16rpx; border-radius: 999rpx; ${hotelViewMode === 'map' ? 'background: #ffffff;' : ''}`}
                        onClick={() => setHotelViewMode('map')}>
                        <Text style={`font-size: 22rpx; ${hotelViewMode === 'map' ? 'color: #E8735A; font-weight: 600;' : 'color: #7A7068;'}`}>地图</Text>
                      </View>
                    </View>
                    <View style={`position: relative; padding: 8rpx 20rpx; border-radius: 999rpx; background: ${activeFilterCount > 0 ? '#FFF0ED' : '#F5F0EB'};`}
                      onClick={() => setShowFilter(true)}>
                      <Text style={`font-size: 22rpx; font-weight: 500; color: ${activeFilterCount > 0 ? '#E8735A' : '#7A7068'};`}>筛选</Text>
                      {activeFilterCount > 0 && (
                        <View style='position: absolute; top: -6rpx; right: -6rpx; min-width: 28rpx; height: 28rpx; border-radius: 999rpx; background: #E8735A; display: flex; align-items: center; justify-content: center;'>
                          <Text style='font-size: 18rpx; color: #ffffff; font-weight: 600;'>{activeFilterCount}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            )}

            {loadingStep ? (
              <View style='text-align: center; padding: 80rpx 0;'>
                <Text style='font-size: 28rpx; color: #7A7068;'>加载酒店中...</Text>
              </View>
            ) : hotels.length > 0 ? (
              hotelViewMode === 'list' ? (
                <ScrollView scrollY style='max-height: 55vh;'>
                  {filteredHotels.length > 0 ? filteredHotels.map(h => {
                    const isSelected = perDayMode
                      ? selectedHotelPerDay[currentDayTab]?.id === h.id
                      : selectedHotel?.id === h.id
                    return (
                      <View key={h.id}
                        style={`margin-bottom: 20rpx; border-radius: 20rpx; border: 4rpx solid ${isSelected ? '#E8735A' : '#E7E0D8'}; padding: 24rpx; background: #ffffff; ${isSelected ? 'box-shadow: 0 4rpx 16rpx rgba(232,115,90,0.2);' : ''}`}
                        onClick={() => handleSelectHotel(h)}>
                        <View style='display: flex; align-items: flex-start; justify-content: space-between;'>
                          <View style='flex: 1; min-width: 0;'>
                            <Text style='font-size: 28rpx; font-weight: 700; color: #1C1917; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block;'>{h.name}</Text>
                            <Text style='font-size: 24rpx; color: #7A7068; margin-top: 4rpx; display: block;'>{h.address}</Text>
                          </View>
                          {isSelected && (
                            <View style='min-width: 40rpx; height: 40rpx; border-radius: 50%; background: #E8735A; display: flex; align-items: center; justify-content: center; margin-left: 12rpx;'>
                              <Text style='color: #ffffff; font-size: 22rpx;'>✓</Text>
                            </View>
                          )}
                        </View>
                        <View style='display: flex; align-items: center; gap: 16rpx; margin-top: 12rpx; flex-wrap: wrap;'>
                          {h.stars ? <Text style='font-size: 22rpx; color: #E8A44A;'>{'⭐'.repeat(h.stars)}</Text> : null}
                          {h.rating ? <Text style='font-size: 24rpx; color: #f59e0b;'>{'★ ' + h.rating}</Text> : null}
                          {h.priceRange ? <Text style='font-size: 24rpx; color: #E8735A; font-weight: 600;'>{'¥' + h.priceRange[0] + '-' + h.priceRange[1] + '/晚'}</Text> : null}
                          {h.reviewCount ? <Text style='font-size: 22rpx; color: #7A7068;'>{h.reviewCount + '条评价'}</Text> : null}
                        </View>
                        {h.amenities && h.amenities.length > 0 && (
                          <View style='display: flex; gap: 8rpx; margin-top: 12rpx; flex-wrap: wrap;'>
                            {h.amenities.slice(0, 4).map((a, i) => (
                              <Text key={i} style='font-size: 20rpx; color: #7A7068; background: #F5F0EB; padding: 4rpx 12rpx; border-radius: 8rpx;'>{a}</Text>
                            ))}
                          </View>
                        )}
                      </View>
                    )
                  }) : (
                    <View style='text-align: center; padding: 80rpx 0;'>
                      <Text style='font-size: 28rpx; color: #7A7068;'>没有匹配的酒店</Text>
                    </View>
                  )}
                </ScrollView>
              ) : (
                <View>
                  <Map
                    latitude={mapCenter.lat}
                    longitude={mapCenter.lng}
                    scale={12}
                    markers={filteredHotels.map((h, mapIdx) => ({
                      id: mapIdx + 1,
                      latitude: h.lat,
                      longitude: h.lng,
                      title: h.name,
                      iconPath: '',
                      width: 32,
                      height: 32,
                      callout: {
                        content: h.name,
                        display: 'ALWAYS' as const,
                        color: '#1C1917',
                        fontSize: 12,
                        borderRadius: 8,
                        bgColor: '#ffffff',
                        padding: 6,
                      }
                    }))}
                    style='width: 100%; height: 50vh; border-radius: 20rpx;'
                    onMarkerTap={(e: any) => {
                      const mId = e.detail?.markerId ?? e.markerId
                      const fi = (mId as number) - 1
                      if (fi >= 0 && fi < filteredHotels.length) {
                        setMapSelectedHotel(filteredHotels[fi])
                      }
                    }}
                  />
                  {mapSelectedHotel && (
                    <View style={`margin-top: 16rpx; border-radius: 20rpx; border: 4rpx solid ${(perDayMode ? selectedHotelPerDay[currentDayTab]?.id : selectedHotel?.id) === mapSelectedHotel.id ? '#E8735A' : '#E7E0D8'}; padding: 20rpx; background: #ffffff;`}>
                      <Text style='font-size: 28rpx; font-weight: 700; color: #1C1917; display: block;'>{mapSelectedHotel.name}</Text>
                      <Text style='font-size: 24rpx; color: #7A7068; margin-top: 4rpx; display: block;'>{mapSelectedHotel.address}</Text>
                      <View style='display: flex; gap: 16rpx; margin-top: 8rpx;'>
                        {mapSelectedHotel.rating ? <Text style='font-size: 24rpx; color: #f59e0b;'>{'★ ' + mapSelectedHotel.rating}</Text> : null}
                        {mapSelectedHotel.priceRange ? <Text style='font-size: 24rpx; color: #E8735A; font-weight: 600;'>{'¥' + mapSelectedHotel.priceRange[0] + '-' + mapSelectedHotel.priceRange[1] + '/晚'}</Text> : null}
                      </View>
                      <View style='margin-top: 16rpx; border-radius: 999rpx; background: #E8735A; padding: 14rpx 0; text-align: center;'
                        onClick={() => handleSelectHotel(mapSelectedHotel)}>
                        <Text style='font-size: 24rpx; font-weight: 600; color: #ffffff;'>
                          {(perDayMode ? selectedHotelPerDay[currentDayTab]?.id : selectedHotel?.id) === mapSelectedHotel.id ? '已选择 ✓' : '选择此酒店'}
                        </Text>
                      </View>
                    </View>
                  )}
                  {!mapSelectedHotel && (
                    <View style='text-align: center; padding: 24rpx 0;'>
                      <Text style='font-size: 24rpx; color: #7A7068;'>点击地图标记查看酒店详情</Text>
                    </View>
                  )}
                </View>
              )
            ) : (
              <View style='text-align: center; padding: 80rpx 0;'>
                <Text style='font-size: 28rpx; color: #7A7068;'>暂无酒店推荐，可跳过此步</Text>
              </View>
            )}

            {showFilter && (
              <View style='position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 200;'>
                <View style='position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4);' onClick={() => setShowFilter(false)} />
                <View style='position: absolute; left: 0; right: 0; bottom: 0; background: #ffffff; border-radius: 32rpx 32rpx 0 0; padding: 32rpx 32rpx 60rpx;'>
                  <View style='display: flex; align-items: center; justify-content: space-between; margin-bottom: 32rpx;'>
                    <Text style='font-size: 32rpx; font-weight: 700; color: #1C1917;'>筛选条件</Text>
                    <Text style='font-size: 28rpx; color: #E8735A;' onClick={() => { setFilterStars(null); setFilterPriceRange('all'); setFilterArea('all') }}>重置</Text>
                  </View>
                  <View style='margin-bottom: 32rpx;'>
                    <Text style='font-size: 28rpx; font-weight: 600; color: #1C1917; margin-bottom: 16rpx; display: block;'>星级</Text>
                    <View style='display: flex; flex-wrap: wrap; gap: 12rpx;'>
                      {([{ label: '不限', value: null as number | null }, { label: '3星', value: 3 }, { label: '4星', value: 4 }, { label: '5星', value: 5 }]).map(s => (
                        <View key={s.label}
                          style={`padding: 12rpx 28rpx; border-radius: 999rpx; border: 2rpx solid ${filterStars === s.value ? '#E8735A' : '#E7E0D8'}; background: ${filterStars === s.value ? '#FFF0ED' : '#ffffff'};`}
                          onClick={() => setFilterStars(s.value)}>
                          <Text style={`font-size: 24rpx; font-weight: 500; color: ${filterStars === s.value ? '#E8735A' : '#1C1917'};`}>{s.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style='margin-bottom: 32rpx;'>
                    <Text style='font-size: 28rpx; font-weight: 600; color: #1C1917; margin-bottom: 16rpx; display: block;'>价格区间</Text>
                    <View style='display: flex; flex-wrap: wrap; gap: 12rpx;'>
                      {[
                        { label: '不限', value: 'all' },
                        { label: '¥0-300', value: '0-300' },
                        { label: '¥300-600', value: '300-600' },
                        { label: '¥600-1000', value: '600-1000' },
                        { label: '¥1000+', value: '1000+' },
                      ].map(p => (
                        <View key={p.value}
                          style={`padding: 12rpx 28rpx; border-radius: 999rpx; border: 2rpx solid ${filterPriceRange === p.value ? '#E8735A' : '#E7E0D8'}; background: ${filterPriceRange === p.value ? '#FFF0ED' : '#ffffff'};`}
                          onClick={() => setFilterPriceRange(p.value)}>
                          <Text style={`font-size: 24rpx; font-weight: 500; color: ${filterPriceRange === p.value ? '#E8735A' : '#1C1917'};`}>{p.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  {hotelAreas.length > 0 && (
                    <View style='margin-bottom: 32rpx;'>
                      <Text style='font-size: 28rpx; font-weight: 600; color: #1C1917; margin-bottom: 16rpx; display: block;'>商圈/区域</Text>
                      <View style='display: flex; flex-wrap: wrap; gap: 12rpx;'>
                        <View style={`padding: 12rpx 28rpx; border-radius: 999rpx; border: 2rpx solid ${filterArea === 'all' ? '#E8735A' : '#E7E0D8'}; background: ${filterArea === 'all' ? '#FFF0ED' : '#ffffff'};`}
                          onClick={() => setFilterArea('all')}>
                          <Text style={`font-size: 24rpx; font-weight: 500; color: ${filterArea === 'all' ? '#E8735A' : '#1C1917'};`}>不限</Text>
                        </View>
                        {hotelAreas.map(a => (
                          <View key={a}
                            style={`padding: 12rpx 28rpx; border-radius: 999rpx; border: 2rpx solid ${filterArea === a ? '#E8735A' : '#E7E0D8'}; background: ${filterArea === a ? '#FFF0ED' : '#ffffff'};`}
                            onClick={() => setFilterArea(a)}>
                            <Text style={`font-size: 24rpx; font-weight: 500; color: ${filterArea === a ? '#E8735A' : '#1C1917'};`}>{a}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  <View style='border-radius: 999rpx; background: #E8735A; padding: 20rpx 0; text-align: center;'
                    onClick={() => setShowFilter(false)}>
                    <Text style='font-size: 28rpx; font-weight: 600; color: #ffffff;'>确认筛选</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        """

content = content[:si] + new_step3 + content[ei:]

with open('/Users/eleme/行程规划 demo/miniprogram/src/pages/create-trip/index.tsx', 'w') as f:
    f.write(content)

print('SUCCESS, new file length:', len(content))
