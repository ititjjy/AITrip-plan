/**
 * agent/model-fallback.ts — AI 模型自动降级策略（预算制 + 有效期轮转）
 *
 * 核心设计：
 * 1. 每个平台维护一个「模型轮转池」，包含所有可免费调用的模型
 * 2. **有效期优先**：优先调用临近有效期的模型（先用快过期的）
 * 3. **性能次选**：有效期相同时，优先调用更新更强的模型
 * 4. **本地 Token 计数**：每次 API 调用成功后，记录消耗的 Token 数
 * 5. 当某模型累计 Token 消耗达到免费额度的 **90%** 时，自动切换到下一个模型
 *    ——在额度真正耗尽之前就切换，避免产生任何费用
 * 6. 错误码降级作为兜底：如果预算制没拦住，仍然能捕获额度不足错误
 * 7. 降级状态持久化到 agent/data/model-fallback-state.json，跨进程共享
 * 8. 每次新采集周期（collect 命令启动）自动重置，从最优模型重新开始
 *
 * 千问（DashScope）免费模型轮转池（13个模型，共1300万Token）：
 *   按有效期临近度排序，有效期近的优先调用
 *   每个模型免费额度 100万Token，90天有效
 *
 * 豆包（火山方舟）模型降级链：
 *   doubao-1.5-pro-32k-250115 → doubao-1.5-lite-32k-250115
 *   （每个模型免费额度 50万Token）
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/* ── 降级链定义 ── */

export interface ModelBudget {
  /** 模型 ID */
  model: string
  /** 该模型免费 Token 额度 */
  freeQuota: number
  /** 有效期截止日 (ISO 8601)，用于排序优先级：临近过期的优先调用 */
  expiresAt?: string
  /**
   * POI 采集能力评分 (0~100)，用于同有效期时的排序：评分越高越优先调用
   *
   * 评分维度：中文理解 + 结构化 JSON 输出 + 指令遵循 + 事实准确性
   * 100 = 最强(Max系列)  90 = 优秀(Plus系列)  70~80 = 良好(Flash/大MoE)
   * 50~60 = 一般(中参数)  20~40 = 较弱(小参数)  10 = 最弱(7B/8B)
   */
  capability?: number
}

export interface ModelChain {
  /** 平台名称 */
  platform: string
  /** 模型轮转池（初始顺序不重要，运行时按有效期+性能排序） */
  budgets: ModelBudget[]
  /** 额度耗尽时的错误码/错误信息匹配模式（兜底） */
  exhaustedPatterns: RegExp[]
  /** 主动降级阈值（0~1，默认 0.9 即消耗90%时降级） */
  downgradeThreshold: number
}

/**
 * 千问免费模型轮转池
 *
 * 排序规则（代码自动执行，无需手动排序）：
 *   1. 临近有效期的模型优先调用（先用快过期的，避免浪费）
 *   2. 有效期相同时，POI采集能力越强越优先（capability 降序）
 *
 * expiresAt 来自阿里云百炼控制台实际有效期
 * capability 为 POI 采集能力评分（中文理解+JSON输出+指令遵循+事实准确性）
 *
 * 筛选规则：仅保留适合文本对话的模型，排除视觉(VL/OCR/QVQ)、代码(Coder)、
 *           数学(Math)、翻译(MT)、角色(Character)、GUI、意图检测等专用模型
 *
 * 共 75 个模型，总免费额度约 7500万Token
 */
export const QWEN_CHAIN: ModelChain = {
  platform: 'qwen',
  budgets: [
    // ══════════════════════════════════════════════════════
    // 有效期 2026/06/22 — 最早过期，先用这些！
    // ══════════════════════════════════════════════════════

    // ── 千问Max 系列（最强推理能力，cap=100）──
    { model: 'qwen3-max',                      freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 100 },
    { model: 'qwen3-max-2026-01-23',           freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 100 },
    { model: 'qwen3-max-preview',              freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 98 },
    { model: 'qwen3-max-2025-09-23',           freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 95 },

    // ── 千问3 235B 大模型（MoE 235B，cap=90）──
    { model: 'qwen3-235b-a22b-thinking-2507',  freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 92 },
    { model: 'qwen3-235b-a22b-instruct-2507',  freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 91 },
    { model: 'qwen3-235b-a22b',                freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 88 },

    // ── QwQ 推理增强（cap=85）──
    { model: 'qwq-plus',                       freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 85 },

    // ── 千问3.5 Plus 系列（主力性价比，cap=85）──
    { model: 'qwen3.5-plus',                   freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 85 },
    { model: 'qwen3.5-plus-2026-02-15',        freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 85 },

    // ── 千问3.5 大模型（MoE 架构）──
    { model: 'qwen3.5-397b-a17b',              freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 80 },
    { model: 'qwen3.5-122b-a10b',              freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 78 },
    { model: 'qwen3.5-27b',                    freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 65 },
    { model: 'qwen3.5-35b-a3b',                freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 62 },

    // ── 千问Plus 历史版本（越新 cap 越高）──
    { model: 'qwen-plus-latest',               freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 83 },
    { model: 'qwen-plus-2025-12-01',           freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 83 },
    { model: 'qwen-plus-2025-09-11',           freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 80 },
    { model: 'qwen-plus-2025-07-28',           freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 78 },
    { model: 'qwen-plus-2025-07-14',           freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 76 },
    { model: 'qwen-plus-2025-04-28',           freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 74 },
    { model: 'qwen-plus-2025-01-25',           freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 72 },
    { model: 'qwen-plus-0112',                 freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 70 },
    { model: 'qwen-plus-1220',                 freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 68 },

    // ── 千问3.5 Flash 系列（快速推理，cap=70）──
    { model: 'qwen3.5-flash',                  freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 70 },
    { model: 'qwen3.5-flash-2026-02-23',       freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 70 },

    // ── 千问3 30B/32B/14B/8B ──
    { model: 'qwen3-32b',                      freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 55 },
    { model: 'qwen3-30b-a3b-thinking-2507',    freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 58 },
    { model: 'qwen3-30b-a3b-instruct-2507',    freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 57 },
    { model: 'qwen3-30b-a3b',                  freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 52 },
    { model: 'qwen3-14b',                      freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 30 },
    { model: 'qwen3-8b',                       freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 15 },

    // ── 第三方：DeepSeek v3.x（cap=85~92，强推理+中文优）──
    { model: 'deepseek-v3.2-exp',              freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 88 },
    { model: 'deepseek-v3.2',                  freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 87 },
    { model: 'deepseek-v3.1',                  freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 84 },
    { model: 'deepseek-v3',                    freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 82 },
    // ── 第三方：DeepSeek R1（推理模型，速度慢但准确）──
    { model: 'deepseek-r1',                    freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 80 },
    { model: 'deepseek-r1-0528',               freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 78 },
    { model: 'deepseek-r1-distill-qwen-32b',   freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 50 },
    { model: 'deepseek-r1-distill-qwen-14b',   freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 28 },
    { model: 'deepseek-r1-distill-qwen-7b',    freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 10 },

    // ── 第三方：GLM（智谱，cap=70~82）──
    { model: 'glm-5',                          freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 78 },
    { model: 'glm-4.6',                        freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 72 },
    { model: 'glm-4.5',                        freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 68 },
    { model: 'glm-4.5-air',                    freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 60 },

    // ── 第三方：Kimi（月之暗面，cap=75~82）──
    { model: 'kimi-k2.5',                      freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 80 },
    { model: 'kimi-k2-thinking',               freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 75 },

    // ── 第三方：MiniMax（cap=65~70）──
    { model: 'MiniMax-M2.5',                   freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 70 },
    { model: 'MiniMax-M2.1',                   freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 62 },

    // ── 千问Flash 基础系列（cap=60）──
    { model: 'qwen-flash',                     freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 60 },
    { model: 'qwen-flash-2025-07-28',          freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 60 },

    // ── 千问3 Next（cap=75）──
    { model: 'qwen3-next-80b-a3b-thinking',    freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 77 },
    { model: 'qwen3-next-80b-a3b-instruct',    freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 76 },

    // ── 千问Long 系列（长上下文，cap=55）──
    { model: 'qwen-long',                      freeQuota: 999_980,   expiresAt: '2026-06-22', capability: 55 },
    { model: 'qwen-long-latest',               freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 55 },
    { model: 'qwen-long-2025-01-25',           freeQuota: 1_000_000, expiresAt: '2026-06-22', capability: 55 },

    // ── 千问Turbo（cap=40）──
    { model: 'qwen-turbo',                     freeQuota: 999_968,   expiresAt: '2026-06-22', capability: 40 },

    // ══════════════════════════════════════════════════════
    // 有效期 2026/07/02
    // ══════════════════════════════════════════════════════
    { model: 'qwen3.6-plus',                   freeQuota: 1_000_000, expiresAt: '2026-07-02', capability: 87 },
    { model: 'qwen3.6-plus-2026-04-02',        freeQuota: 1_000_000, expiresAt: '2026-07-02', capability: 87 },

    // ══════════════════════════════════════════════════════
    // 有效期 2026/07/14
    // ══════════════════════════════════════════════════════
    { model: 'glm-5.1',                        freeQuota: 1_000_000, expiresAt: '2026-07-14', capability: 82 },
    { model: 'glm-4.7',                        freeQuota: 1_000_000, expiresAt: '2026-07-14', capability: 74 },

    // ══════════════════════════════════════════════════════
    // 有效期 2026/07/17
    // ══════════════════════════════════════════════════════
    { model: 'qwen3.6-flash',                  freeQuota: 1_000_000, expiresAt: '2026-07-17', capability: 72 },
    { model: 'qwen3.6-flash-2026-04-16',       freeQuota: 1_000_000, expiresAt: '2026-07-17', capability: 72 },
    { model: 'qwen3.6-35b-a3b',                freeQuota: 1_000_000, expiresAt: '2026-07-17', capability: 64 },

    // ══════════════════════════════════════════════════════
    // 有效期 2026/07/20
    // ══════════════════════════════════════════════════════
    { model: 'qwen3.6-max-preview',            freeQuota: 1_000_000, expiresAt: '2026-07-20', capability: 98 },

    // ══════════════════════════════════════════════════════
    // 有效期 2026/07/21
    // ══════════════════════════════════════════════════════
    { model: 'kimi-k2.6',                      freeQuota: 1_000_000, expiresAt: '2026-07-21', capability: 84 },

    // ══════════════════════════════════════════════════════
    // 有效期 2026/07/23
    // ══════════════════════════════════════════════════════
    { model: 'qwen3.5-plus-2026-04-20',        freeQuota: 1_000_000, expiresAt: '2026-07-23', capability: 86 },
    { model: 'qwen3.6-27b',                    freeQuota: 1_000_000, expiresAt: '2026-07-23', capability: 66 },

    // ══════════════════════════════════════════════════════
    // 有效期 2026/07/24
    // ══════════════════════════════════════════════════════
    { model: 'deepseek-v4-pro',                freeQuota: 1_000_000, expiresAt: '2026-07-24', capability: 92 },
    { model: 'deepseek-v4-flash',              freeQuota: 1_000_000, expiresAt: '2026-07-24', capability: 75 },

    // ══════════════════════════════════════════════════════
    // 有效期 2026/08/20
    // ══════════════════════════════════════════════════════
    { model: 'qwen3.7-max',                    freeQuota: 1_000_000, expiresAt: '2026-08-20', capability: 100 },
    { model: 'qwen3.7-max-2026-05-20',         freeQuota: 1_000_000, expiresAt: '2026-08-20', capability: 100 },

    // ══════════════════════════════════════════════════════
    // 有效期 2026/08/24
    // ══════════════════════════════════════════════════════
    { model: 'qwen3.7-max-preview',            freeQuota: 1_000_000, expiresAt: '2026-08-24', capability: 99 },
    { model: 'qwen3.7-max-2026-05-17',         freeQuota: 1_000_000, expiresAt: '2026-08-24', capability: 99 },

    // ══════════════════════════════════════════════════════
    // 有效期 2026/09/01 — 最远，留到最后用
    // ══════════════════════════════════════════════════════
    { model: 'qwen3.7-plus',                   freeQuota: 1_000_000, expiresAt: '2026-09-01', capability: 93 },
    { model: 'qwen3.7-plus-2026-05-26',        freeQuota: 1_000_000, expiresAt: '2026-09-01', capability: 93 },
  ],
  exhaustedPatterns: [
    /AllocationQuota\.FreeTierOnly/i,
    /FreeTierOnly/i,
    /quota.*exceeded/i,
    /额度.*不足/i,
    /insufficient.*quota/i,
    /HTTP 4\d{2}.*quota/i,
    /HTTP 4\d{2}.*billing/i,
    /欠费/i,
    // ── 账户级欠费/欠费错误（2026-06-11 欠费事故后补充）──
    /Arrearage/i,                    // DashScope 欠费错误码
    /Access denied.*good standing/i, // DashScope 欠费提示语
    /overdue-payment/i,              // DashScope 欠费文档链接标识
    /account.*arrears/i,             // 通用欠费错误
    // ── 模型级限流错误（2026-06-11 429 后补充）──
    /has reached the set inference limit/i,
    /Safe Experience Mode/i,
    /model service has been paused/i,
    /HTTP 429.*limit/i,
    // ── 模型免费额度耗尽（2026-06-11 qwen3-max 403 后补充）──
    /free tier.*exhausted/i,
    /HTTP 403.*free.*tier/i,
    /use free tier only.*mode/i,
    // ── 模型端点不存在/不可用（2026-06-12 kimi-k2 404 后补充）──
    /does not exist.*do not have access/i,
    /HTTP 404.*does not exist/i,
  ],
  downgradeThreshold: 0.9,  // 90%使用率时降级
}

/**
 * 豆包免费模型轮转池
 *
 * 排序规则（代码自动执行）：
 *   1. 有效期相同时，POI采集能力越强越优先（capability 降序）
 *   2. 同 capability 时按模型名字典序
 *
 * 模型ID格式：火山方舟使用小写+连字符+日期后缀（如 doubao-seed-2-0-pro-260215）
 * freeQuota = 450,000（用户已设置限流 450K/500K 免费额度）
 * downgradeThreshold = 1.0（额度用完再切换，因已通过限流机制确保可控）
 *
 * 排除模型：vision（视觉）、Code（代码）、Character（角色）、Translation（翻译）、
 *           UI-TARS（GUI）、thinking-vision（视觉推理）
 * 排除已耗尽：Doubao-1.5-pro-32k（免费额度剩 0）
 *
 * 共 28 个模型，总免费额度约 1260万Token
 */
export const DOUBAO_CHAIN: ModelChain = {
  platform: 'doubao',
  budgets: [
    // ── DeepSeek 系列（第三方，中文强+结构化输出优）──
    // 模型ID格式：火山方舟 API 端点 ID（小写+连字符+日期后缀）
    { model: 'deepseek-v4-pro-260425',            freeQuota: 450_000, capability: 92 },
    { model: 'deepseek-v4-flash-260425',          freeQuota: 450_000, capability: 75 },
    { model: 'deepseek-v3-2-251201',              freeQuota: 450_000, capability: 87 },

    // ── Doubao Seed 2.0 系列（字节旗舰，最强文本生成）──
    { model: 'doubao-seed-2-0-pro-260215',        freeQuota: 450_000, capability: 90 },
    { model: 'doubao-seed-2-0-mini-260428',       freeQuota: 450_000, capability: 72 },
    { model: 'doubao-seed-2-0-lite-260428',       freeQuota: 450_000, capability: 65 },

    // ── Doubao Seed 1.8 系列 ──
    { model: 'doubao-seed-1-8-251228',            freeQuota: 450_000, capability: 80 },

    // ── Doubao Seed 1.6 系列 ──
    { model: 'doubao-seed-1-6-251015',            freeQuota: 450_000, capability: 68 },
    { model: 'doubao-seed-1-6-flash-250828',      freeQuota: 450_000, capability: 62 },

    // ── Doubao 1.5 系列（仅 lite 可用）──
    { model: 'doubao-1-5-lite-32k-250115',        freeQuota: 450_000, capability: 55 },

    // ── 第三方：GLM / Kimi ──
    { model: 'glm-4-7-251222',                    freeQuota: 450_000, capability: 74 },
    { model: 'kimi-k2-thinking-251104',           freeQuota: 450_000, capability: 78 },
  ],
  exhaustedPatterns: [
    /InsufficientQuota/i,
    /insufficient.*quota/i,
    /ResourceNotFound/i,
    /quota.*exceeded/i,
    /额度.*不足/i,
    /欠费/i,
    /HTTP 4\d{2}.*quota/i,
    /HTTP 4\d{2}.*billing/i,
    /account.*arrears/i,
    // ── 账户级欠费错误（2026-06-11 欠费事故后补充）──
    /Arrearage/i,
    /Access denied.*good standing/i,
    /overdue-payment/i,
    // ── 模型级限流错误（2026-06-11 429 Safe Experience Mode 后补充）──
    /has reached the set inference limit/i,
    /Safe Experience Mode/i,
    /model service has been paused/i,
    /HTTP 429.*limit/i,
    // ── 模型免费额度耗尽（2026-06-11 补充）──
    /free tier.*exhausted/i,
    /HTTP 403.*free.*tier/i,
    /use free tier only.*mode/i,
    // ── 模型端点不存在/不可用（2026-06-12 kimi-k2 404 后补充）──
    /does not exist.*do not have access/i,
    /HTTP 404.*does not exist/i,
  ],
  downgradeThreshold: 1.0,  // 100%使用率时降级（用完再换）
}

/* ── 持久化状态 ── */

interface TokenUsage {
  /** 每个模型累计消耗的 Token 数 */
  [model: string]: number
}

interface FallbackState {
  /** 每个平台当前使用的模型索引 */
  currentIndex: Record<string, number>
  /** 每个平台已耗尽的模型集合 */
  exhaustedModels: Record<string, string[]>
  /** 每个平台各模型累计 Token 消耗 */
  tokenUsage: Record<string, TokenUsage>
  /** 上次全额重置的月份（格式 'YYYY-MM'，如 '2026-06'） */
  lastFullResetMonth: Record<string, string>
  /** 状态更新时间 */
  updatedAt: string
}

const STATE_PATH = path.join(__dirname, 'data', 'model-fallback-state.json')

function loadState(): FallbackState {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'))
      // 兼容旧状态文件：补齐 lastFullResetMonth 字段
      if (!s.lastFullResetMonth) s.lastFullResetMonth = {}
      return s
    }
  } catch { /* ignore */ }
  return {
    currentIndex: {},
    exhaustedModels: {},
    tokenUsage: {},
    lastFullResetMonth: {},
    updatedAt: new Date().toISOString(),
  }
}

function saveState(state: FallbackState): void {
  state.updatedAt = new Date().toISOString()
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8')
}

/* ── 降级器 ── */

export class ModelFallback {
  private chain: ModelChain
  private state: FallbackState
  /** 按优先级排序后的模型列表 */
  private sortedBudgets: ModelBudget[]

  constructor(chain: ModelChain) {
    // 按有效期 + 性能排序模型列表
    this.sortedBudgets = this._sortBudgets(chain.budgets)
    this.chain = chain
    this.state = loadState()
    // 初始化平台状态
    const p = this.chain.platform
    if (!(p in this.state.currentIndex)) this.state.currentIndex[p] = 0
    if (!(p in this.state.exhaustedModels)) this.state.exhaustedModels[p] = []
    if (!(p in this.state.tokenUsage)) this.state.tokenUsage[p] = {}
  }

  /**
   * 排序策略：
   *   1. 临近有效期的模型优先（先用快过期的，避免浪费）
   *   2. 有效期相同时，POI 采集能力评分越高越优先（capability 降序）
   */
  private _sortBudgets(budgets: ModelBudget[]): ModelBudget[] {
    return [...budgets].sort((a, b) => {
      const aExp = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity
      const bExp = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity

      // 规则1：有效期近的优先
      if (aExp !== bExp) return aExp - bExp

      // 规则2：有效期相同时，POI采集能力越强越优先（capability 降序）
      const aCap = a.capability ?? 50
      const bCap = b.capability ?? 50
      if (aCap !== bCap) return bCap - aCap

      // 兜底：同 capability 时按模型名字典序，保证排序稳定
      return a.model.localeCompare(b.model)
    })
  }

  /** 获取当前应使用的模型名 */
  get currentModel(): string {
    const idx = this.state.currentIndex[this.chain.platform] ?? 0
    return this.sortedBudgets[Math.min(idx, this.sortedBudgets.length - 1)].model
  }

  /** 获取当前模型索引 */
  get currentIndex(): number {
    return this.state.currentIndex[this.chain.platform] ?? 0
  }

  /** 是否所有模型都已耗尽 */
  get isExhausted(): boolean {
    return this.currentIndex >= this.sortedBudgets.length
  }

  /** 获取当前模型的累计 Token 消耗 */
  getTokenUsage(): number {
    const p = this.chain.platform
    const model = this.currentModel
    return this.state.tokenUsage[p]?.[model] ?? 0
  }

  /** 获取当前模型的免费额度 */
  getFreeQuota(): number {
    const idx = this.state.currentIndex[this.chain.platform] ?? 0
    return this.sortedBudgets[Math.min(idx, this.sortedBudgets.length - 1)].freeQuota
  }

  /** 获取当前模型剩余可用比例 (0~1) */
  getRemainingRatio(): number {
    const used = this.getTokenUsage()
    const quota = this.getFreeQuota()
    return quota > 0 ? Math.max(0, 1 - used / quota) : 1
  }

  /** 获取排序后的模型列表（调试用） */
  getModelChain(): string[] {
    return this.sortedBudgets.map(b => {
      const exp = b.expiresAt ? ` (到期: ${b.expiresAt})` : ''
      return `${b.model}${exp}`
    })
  }

  /**
   * 报告本次 API 调用的 Token 消耗
   * 在 API 调用成功后调用，会检查是否达到降级阈值
   *
   * @param totalTokens 本次消耗的 Token 总数（prompt + completion）
   * @returns 如果触发主动降级，返回降级信息；否则返回 null
   */
  reportUsage(totalTokens: number): { degraded: boolean; newModel?: string } | null {
    if (totalTokens <= 0) return null

    const p = this.chain.platform
    const model = this.currentModel

    // 累加 Token 消耗
    if (!this.state.tokenUsage[p]) this.state.tokenUsage[p] = {}
    if (!this.state.tokenUsage[p][model]) this.state.tokenUsage[p][model] = 0
    this.state.tokenUsage[p][model] += totalTokens

    const used = this.state.tokenUsage[p][model]
    const quota = this.getFreeQuota()
    const ratio = used / quota

    // 超过阈值 → 主动降级
    if (ratio >= this.chain.downgradeThreshold) {
      const oldIdx = this.state.currentIndex[p] ?? 0

      // 记录已耗尽模型
      if (!this.state.exhaustedModels[p].includes(model)) {
        this.state.exhaustedModels[p].push(model)
      }

      const newIdx = oldIdx + 1
      this.state.currentIndex[p] = newIdx
      saveState(this.state)

      if (newIdx >= this.sortedBudgets.length) {
        console.error(
          `[ModelFallback] ${p}: 模型 ${model} 已用 ${this._fmtTokens(used)}/${this._fmtTokens(quota)} (${(ratio * 100).toFixed(0)}%)，` +
          `所有模型额度即将耗尽！该渠道将停止采集。`
        )
        return { degraded: true, newModel: undefined }
      }

      const newModel = this.sortedBudgets[newIdx].model
      console.warn(
        `[ModelFallback] ${p}: 模型 ${model} 已用 ${this._fmtTokens(used)}/${this._fmtTokens(quota)} (${(ratio * 100).toFixed(0)}%)，` +
        `主动降级为 ${newModel}`
      )
      return { degraded: true, newModel }
    }

    // 50% 首次警告（只在跨越50%时触发一次）
    const prevRatio = (used - totalTokens) / quota
    if (prevRatio < 0.5 && ratio >= 0.5) {
      console.warn(
        `[ModelFallback] ${p}: 模型 ${model} 已用 ${this._fmtTokens(used)}/${this._fmtTokens(quota)} (${(ratio * 100).toFixed(0)}%)`
      )
    }

    saveState(this.state)
    return null
  }

  /**
   * 检查错误是否为额度耗尽（兜底机制）
   * @returns true 表示已降级，调用方应用新模型重试；false 表示不是额度问题
   */
  handleApiError(error: unknown): { degraded: boolean; newModel?: string } {
    const errorMsg = error instanceof Error ? error.message : String(error)

    const isQuotaError = this.chain.exhaustedPatterns.some(p => p.test(errorMsg))
    if (!isQuotaError) {
      return { degraded: false }
    }

    const p = this.chain.platform
    const oldIdx = this.state.currentIndex[p] ?? 0
    const oldModel = this.sortedBudgets[Math.min(oldIdx, this.sortedBudgets.length - 1)].model

    // 记录已耗尽模型
    if (!this.state.exhaustedModels[p].includes(oldModel)) {
      this.state.exhaustedModels[p].push(oldModel)
    }

    const newIdx = oldIdx + 1
    this.state.currentIndex[p] = newIdx
    saveState(this.state)

    if (newIdx >= this.sortedBudgets.length) {
      console.error(
        `[ModelFallback] ${p}: 所有模型额度已耗尽！` +
        `已尝试: ${this.sortedBudgets.map(b => b.model).join(' → ')}，` +
        `该渠道将停止采集。请前往控制台充值或等待免费额度刷新。`
      )
      return { degraded: true, newModel: undefined }
    }

    const newModel = this.sortedBudgets[newIdx].model
    console.warn(
      `[ModelFallback] ${p}: 模型 ${oldModel} 返回额度不足错误，降级为 ${newModel}`
    )
    return { degraded: true, newModel }
  }

  /**
   * 判断是否需要在月度额度刷新日（每月23日）执行全额重置
   * 千问渠道每月23日刷新免费额度，豆包渠道无固定刷新日（不重置）
   */
  private _needsMonthlyReset(): boolean {
    // 仅千问渠道有月度刷新机制
    if (this.chain.platform !== 'qwen') return false

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const lastReset = this.state.lastFullResetMonth[this.chain.platform]

    // 从未重置过，或当前月份已过刷新日且未重置
    if (!lastReset || lastReset < currentMonth) {
      // 当前日期 >= 23 日，说明额度已刷新
      if (now.getDate() >= 23) {
        return true
      }
    }
    return false
  }

  /**
   * 重置降级状态（新采集周期开始时调用）
   *
   * 关键行为变更：Token 计数不再每次清零！
   * - Token 计数跨会话持久累积，与 DashScope/火山方舟实际消耗一致
   * - 仅在月度额度刷新日（千问每月23日）才全额清零
   * - 模型索引重置到0，但如果前面的模型已耗尽则跳过
   */
  reset(): void {
    const p = this.chain.platform

    // 1. 月度刷新检查：如果到了刷新日，全额清零
    if (this._needsMonthlyReset()) {
      const currentMonth = (() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      })()
      this.state.lastFullResetMonth[p] = currentMonth
      this.state.currentIndex[p] = 0
      this.state.exhaustedModels[p] = []
      this.state.tokenUsage[p] = {}
      this.sortedBudgets = this._sortBudgets(this.chain.budgets)
      saveState(this.state)
      console.log(
        `[ModelFallback] ${p}: 月度额度刷新（${currentMonth}-23），Token计数清零，从最优模型 ${this.sortedBudgets[0].model} 重新开始`
      )
      return
    }

    // 2. 常规重置：重排模型 + 回到索引0，但保留 Token 计数
    this.sortedBudgets = this._sortBudgets(this.chain.budgets)

    // 重置模型索引到0（重新从最优模型尝试）
    this.state.currentIndex[p] = 0
    // 基于 Token 消耗重新计算耗尽列表（保留真正耗尽的模型，而非全部清空）
    // 已消耗 >= 90% freeQuota 的模型视为耗尽，不参与重置后的尝试
    const prevExhausted = this.state.exhaustedModels[p] ?? []
    const tokenBasedExhausted = this.sortedBudgets
      .filter(b => {
        const used = this.state.tokenUsage[p]?.[b.model] ?? 0
        return used >= b.freeQuota * (this.chain.downgradeThreshold ?? 0.9)
      })
      .map(b => b.model)
    // 合并：token 判定耗尽 + 之前手动标记耗尽（如 thinking 模型超时）
    this.state.exhaustedModels[p] = [...new Set([...tokenBasedExhausted, ...prevExhausted])]
    // 找到第一个未耗尽的模型索引
    const firstValidIdx = this.sortedBudgets.findIndex(b => !this.state.exhaustedModels[p].includes(b.model))
    if (firstValidIdx > 0) this.state.currentIndex[p] = firstValidIdx
    // ⚠️ Token 计数不清零！跨会话持久累积
    // this.state.tokenUsage[p] = {}  // ← 旧逻辑：每次清零，导致欠费

    saveState(this.state)

    const used = this.state.tokenUsage[p]
    const usedSummary = Object.keys(used).length > 0
      ? Object.entries(used).map(([m, t]) => `${m}=${this._fmtTokens(t)}`).join(', ')
      : '无消耗'
    console.log(
      `[ModelFallback] ${p}: 重置降级状态（Token计数保留：${usedSummary}），从最优模型 ${this.sortedBudgets[0].model} 开始`
    )
  }

  /** 获取降级状态摘要 */
  getSummary(): string {
    const p = this.chain.platform
    const idx = this.state.currentIndex[p] ?? 0
    const current = this.sortedBudgets[Math.min(idx, this.sortedBudgets.length - 1)].model
    const used = this.getTokenUsage()
    const quota = this.getFreeQuota()
    const ratio = quota > 0 ? (used / quota * 100).toFixed(0) : '0'
    const exhausted = this.state.exhaustedModels[p] ?? []
    const exhaustedStr = exhausted.length > 0 ? ` (已耗尽: ${exhausted.join(', ')})` : ''
    const chainStr = this.sortedBudgets.map((b, i) => i === idx ? `▶${b.model}` : b.model).join(' → ')
    return `${p}: 当前=${current}, Token=${this._fmtTokens(used)}/${this._fmtTokens(quota)} (${ratio}%)${exhaustedStr}\n  链路: ${chainStr}`
  }

  /** 格式化 Token 数 */
  private _fmtTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
    return `${n}`
  }
}

/* ── 全局单例 ── */

let _qwenFallback: ModelFallback | null = null
let _doubaoFallback: ModelFallback | null = null

export function getQwenFallback(): ModelFallback {
  if (!_qwenFallback) {
    _qwenFallback = new ModelFallback(QWEN_CHAIN)
  }
  return _qwenFallback
}

export function getDoubaoFallback(): ModelFallback {
  if (!_doubaoFallback) {
    _doubaoFallback = new ModelFallback(DOUBAO_CHAIN)
  }
  return _doubaoFallback
}

/**
 * 重置所有降级状态（新采集周期开始时调用）
 */
export function resetAllFallbacks(): void {
  getQwenFallback().reset()
  getDoubaoFallback().reset()
}

/**
 * 获取所有平台的降级状态摘要
 */
export function getFallbackSummary(): string {
  return [
    getQwenFallback().getSummary(),
    getDoubaoFallback().getSummary(),
  ].join('\n')
}
