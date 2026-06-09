# POI 分类错题本

> 记录分类器误判案例，积累分类智慧。每条记录包含 POI 信息、错误分析、正确分类及人工推理。

## 统计摘要

- 总记录数: 11
- 最常见混淆对: experience → scenic (6次), entertainment → 应排除 (1次), entertainment → 重复 (1次)
- 最近更新: 2026-06-01

---

## #001 · 2026-06-01

| 字段 | 值 |
|------|-----|
| POI 名称 | 国家大剧院 |
| 城市 | 北京 |
| 数据来源 | 多源 |
| 当前分类 | entertainment（娱乐） |
| 错误类型 | 数据重复（同一 POI 出现至少两次） |

**人工推理**：

国家大剧院本身分在 entertainment 是合理的，但在北京娱乐类目下出现了至少两次，属于去重失败。可能原因：不同数据源用了略微不同的名称（如"国家大剧院"/"北京国家大剧院"/"国家大剧院（北京）"），导致相似度未过阈值未被合并。

```yaml
action_type: tune_dedup_threshold
target_file: agent/config.ts / agent/merger.ts
detail: 检查名称相似度计算，对带城市前缀的名称变体做归一化处理（去掉"北京""上海"等城市前缀后再比较）
related_entries: []
status: pending
```

---

## #002 · 2026-06-01

| 字段 | 值 |
|------|-----|
| POI 名称 | 北京赌场（类似名称） |
| 城市 | 北京 |
| 数据来源 | ai |
| 当前分类 | entertainment（娱乐） |
| 错误类型 | 应排除（无效 POI） |

**人工推理**：

根据中国法律，除澳门特别行政区外，大陆境内禁止赌博活动。北京不存在合法赌场，该条目为 AI 编造的无效数据，不应作为 POI 存在。需要在采集后过滤掉含"赌场"关键词的大陆城市 POI，或在排除规则中添加针对国内城市的赌场过滤。

```yaml
action_type: add_invalid_filter
target_file: agent/classifier.ts 或 agent/quality.ts
detail: 对 isDomestic=true 城市，过滤掉名称含"赌场""赌博""博彩"的 POI（中国大陆禁止）
related_entries: []
status: pending
```

---

## #003 · 2026-06-01

| 字段 | 值 |
|------|-----|
| POI 名称 | 颐和园 |
| 城市 | 北京 |
| 数据来源 | 多源 |
| 当前分类 | experience（体验） |
| 错误类型 | L1 错误 |
| 正确分类 | scenic（景点） |

**人工推理**：

颐和园是中国最大的皇家园林，是典型的观光型景点（世界文化遗产），旅行者去颐和园是为了游览建筑、景观和历史文化，而非参与特定体验项目（无攀岩/冲浪/手工等活动属性）。"园"后缀应优先匹配 scenic，而不是因为名称中含"园"触发 experience 的 nameWords。

```yaml
action_type: add_exclusion
target_file: agent/classifier.ts
target_section: CATEGORY_EXCLUSIONS.experience
detail: 名称以"园""公园""御苑""御花园"结尾时，experience 分数清零，boost scenic +10
related_entries: [P-011]
status: pending
```

---

## #004 · 2026-06-01

| 字段 | 值 |
|------|-----|
| POI 名称 | 门头沟爨底下村 / 爨底下村 / 北京门头沟爨底下村 |
| 城市 | 北京 |
| 数据来源 | 多源 |
| 当前分类 | experience（体验） |
| 错误类型 | L1 错误 + 数据重复（3条） |
| 正确分类 | scenic（景点） |

**人工推理**：

爨底下村是明清时期保存完好的古村落，是典型的历史文化景点（文物保护单位），旅行者前往是为了参观古建筑群和历史风貌，而非参与特定体验项目。
同时，"门头沟爨底下村""爨底下村""北京门头沟爨底下村"指同一地点，去重失败（城市名前缀导致名称相似度偏低）。

古村落、古镇类 POI 应归入 scenic（文化遗产/历史古迹），而非 experience。

```yaml
action_type: add_exclusion + tune_dedup
target_file: agent/classifier.ts
target_section: CATEGORY_EXCLUSIONS.experience
detail: |
  1. 名称含"古村落""古村""古镇""历史村落""文保单位""文物保护"时，experience 分数清零，boost scenic +10
  2. 名称含"村"后缀且描述含历史/文化词时，归 scenic
  3. 去重：对带城市前缀变体（北京XXX/XXX/门头沟XXX）做前缀归一化
related_entries: [P-011, P-012]
status: pending
```

---

## #005 · 2026-06-01

| 字段 | 值 |
|------|-----|
| POI 名称 | 北京石景山首钢园 |
| 城市 | 北京 |
| 数据来源 | 多源 |
| 当前分类 | experience（体验） |
| 错误类型 | L1 错误 |
| 正确分类 | scenic（景点） |

**人工推理**：

首钢园是工业遗迹改造的文化创意园区，旅行者前往主要是为了参观工业遗址、打卡网红地标，核心价值是观光而非参与特定体验活动。"工业遗迹""创意园区""园"后缀均指向 scenic。仅当该园区内有具体体验项目（如"首钢园滑雪大跳台体验"）时，才应归入 experience。

```yaml
action_type: add_exclusion
target_file: agent/classifier.ts
target_section: CATEGORY_EXCLUSIONS.experience
detail: 名称含"工业遗址""工业遗迹""创意园区""文创园"时，experience 分数清零，boost scenic +10
related_entries: [P-011]
status: pending
```

---

## #006 · 2026-06-01

| 字段 | 值 |
|------|-----|
| POI 名称 | 首创·龙湖北京长楹天街（西区·二期） / 合生汇 / 北京熙悦天街 |
| 城市 | 北京 |
| 数据来源 | 多源 |
| 当前分类 | experience（体验） |
| 错误类型 | L1 错误 |
| 正确分类 | shopping（购物） |

**人工推理**：

"天街""合生汇"均为典型商业综合体（购物中心）。这些地名虽然含有"天街""汇"等字，但核心功能是品牌零售、餐饮聚合和休闲购物，应归入 shopping。"天街"是龙湖商业的品牌名称，应加入商业综合体检测词典。"合生汇"是知名购物中心品牌。

```yaml
action_type: add_commercial_complex_keywords
target_file: agent/classifier.ts
target_section: COMMERCIAL_COMPLEX_NAME_WORDS + CATEGORY_EXCLUSIONS.experience
detail: |
  1. COMMERCIAL_COMPLEX_NAME_WORDS 新增：'天街', '合生汇', '熙悦', '龙湖'
  2. CATEGORY_EXCLUSIONS.experience 新增规则：名称含商业综合体词且描述含购物/品牌词时，experience 清零，boost shopping +12
related_entries: [P-006, P-013]
status: pending
```

---

## #007 · 2026-06-01

| 字段 | 值 |
|------|-----|
| POI 名称 | 雍和宫 |
| 城市 | 北京 |
| 数据来源 | 多源 |
| 当前分类 | experience（体验） |
| 错误类型 | L1 错误 |
| 正确分类 | scenic（景点） |

**人工推理**：

雍和宫是北京著名的藏传佛教寺院，是典型景点（文物保护单位，游览参观为主）。单纯以"雍和宫"命名的 POI 应归入 scenic。若 POI 名称为"雍和宫禅修营""雍和宫佛法体验"等含有明确体验项目的变体，则可归入 experience。
核心原则：寺庙/寺院类 POI 以名称为准，若名称中没有体验活动词，默认归 scenic。

```yaml
action_type: add_exclusion
target_file: agent/classifier.ts
target_section: CATEGORY_EXCLUSIONS.experience
detail: 名称以"寺""庙""宫""观""堂""庵"结尾，且描述不含明确体验活动词（徒步/禅修/工坊/课程）时，experience 分数清零，boost scenic +10
related_entries: [P-011, P-014]
status: pending
```

---

## #008 · 2026-06-01

| 字段 | 值 |
|------|-----|
| POI 名称 | 北京怀柔雁栖湖生态示范区 / 北京怀柔雁栖湖生态发展示范区 |
| 城市 | 北京 |
| 数据来源 | 多源 |
| 错误类型 | 数据重复 |

**人工推理**：

"雁栖湖生态示范区"和"雁栖湖生态发展示范区"指同一地点，名称高度相似（仅多"发展"二字），去重时应合并。与 #001、#004 类似，名称中的修饰词差异（"示范区"/"生态发展示范区"）导致相似度计算未过阈值。

```yaml
action_type: tune_dedup_threshold
target_file: agent/merger.ts
detail: 对超长地名（>8字），尝试去除中间修饰词后做二次相似度比较，或降低"示范区""发展"类修饰词差异对相似度的影响权重
related_entries: [#001, #004]
status: pending
```

---

## #009 · 2026-06-01

| 字段 | 值 |
|------|-----|
| POI 名称 | 北京世界花卉大观园 |
| 城市 | 北京 |
| 数据来源 | 多源 |
| 当前分类 | experience（体验） |
| 错误类型 | L1 错误 |
| 正确分类 | scenic（景点） |

**人工推理**：

北京世界花卉大观园是以花卉展览为主题的公园，旅行者前往是为了观赏花卉和园林景观，属于观光型景点。"大观园"后缀和"花卉""植物"主题均指向 scenic。名称中含"园"后缀，且主题为自然观光，应优先归 scenic。

```yaml
action_type: add_exclusion（同 #003）
target_file: agent/classifier.ts
target_section: CATEGORY_EXCLUSIONS.experience
detail: 与 #003 共用规则：名称以"园""公园"结尾且无明确体验活动词时，experience 清零，boost scenic +10
related_entries: [#003, P-011]
status: pending
```

---

## #010 · 2026-06-01

| 字段 | 值 |
|------|-----|
| POI 名称 | 北京延庆百里山水画廊 |
| 城市 | 北京 |
| 数据来源 | 多源 |
| 当前分类 | experience（体验） |
| 错误类型 | L1 错误 |
| 正确分类 | scenic（景点） |

**人工推理**：

百里山水画廊是延庆的自然风景带（山水景观廊道），旅行者前往是为了欣赏自然风光，属于自然风景景点。"山水""画廊"在此语境下指自然景观，而非艺术体验或户外活动项目，应归入 scenic。

```yaml
action_type: add_exclusion
target_file: agent/classifier.ts
target_section: CATEGORY_EXCLUSIONS.experience
detail: 名称含"山水画廊""风景廊道""自然风光带"时，experience 清零，boost scenic +10；"山水"在地名语境中为自然景观词，应加入 scenic.nameWords
related_entries: [P-011]
status: pending
```

---

## #011 · 2026-06-01

| 字段 | 值 |
|------|-----|
| POI 名称 | （体验类目下多条景点类 POI 的共性分析） |
| 城市 | 北京 |
| 数据来源 | 多源 |
| 当前分类 | experience（体验） |
| 错误类型 | L1 错误（批量） |
| 正确分类 | scenic（景点） |

**人工推理**：

experience（体验）类目的核心定义是：旅行者**主动参与**的活动项目（徒步、潜水、手工坊、禅修课、温泉浴等），有具体的活动内容和时间投入。而 scenic（景点）的核心定义是：旅行者**观看/游览**的地点（公园、寺庙、遗址、自然风光等）。

当前分类器对 experience 的识别偏宽松——凡是有"体验""活动"描述词的 POI 都可能得分，导致大量"可以体验到XX的景点"被错归 experience。

修正方向：experience 类目需要 POI 名称中出现**明确的活动词**（如"体验""工坊""课程""营地"）才能归入，仅靠描述词不足以归 experience；对于名称明确指向地点（公园/寺庙/村落/遗址/园）的 POI，即使描述提及体验，也应优先归 scenic。

```yaml
action_type: tighten_experience_classification
target_file: agent/classifier.ts
target_section: CATEGORY_EXCLUSIONS.experience（新增多条规则）
detail: |
  新增排除规则（名称后缀/关键词命中时，experience 清零 → boost scenic）：
  - 后缀：园、公园、御苑、风景区、景区、遗址、古迹、村、古村、古镇、寺、庙、宫、观、堂、庵
  - 名称词：工业遗迹、工业遗址、创意园区、文创园、古村落、山水画廊
related_entries: [#003, #004, #005, #007, #009, #010, P-011]
status: pending
```
