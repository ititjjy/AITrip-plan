# 分类原则

> 从错题本中提炼的分类规则。每条原则对应一个具体的混淆场景和推荐的代码修改。
>
> 原则生命周期: 🔍观察中 → 📝待应用 → ✅已应用 → 🔄已修正 → ❌已废弃

## 原则索引

| # | 原则名称 | 混淆对 | 机制 | 状态 | 关联错误 |
|---|---------|--------|------|------|---------|
| P-001 | 餐饮场所归餐饮 | food↔scenic/hotel/shopping | 排除规则 | ✅ 已应用 | 初始 |
| P-002 | 住宿设施归酒店 | hotel↔scenic/shopping | 排除规则 | ✅ 已应用 | 初始 |
| P-003 | 体育场馆归娱乐 | hotel↔entertainment | 排除规则 | ✅ 已应用 | 初始 |
| P-004 | 剧场演出归娱乐 | entertainment↔scenic/hotel/shopping | 排除规则 | ✅ 已应用 | 初始 |
| P-005 | 公园景区不归酒店 | hotel↔scenic | 排除规则 | ✅ 已应用 | 初始 |
| P-006 | 商业综合体归购物 | scenic↔shopping | 排除规则+专用检测 | ✅ 已应用 | 初始 |
| P-007 | 体验活动归体验 | experience↔scenic/shopping | 排除规则 | ✅ 已应用 | 初始 |
| P-008 | 旅游别墅不归酒店 | hotel↔scenic | 排除规则(描述词) | ✅ 已应用 | 初始 |
| P-009 | 景点地标不归购物 | shopping↔scenic | 排除规则 | ✅ 已应用 | 初始 |
| P-010 | 历史建筑不归酒店 | hotel↔scenic | 排除规则 | ✅ 已应用 | 初始 |

---

## 详细原则

### P-001 · 餐饮场所归餐饮，不归景点/酒店/购物

- **混淆对**: food ↔ scenic / hotel / shopping
- **混淆机制**: 名称误匹配 — 含"餐厅""饭店""咖啡馆"等后缀的 POI 可能被错误归入景点或酒店
- **判断规则**: 当 POI 名称以餐饮后缀结尾（餐厅、饭店、菜馆、面馆、咖啡馆、茶馆、酒吧等），或描述以餐饮词汇为主（米其林、主厨、招牌菜、人均、菜单），应归入 food
- **来源错误**: 初始代码审查
- **推荐修改**:
  ```yaml
  file: agent/classifier.ts
  section: CATEGORY_EXCLUSIONS (scenic, hotel, shopping 均排除餐饮)
  action: 对 scenic/hotel/shopping 的餐饮排除规则，名称命中时清零并 boost food +10~+12
  ```
- **状态**: ✅ 已应用
- **验证**: scenic/hotel/shopping 类目下不应出现以餐饮后缀命名的 POI

---

### P-002 · 住宿设施归酒店，不归景点/购物

- **混淆对**: hotel ↔ scenic / shopping
- **混淆机制**: 名称误匹配 — 含"酒店""民宿""公寓"等后缀的 POI 可能被错误归入景点或购物
- **判断规则**: 当 POI 名称以住宿后缀结尾（酒店、旅馆、客栈、民宿、宾馆、公寓、度假村），或描述以住宿词汇为主（入住、退房、客房、前台），应归入 hotel
- **来源错误**: 初始代码审查
- **推荐修改**:
  ```yaml
  file: agent/classifier.ts
  section: CATEGORY_EXCLUSIONS (scenic, shopping 排除住宿)
  action: 对 scenic/shopping 的住宿排除规则，名称命中时清零并 boost hotel +10~+12
  ```
- **状态**: ✅ 已应用
- **验证**: scenic/shopping 类目下不应出现酒店/民宿类 POI

---

### P-003 · 体育场馆归娱乐，不归酒店

- **混淆对**: hotel ↔ entertainment
- **混淆机制**: 后缀误匹配 — 酒店常宣传"泳池""体育馆"等设施，导致名称中含体育词汇
- **判断规则**: 当 POI 名称含"游泳馆""体育馆""球场""赛马场""溜冰场"等体育设施词汇时，即使描述提及酒店相关词汇，也应归入 entertainment 而非 hotel
- **来源错误**: 初始代码审查
- **推荐修改**:
  ```yaml
  file: agent/classifier.ts
  section: CATEGORY_EXCLUSIONS.hotel
  action: 体育场馆名称命中时清零 hotel 分数，boost entertainment +10
  ```
- **状态**: ✅ 已应用
- **验证**: hotel 类目下不应出现以体育设施命名的 POI

---

### P-004 · 剧场演出归娱乐，不归景点/酒店/购物

- **混淆对**: entertainment ↔ scenic / hotel / shopping
- **混淆机制**: 场所多功能性 — 剧场/脱口秀/LiveHouse 可能被 AI 误归为景点（因为"著名演出"）、酒店（因为"剧院旁"）或购物（因为"文化商业"）
- **判断规则**: 当 POI 名称含"剧场""剧院""影院""脱口秀""livehouse"，或描述以演出词汇为主（演出、表演、观演、舞台、门票），应归入 entertainment
- **来源错误**: 初始代码审查
- **推荐修改**:
  ```yaml
  file: agent/classifier.ts
  section: CATEGORY_EXCLUSIONS (scenic, hotel, shopping 均排除剧场)
  action: 剧场/演出名称命中时清零，boost entertainment +10~+12
  ```
- **状态**: ✅ 已应用
- **验证**: scenic/hotel/shopping 类目下不应出现以剧场/演出命名的 POI

---

### P-005 · 公园/景区不归酒店

- **混淆对**: hotel ↔ scenic
- **混淆机制**: 度假酒店误匹配 — 名称含"公园""步道""森林""湿地"的 POI 不可能是酒店
- **判断规则**: 当 POI 名称含自然景观词汇（公园、步道、绿道、森林、湿地、植物园、动物园、国家公园、风景区）时，排除 hotel，归入 scenic
- **来源错误**: 初始代码审查
- **推荐修改**:
  ```yaml
  file: agent/classifier.ts
  section: CATEGORY_EXCLUSIONS.hotel
  action: 自然景观名称命中时清零 hotel，boost scenic +10
  ```
- **状态**: ✅ 已应用
- **验证**: hotel 类目下不应出现公园/步道/森林类 POI

---

### P-006 · 商业综合体归购物，不归景点

- **混淆对**: scenic ↔ shopping
- **混淆机制**: 双重特征 — 大型商业综合体（如新天地、K11、大悦城）常被 AI 视为"景点"因为它们是热门打卡地
- **判断规则**: 当 POI 名称含商业综合体关键词（天地、IFC、K11、万象、大悦城、恒隆等），且描述含商业词汇（品牌、零售、店铺、百货、楼层），应归入 shopping 而非 scenic。这是通过专用的 `isCommercialComplex()` 函数实现的硬性检测
- **来源错误**: 初始代码审查
- **推荐修改**:
  ```yaml
  file: agent/classifier.ts
  section: CATEGORY_EXCLUSIONS.scenic + isCommercialComplex()
  action: 名称+描述双重命中时，scenic 排除，硬性归入 shopping
  ```
- **状态**: ✅ 已应用
- **验证**: 新天地、K11、大悦城等综合体应在 shopping 类目下

---

### P-007 · 体验活动归体验，不归景点/购物

- **混淆对**: experience ↔ scenic / shopping
- **混淆机制**: 活动 vs 场所 — "夜游""灯光秀""嘉年华""探秘"等是体验活动，不是静态景点或购物场所
- **判断规则**: 当 POI 名称含体验活动词汇（探秘、夜游、灯光秀、嘉年华、夜航、乘船观演），或描述含活动词汇（滑草、岩降、体能训练、自然教育课程），应归入 experience
- **来源错误**: 初始代码审查
- **推荐修改**:
  ```yaml
  file: agent/classifier.ts
  section: CATEGORY_EXCLUSIONS (scenic, shopping 排除体验活动)
  action: 体验活动名称/描述命中时清零，boost experience +10~+12
  ```
- **状态**: ✅ 已应用
- **验证**: 灯光秀、嘉年华等活动类 POI 应在 experience 类目下

---

### P-008 · 旅游别墅不归酒店

- **混淆对**: hotel ↔ scenic
- **混淆机制**: 描述词误导 — 历史别墅/名人故居的描述含"参观""游览""对外开放"，AI 可能因"别墅"归为 hotel
- **判断规则**: 当 POI 描述含旅游/参观词汇（参观、游览、对外开放、历史保护、文化遗址）时，即使名称含住宿相关词，也应归入 scenic
- **来源错误**: 初始代码审查
- **推荐修改**:
  ```yaml
  file: agent/classifier.ts
  section: CATEGORY_EXCLUSIONS.hotel
  action: 描述含旅游词汇时清零 hotel，boost scenic +8（阈值低于名称命中）
  ```
- **状态**: ✅ 已应用
- **验证**: 历史别墅/故居类 POI 应在 scenic 而非 hotel

---

### P-009 · 景点地标不归购物

- **混淆对**: shopping ↔ scenic
- **混淆机制**: 商业区含景点 — 某些景点周边商业区可能被误归 shopping，但长城、鸟巢、寺庙等本身是景点
- **判断规则**: 当 POI 名称含景点后缀（公园、寺、庙、博物馆、长城、鸟巢、奥林匹克）或描述含遗产词汇（文化遗产、世界遗产、文物保护单位），排除 shopping，归入 scenic
- **来源错误**: 初始代码审查
- **推荐修改**:
  ```yaml
  file: agent/classifier.ts
  section: CATEGORY_EXCLUSIONS.shopping
  action: 景点名称/描述命中时清零 shopping，boost scenic +12
  ```
- **状态**: ✅ 已应用
- **验证**: shopping 类目下不应出现寺庙、博物馆、长城类 POI

---

### P-010 · 历史建筑不归酒店

- **混淆对**: hotel ↔ scenic
- **混淆机制**: 名称部分匹配 — 故居、纪念馆、博物馆、遗址等历史建筑可能因描述中含"附近住宿"被误归 hotel
- **判断规则**: 当 POI 名称含历史建筑词汇（故居、旧居、纪念馆、博物馆、美术馆、遗址、古迹、历史建筑、保护建筑），排除 hotel，归入 scenic
- **来源错误**: 初始代码审查
- **推荐修改**:
  ```yaml
  file: agent/classifier.ts
  section: CATEGORY_EXCLUSIONS.hotel
  action: 历史建筑名称命中时清零 hotel，boost scenic +10
  ```
- **状态**: ✅ 已应用
- **验证**: hotel 类目下不应出现故居/纪念馆/博物馆类 POI

---

## 模板

> 添加新原则时复制以下模板：

<!--
### P-NNN · [原则名称]

- **混淆对**: [L1a] ↔ [L1b]
- **混淆机制**: [后缀误匹配 / 名称词干扰 / 描述词误导 / 排除规则缺失 / 来源映射错误 / 跨类目边界]
- **判断规则**: [清晰、可测试的判断条件]
- **来源错误**: #[n1], #[n2], ...
- **推荐修改**:
  ```yaml
  file: agent/classifier.ts
  section: [目标代码段]
  action: [具体修改]
  ```
- **状态**: [🔍 观察中 / 📝 待应用 / ✅ 已应用 / 🔄 已修正 / ❌ 已废弃]
- **验证**: [如何确认修改生效]
-->
