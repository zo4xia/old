/* @qh-core LANE=B-V2 POINT=VALIDATE 板书串行校验（防并行回归的机器断言）
 * 对应提示词的板书串行铁律：同一时刻只有一件事——板书写完一行再写下一行，
 * 板书与动作绝对互斥，动作在板书写完后按 order 串行执行；行与行之间单手不并行。
 *
 * 定位（融合裁决报告 4.3 第 5 项）：22 分支删除了原双检，本模块在 22 分支侧
 * 重新补上这道保险丝——纯函数、机器可判、只拦真违规：
 *   - 行内：手部事件（board / action）两两不重叠，按时间严格串行；
 *   - 行间：相邻两行的手部工作窗（全局坐标）不并行；
 *   - 事件字段损坏（start/end 非法数值）视为排程产物损坏，同样拦截。
 * 口播（speech）与手部工作并行是合法的（嘴和手），不参与互斥校验。
 * 报错信息必须指明第几行、哪个事件、时间区间，让人一眼看懂错在哪一行。
 */

const HAND_EVENT_TYPES = new Set(['board', 'action'])
const HAND_LIFT_GAP_MS = 600 // 与 timing.js 的抬笔换手间隔一致

function previewText(text, max = 24) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/** 人类可读的事件描述：板书/动作 + 时间区间 + 内容摘要 */
function describeEvent(evt, evtIndex) {
  if (evt.type === 'board') {
    return `第 ${evtIndex + 1} 个板书事件 board「${previewText(evt.content)}」[${fmt(evt.startOffsetMs)}ms → ${fmt(evt.endOffsetMs)}ms]`
  }
  const act = evt.action?.action || evt.action
  const actName = act?.tool ? `${act.tool}${act.action ? '/' + act.action : ''}` : JSON.stringify(act)?.slice(0, 40)
  return `第 ${evtIndex + 1} 个动作事件 action(${actName}) [${fmt(evt.startOffsetMs)}ms → ${fmt(evt.endOffsetMs)}ms]`
}

function fmt(v) {
  return Number.isFinite(v) ? String(Math.round(v)) : '非数值'
}

/**
 * 取某一行的手部事件（board / action），按 startOffsetMs 升序。
 * 没有排程产物（缺 exclusiveExecutionPlan）的行直接放行——校验器只拦真违规，
 * 不替缺字段的路（如纯口播行）设门槛。
 */
function collectHandEvents(plan) {
  if (!Array.isArray(plan)) return []
  return plan
    .filter((evt) => evt && HAND_EVENT_TYPES.has(evt.type))
    .sort((a, b) => (a.startOffsetMs ?? 0) - (b.startOffsetMs ?? 0))
}

/** 校验单行：手部事件两两不重叠（prev.endOffsetMs <= next.startOffsetMs 即合法串行） */
function validateRowPlan(rowIndex, plan, violations) {
  const events = collectHandEvents(plan)
  for (const evt of events) {
    if (!Number.isFinite(evt.startOffsetMs) || !Number.isFinite(evt.endOffsetMs)) {
      violations.push(`第 ${rowIndex + 1} 行（index ${rowIndex}）：${describeEvent(evt, events.indexOf(evt))} 的 startOffsetMs/endOffsetMs 不是合法数值，排程产物已损坏`)
      return
    }
    if (evt.startOffsetMs < 0 || evt.endOffsetMs < evt.startOffsetMs) {
      violations.push(`第 ${rowIndex + 1} 行（index ${rowIndex}）：${describeEvent(evt, events.indexOf(evt))} 时间区间非法（起点为负或终点早于起点）`)
      return
    }
  }
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1]
    const curr = events[i]
    if (prev.endOffsetMs > curr.startOffsetMs) {
      violations.push(
        `第 ${rowIndex + 1} 行（index ${rowIndex}）出现并行手部操作：` +
        `${describeEvent(prev, i - 1)} 与 ${describeEvent(curr, i)} 时间重叠 ${Math.round(prev.endOffsetMs - curr.startOffsetMs)}ms——` +
        `板书/动作必须一行写完再做下一件，单手串行不可并行`,
      )
    }
  }
}

/**
 * 校验行间不并行：相邻两行的手部工作窗（全局坐标）不得重叠。
 * 全局起点取自 applyAgentBV2Timeline 写入的 rowTimeline.globalStartMs；
 * 行的手部最早/最晚事件换算成全局坐标后，上一行必须完全结束并抬笔后，下一行才可落笔。
 */
function validateCrossRows(rows, violations) {
  let prevHand = null // { rowIndex, globalStartMs, globalEndMs, firstDesc, lastDesc }
  for (let i = 0; i < rows.length; i++) {
    const tl = rows[i]?.rowTimeline
    const events = collectHandEvents(tl?.exclusiveExecutionPlan)
    if (events.length === 0) continue
    const baseMs = Number(tl?.globalStartMs)
    if (!Number.isFinite(baseMs)) {
      violations.push(`第 ${i + 1} 行（index ${i}）：rowTimeline.globalStartMs 缺失或非数值，无法核对行间串行`)
      continue
    }
    const first = events[0]
    const last = events[events.length - 1]
    const globalHandStart = baseMs + first.startOffsetMs
    const globalHandEnd = baseMs + last.endOffsetMs
    if (prevHand && prevHand.globalHandEnd > globalHandStart) {
      violations.push(
        `第 ${prevHand.rowIndex + 1} 行与第 ${i + 1} 行（index ${prevHand.rowIndex} / ${i}）板书并行：` +
        `上一行手部工作（全局 ${Math.round(prevHand.globalHandStart)}ms → ${Math.round(prevHand.globalHandEnd)}ms）` +
        `与下一行手部工作（全局 ${Math.round(globalHandStart)}ms 起）重叠 ${Math.round(prevHand.globalHandEnd - globalHandStart)}ms——` +
        `必须上一行写完并抬笔（≥${HAND_LIFT_GAP_MS}ms 间隔）后再写下一行`,
      )
    }
    prevHand = { rowIndex: i, globalHandStart, globalHandEnd }
  }
}

/**
 * 板书串行校验主入口（纯函数）。
 * @param {Array} rows 经 applyAgentBV2Timeline 处理后的行数组
 * @returns {string[]} 违规清单（空数组 = 全部合法，放行）
 */
export function validateBoardSerialRows(rows) {
  const violations = []
  if (!Array.isArray(rows)) return violations
  for (let i = 0; i < rows.length; i++) {
    const plan = rows[i]?.rowTimeline?.exclusiveExecutionPlan ?? rows[i]?.exclusiveExecutionPlan
    validateRowPlan(i, plan, violations)
  }
  validateCrossRows(rows, violations)
  return violations
}

/**
 * 生成出口的阻断式断言：有真违规立即抛错「当场拦」，不靠人眼盯。
 * @param {Array} rows 经 applyAgentBV2Timeline 处理后的行数组
 * @throws {Error} 违规清单非空时，抛出逐条可读的报错
 */
export function assertBoardSerialRows(rows) {
  const violations = validateBoardSerialRows(rows)
  if (violations.length > 0) {
    throw new Error(
      `板书串行校验未通过（${violations.length} 处违规，已拦截本次生成）：\n- ` +
      violations.join('\n- '),
    )
  }
  return rows
}
