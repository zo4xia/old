/* 播放器输入唯一收敛（2026-09-22 R2-1/R2-2/R3-1，台账只增不改）：
   把存档 deliverable payload 收敛为与用户 16:46 DEMO-PARALLEL 样例逐字段同构的干净输入：
   顶层只有四键 projectCode / problemText / boardPlan / rows；
   rows 行内六字段 stage / mp3 / duration / speech / board{startDelay, region, content} / actionSpec
   （包裹式 {action:{tool, action, target, options, order}}，工具仅 rough-notation 的 circle+underline）。
   存档文件格式不动；本函数只服务「喂给播放器」这条消费路径
   （server/renderDeliverableHtml.js 注入 + GET /api/deliverable?view=player）。 */

export const STAGE_ZONE_KEY = { '题目': 'question', '分析': 'analysis', '解答': 'solution', '总结': 'summary' }
const ZONE_KEYS = ['question', 'analysis', 'solution', 'summary']

function isAudioSrc(v) {
  return typeof v === 'string' && v.trim() !== ''
}

/* actionSpec 双形态归一：包裹式 {action:{...}} 或扁平旧式 {...} → 一律输出包裹式；
   内层只保留契约五键 tool/action/target/options/order（值原样透传）。 */
function toWrappedAction(entry) {
  if (!entry || typeof entry !== 'object') return null
  const inner = (entry.action && typeof entry.action === 'object') ? entry.action : entry
  const out = {}
  if (inner.tool != null) out.tool = inner.tool
  if (inner.action != null) out.action = inner.action
  if (inner.target != null) out.target = inner.target
  if (inner.options != null) out.options = inner.options
  if (inner.order != null) out.order = inner.order
  return { action: out }
}

function pickZone(zone) {
  if (!zone || typeof zone !== 'object') return null
  const z = {}
  let has = false
  for (const k of ['x', 'y', 'w', 'h']) {
    if (zone[k] != null) { z[k] = zone[k]; has = true }
  }
  return has ? z : null
}

export function buildPlayerInput(payload) {
  const p = (payload && typeof payload === 'object') ? payload : {}
  const h = (p.handoff && typeof p.handoff === 'object') ? p.handoff : {}
  const src = p.boardPlan || h.boardPlan || p.zoneAnchors || h.zoneAnchors || null
  const boardPlan = { canvas: { w: 1726, h: 980 } }
  if (src && src.canvas && typeof src.canvas === 'object' && src.canvas.w != null) {
    boardPlan.canvas = { w: src.canvas.w, h: src.canvas.h }
  }
  for (const k of ZONE_KEYS) {
    const z = pickZone(src && src[k])
    if (z) boardPlan[k] = z
  }
  // 带图题保留落座定义（样例无图 → 不输出该键，与样例逐字段零差异）
  if (src && src.image) boardPlan.image = src.image

  const rows = (Array.isArray(p.rows) ? p.rows : []).map((r, idx) => {
    const row = (r && typeof r === 'object') ? r : {}
    const b = (row.board && typeof row.board === 'object') ? row.board : {}
    const stage = row.stage || (idx === 0 ? '题目' : '分析')
    const region = (typeof b.region === 'string' && ZONE_KEYS.includes(b.region))
      ? b.region
      : (STAGE_ZONE_KEY[stage] || 'analysis')
    const mp3Raw = [row.mp3, row.audioUrl, row.audio].find(isAudioSrc)
    let duration = row.duration
    if (!(typeof duration === 'number' && duration > 0)) {
      const ms = Number(row.estimatedDurationMs) || Number(row.audioDurationMs)
      duration = ms > 0 ? Math.round(ms / 100) / 10 : 0
    }
    const startDelay = (typeof b.startDelay === 'number' && b.startDelay >= 0) ? b.startDelay : 0
    return {
      stage,
      mp3: mp3Raw ? String(mp3Raw).trim() : '',
      duration,
      speech: row.speech != null ? String(row.speech) : '',
      board: { startDelay, region, content: b.content != null ? String(b.content) : '' },
      actionSpec: (Array.isArray(row.actionSpec) ? row.actionSpec : [])
        .map(toWrappedAction).filter(Boolean),
    }
  })

  return {
    projectCode: p.projectCode || h.projectCode || '',
    problemText: p.problemText != null ? String(p.problemText) : String(h.problemText || ''),
    boardPlan,
    rows,
  }
}
