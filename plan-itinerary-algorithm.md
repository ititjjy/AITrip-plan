# 行程规划推荐算法改造计划

## 背景

当前 `routePlanner.ts` 默认全天 08:00–22:00、自动补齐三餐，并在空白时段自动推荐景点/娱乐（小程序端还会推荐购物）。用户希望行程推荐更可控：购物不主动推荐、避免连续餐厅、15–17 点仅下午茶、早餐前置、三餐时段严格、每日可开关餐食推荐、每日可自定义出发/结束时间。

## 改造范围

- 主站 Web：`src/utils/routePlanner.ts`、`src/types/index.ts`、`src/context/AppContext.tsx`、`src/pages/HotelStepPage.tsx`、`src/pages/PlannerPage.tsx`、`src/components/DayTimeline.tsx`
- 小程序：`miniprogram/src/utils/routePlanner.ts`、`miniprogram/src/types/index.ts`，以及调用 `generateItinerary`/`optimizeDayRoute` 的页面

## 关键改动

### 1. 类型定义扩展

在 `DayPlan` 中新增：

```ts
export interface MealPreferences {
  breakfast: boolean
  lunch: boolean
  dinner: boolean
}

export interface DayPlan {
  ...
  startTime?: string      // 默认 "09:00"
  endTime?: string        // 默认 "21:00"
  mealPreferences?: MealPreferences  // 默认 { breakfast:false, lunch:false, dinner:false }
  mealWarnings?: string[] // 当天用餐提醒
}
```

`PlanResult` 增加 `mealWarnings?: { dayIndex: number; warnings: string[] }[]`。

### 2. 核心算法改造（routePlanner.ts）

#### 2.1 每日时间窗参数化

- `generateItinerary` 读取 `day.startTime || '09:00'`、`day.endTime || '21:00'` 作为当天实际窗口。
- `greedyRouteWithDirection`、`twoOptImprove`、`insertMealIntoSchedule`、`findEarliestOpenSlot`、`autoFillGaps`、`resolveOverlaps`、`optimizeDayRoute` 均接受 `DayWindow` 参数，替换硬编码 `DAY_START`/`DAY_END`。

#### 2.2 三餐时间窗收紧

```ts
MEAL_SLOTS = [
  { type: 'breakfast', earliest: 7*60, ideal: 8*60, latest: 9*60, label: '早餐' },
  { type: 'lunch',     earliest: 11*60, ideal: 12*60, latest: 13*60, label: '午餐' },
  { type: 'dinner',    earliest: 17*60, ideal: 18*60, latest: 19*60, label: '晚餐' },
]
```

`insertMealIntoSchedule` 若无法在给定窗口内插入，则返回警告并跳过。

#### 2.3 购物 POI 不主动推荐

- `autoFillGaps` / `findAutoFillAttraction` 只填充 `scenic`/`activity`；明确拒绝 `shopping`。
- 地理聚类阶段保持“每天最多 1 个购物点”，但仅处理用户已选的购物 POI。

#### 2.4 避免连续餐厅

新增 `hasAdjacentFood(schedule, idx)`，在 `insertMealIntoSchedule` 中过滤会导致与 food/snack 相邻的插入位置。

#### 2.5 15:00–17:00 下午茶规则

新增：
- `isAfternoonTeaPOI(a)`：名称/标签含咖啡/奶茶/果汁相关关键词。
- `findAfternoonTeaPOI(...)`。

`autoFillGaps` 逻辑：
1. 若 gap 完全落在 15:00–17:00，先尝试 `findAutoFillAttraction`（景点/娱乐）。
2. 无合适景点时，才尝试 `findAfternoonTeaPOI`，并标记 `mealSlot: 'snack'`、`isAutoFilled: true`。
3. 下午茶同样受“避免连续 food”约束。

#### 2.6 早餐置顶

`insertMealIntoSchedule` 增加 `forceFirst?: boolean`。早餐（用户选择或自动）传 `forceFirst=true`：
- 仅允许插入位置 `i=0`；
- 若首个非餐饮 POI 的开始时间早于早餐结束，则后移该 POI；
- 若无法置顶（时间窗/营业时间不允许），放弃并告警。

#### 2.7 每日三餐开关（默认关闭）

在 `generateItinerary` 自动补餐阶段：

```ts
const prefs = day.mealPreferences || { breakfast:false, lunch:false, dinner:false }
if (prefs.breakfast && !hasBreakfast) { ... }
if (prefs.lunch && !hasLunch) { ... }
if (prefs.dinner && !hasDinner) { ... }
```

用户已选餐厅（`mealsByDay`）始终插入，不受开关影响。

#### 2.8 用餐提醒

当某餐无法插入时，在 `mealWarnings` 中记录，例如：
- “本日行程已超过早餐时段，早餐请自行安排。”
- “无法在合适时间安排晚餐，晚餐请自行安排。”

### 3. UI 层配合

#### 3.1 酒店设置页（HotelStepPage.tsx）

在酒店卡片下方新增“当天行程设置”折叠面板：
- 出发时间 `<input type="time">`，默认 09:00
- 结束时间 `<input type="time">`，默认 21:00
- 三个开关：推荐早餐 / 推荐午餐 / 推荐晚餐，默认关闭
- 提示文案：关闭后系统不会自动推荐对应餐段餐厅，但你已选择的餐厅仍会安排。

保存时 dispatch `UPDATE_DAY_SETTINGS`。

#### 3.2 AppContext

- `generateDays` 与 `EXTEND_TRIP_DAYS` 注入默认值：`startTime: '09:00'`、`endTime: '21:00'`、`mealPreferences: { breakfast:false, lunch:false, dinner:false }`、`mealWarnings: []`。
- 新增 Action：`UPDATE_DAY_SETTINGS`。

#### 3.3 规划页（PlannerPage.tsx）/ DayTimeline

- 在时间轴顶部渲染 `day.mealWarnings` 黄色提示条。
- 增加“当天设置”入口，允许用户修改时间窗和三餐开关；修改后重新调用 `generateItinerary` 并 `SET_ALL_DAYS_ITEMS`。

#### 3.4 小程序

同步类型与 `routePlanner.ts` 逻辑；在对应酒店/设置页面增加时间选择与三餐开关（若现有页面无合适位置，可暂以默认值兼容，后续再补 UI）。

### 4. 调用点适配

- `PlaceSelectionPage.tsx`、`POIOverflowPage.tsx` 调用 `generateItinerary` 处无需改签名，偏好从 `trip.days` 读取。
- `DayTimeline.tsx` 调用 `optimizeDayRoute` 时需传入当天 `DayPlan` 的窗口与偏好；`optimizeDayRoute` 签名扩展。

### 5. 风险与边界

- **早餐置顶导致首个景点被挤出**：早餐仍受 `slot.latest` 约束；若置顶会导致首个非餐饮 POI 无法在营业时间内开始，则放弃置顶并告警。
- **晚餐提前到 17:00**：`insertMealIntoSchedule` 已有营业时间兜底，会尝试 `findEarliestOpenSlot(meal, slot.earliest)`，只要 `<= slot.latest` 即可。
- **结束时间早于最后一个 POI**：以 `window.endMin` 为截止，排不下则生成警告。
- **旧数据兼容**：读取时全部使用 `|| '09:00'`、`|| '21:00'`、`
- **小程序与主站同步**：两端 routePlanner 逻辑必须保持一致；本次同步修改。

### 6. 验证方案

1. **构建通过**：`npm run build`（主站 + server）和微信小程序构建无错误。
2. **单元/手工验证**：
   - 默认行程（无偏好）不自动补任何餐饮。
   - 开启午餐后，午餐落在 11:00–13:00。
   - 前序景点导致 13:30 才结束，开启午餐后应无法插入并出现警告。
   - 开启早餐后，早餐排在第一个景点之前。
   - 15:00–17:00 gap 优先景点，无景点时安排名称含“咖啡/奶茶/果汁”的 POI。
   - 自动填充结果中不应出现 `type === 'shopping' && isAutoFilled === true`。
3. **UI 验证**：在 HotelStepPage 修改第 2 天出发/结束时间和三餐开关，进入 PlannerPage 后观察时间轴与警告。

## 执行顺序

1. 类型定义 + AppContext 默认值与 action
2. `src/utils/routePlanner.ts` 核心改造
3. `miniprogram/src/utils/routePlanner.ts` 同步改造
4. HotelStepPage 每日设置 UI
5. PlannerPage / DayTimeline 警告渲染与设置入口
6. 构建验证与手工测试
