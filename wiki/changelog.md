# 分类器变更日志

> 记录由错题本驱动的分类器代码变更。每次变更关联具体的原则编号和错误条目。
> 按时间倒序排列（最新在前）。

---

## 2026-06-01 · 体验类排除规则 + experienceItems 字段 + 赌场过滤

- **关联原则**: P-011, P-012, P-013, P-014, P-015, P-016
- **关联错误**: #001~#011（北京 badcase 批次）
- **修改文件**: `agent/classifier.ts`, `agent/sources/ai.ts`, `agent/sources/base.ts`
- **变更内容**:
  1. `classifier.ts` — 新增 `CATEGORY_EXCLUSIONS.experience` 排除规则块（5条规则），含 `forceExclude: true` 强制负分机制；`ExclusionRule` 接口增加 `forceExclude?: boolean` 字段；扩充 `COMMERCIAL_COMPLEX_NAME_WORDS`
  2. `classifier.ts` P-011：公园/御苑/颐和园/风景区/遗址/十三陵/长城等 → scenic（boostScore 15）
  3. `classifier.ts` P-012：古村/古镇/工业遗存/示范区/爨底下/首钢园/会展中心等 → scenic
  4. `classifier.ts` P-014：宗教场所（雍和宫/清真寺/教堂/神社）→ scenic
  5. `classifier.ts` P-013：商业综合体（天街/合生汇/熙悦/太古里/三里屯）→ shopping
  6. `classifier.ts` P-016：主题乐园（欢乐谷/游乐园）→ entertainment
  7. `ai.ts` P-015：移除 `entertainment` 类目 prompt 中的"赌场"词
  8. `ai.ts` + `base.ts`：新增 `ExperienceItem` 接口及 `experienceItems` 字段，体验类采集专用 JSON 格式 `JSON_FORMAT_EXPERIENCE`
- **影响范围**: 北京 experience 类目从约 29 条降至 13 条，scenic/shopping 各增约 10 条；全量城市下次 reprocess 均会受益
- **验证结果**: `reprocess --city beijing` → experience 13 条，全部合理；颐和园/雍和宫/首钢园→scenic，三里屯太古里/天街/合生汇→shopping，欢乐谷→entertainment，赌场词已不会被采集
- **Commit**: 待提交

---

## 模板

> 每次应用原则修改代码后，复制以下模板追加到本文件。

<!--
## YYYY-MM-DD · [变更标题]

- **关联原则**: P-NNN
- **关联错误**: #n1, #n2, ...
- **修改文件**: `agent/classifier.ts`
- **变更内容**: [具体修改了什么，添加/删除了哪些关键词或排除规则]
- **影响范围**: [修改后哪些城市的哪些 POI 会发生分类变化]
- **验证方法**: `npx tsx agent/index.ts reprocess --city [城市]` 后检查分布
- **Commit**: [git commit hash]

---
-->
