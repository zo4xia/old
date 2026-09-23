/* 板书串行校验 validateBoardSerialRows 冒烟测试
 * 正反两组用例：合法串行输出必须放行（0 违规），真违规必须拦下且报错指认行号。
 * 运行：node scripts/test-validate-board-serial.mjs（由 run-all-tests.mjs 统一调度）
 */
import { applyAgentBV2Timeline } from '../src/agent-b-v2/timing.js'
import {
  validateBoardSerialRows,
  assertBoardSerialRows,
} from '../src/agent-b-v2/validateBoardSerialRows.js'

let passed = 0
let failed = 0
const failures = []

function check(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failures.push(`${name}${detail ? ' — ' + detail : ''}`)
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

/** 从排程产物中找指定类型第 n 个手部事件的下标 */
function findHandEvent(plan, type, nth = 0) {
  const idxs = plan.map((e, i) => (e && (e.type === type) ? i : -1)).filter((i) => i >= 0)
  return idxs[nth]
}

console.log('== 正例：合法串行输出必须放行 ==')

// 正例 1：纯板书行（经真实排程管线产出）
{
  const rows = applyAgentBV2Timeline([{ speech: '我们来看这道题。', board: { content: '12+34=46' } }])
  const v = validateBoardSerialRows(rows)
  check('正例1 纯板书行放行', v.length === 0, `违规: ${JSON.stringify(v)}`)
}

// 正例 2：板书+动作 模式 B（板书写完 → 抬手 → 动作串行）
{
  const row = {
    speech: '先列竖式，再把关键步骤圈出来，注意进位。',
    board: { content: '36+48=84' },
    actionSpec: [
      { action: { tool: 'rough-notation', action: 'circle', target: { region: 'board', anchorText: '84' } } },
      { action: { tool: 'rough-notation', action: 'underline', target: { region: 'board', anchorText: '36+48' } } },
    ],
  }
  const rows = applyAgentBV2Timeline([row])
  const v = validateBoardSerialRows(rows)
  check('正例2 板书+动作（模式B）放行', v.length === 0, `违规: ${JSON.stringify(v)}`)
}

// 正例 3：题目行动作前置 模式 A（动作 → 抬手 → 板书），同为合法串行
{
  const row = {
    stage: '题目',
    speech: '把题目里的已知条件圈出来，再抄到黑板上。',
    board: { content: '小明有36颗糖' },
    actionSpec: [
      { action: { tool: 'rough-notation', action: 'circle', target: { region: 'question', anchorText: '36颗' } } },
    ],
  }
  const rows = applyAgentBV2Timeline([row])
  const v = validateBoardSerialRows(rows)
  check('正例3 题目行动作前置（模式A）放行', v.length === 0, `违规: ${JSON.stringify(v)}`)
}

// 正例 4：多行串联（行间经 rowGapMs 隔开，全局不并行）
{
  const rows = applyAgentBV2Timeline([
    { speech: '第一步，读题。', board: { content: '36+48' } },
    { speech: '第二步，算个位。', board: { content: '6+8=14' }, actionSpec: [{ action: { tool: 'rough-notation', action: 'circle', target: { region: 'board', anchorText: '14' } } }] },
    { speech: '第三步，算十位。', board: { content: '3+4+1=8' } },
    { speech: '所以答案是84。' },
  ])
  const v = validateBoardSerialRows(rows)
  check('正例4 多行串联放行（含纯口播行）', v.length === 0, `违规: ${JSON.stringify(v)}`)
}

// 正例 5：空数组与无排程产物行放行（校验器只拦真违规，不设门槛）
{
  check('正例5a 空数组放行', validateBoardSerialRows([]).length === 0)
  check('正例5b 缺排程产物行放行', validateBoardSerialRows([{ speech: '纯口播' }]).length === 0)
  check('正例5c 非数组输入放行', validateBoardSerialRows(undefined).length === 0)
}

// 正例 6：零间隔串行（prev.end === next.start，无重叠）仍合法
{
  const rows = [{
    rowTimeline: {
      globalStartMs: 0,
      exclusiveExecutionPlan: [
        { type: 'speech', role: 'narration_full', startOffsetMs: 0, durationMs: 5000, endOffsetMs: 5000, text: 'x' },
        { type: 'board', role: 'writing', startOffsetMs: 800, durationMs: 1200, endOffsetMs: 2000, content: '板书A' },
        { type: 'action', role: 'punctuation_pause', index: 0, startOffsetMs: 2000, durationMs: 1200, endOffsetMs: 3200, action: { tool: 'rough-line' } },
      ],
    },
  }]
  const v = validateBoardSerialRows(rows)
  check('正例6 零间隔串行（边界贴合）放行', v.length === 0, `违规: ${JSON.stringify(v)}`)
}

// 正例 7：assertBoardSerialRows 对合法输出原样返回，不抛错
{
  const rows = applyAgentBV2Timeline([{ speech: '口播', board: { content: '板书' } }])
  let threw = false
  try { assertBoardSerialRows(rows) } catch { threw = true }
  check('正例7 assert 合法输出不抛错', !threw)
}

console.log('== 反例：真违规必须拦下且报错指认行号 ==')

// 反例 1：行内两个板书事件并行一排（第二个没等第一行写完就开写）
{
  const rows = [{
    rowTimeline: {
      globalStartMs: 0,
      exclusiveExecutionPlan: [
        { type: 'speech', role: 'narration_full', startOffsetMs: 0, durationMs: 9000, endOffsetMs: 9000, text: 'x' },
        { type: 'board', role: 'writing', startOffsetMs: 800, durationMs: 4000, endOffsetMs: 4800, content: '第一行板书' },
        { type: 'board', role: 'writing', startOffsetMs: 3000, durationMs: 3000, endOffsetMs: 6000, content: '第二行板书' },
      ],
    },
  }]
  const v = validateBoardSerialRows(rows)
  check('反例1 并行板书被拦', v.length >= 1, `违规数: ${v.length}`)
  check('反例1 报错指认第 1 行', v.some((m) => m.includes('第 1 行')), JSON.stringify(v))
  check('反例1 报错含重叠毫秒数', v.some((m) => m.includes('1800ms')), JSON.stringify(v))
}

// 反例 2：动作与板书重叠（模式 B 被破坏，动作提前开跑）
{
  const rows = applyAgentBV2Timeline([{
    speech: '板书写完再圈重点。',
    board: { content: '36+48=84' },
    actionSpec: [{ action: { tool: 'rough-notation', action: 'circle', target: { region: 'board', anchorText: '84' } } }],
  }])
  const plan = rows[0].rowTimeline.exclusiveExecutionPlan
  const actIdx = findHandEvent(plan, 'action')
  const boardIdx = findHandEvent(plan, 'board')
  plan[actIdx].startOffsetMs = plan[boardIdx].startOffsetMs + 100 // 动作钻进板书区间
  plan[actIdx].endOffsetMs = plan[actIdx].startOffsetMs + 1200
  const v = validateBoardSerialRows(rows)
  check('反例2 动作与板书重叠被拦', v.length >= 1, `违规数: ${v.length}`)
  check('反例2 报错指认第 1 行', v.some((m) => m.includes('第 1 行')), JSON.stringify(v))
  check('反例2 报错含「并行手部操作」', v.some((m) => m.includes('并行手部操作')), JSON.stringify(v))
}

// 反例 3：行间并行（第 2 行没等第 1 行写完就开写）
{
  const rows = [
    { rowTimeline: { globalStartMs: 0, exclusiveExecutionPlan: [
      { type: 'board', role: 'writing', startOffsetMs: 800, durationMs: 5000, endOffsetMs: 5800, content: '上一行板书' },
    ] } },
    { rowTimeline: { globalStartMs: 3000, exclusiveExecutionPlan: [
      { type: 'board', role: 'writing', startOffsetMs: 500, durationMs: 3000, endOffsetMs: 3500, content: '下一行板书' },
    ] } },
  ]
  const v = validateBoardSerialRows(rows)
  check('反例3 行间板书并行被拦', v.length >= 1, `违规数: ${v.length}`)
  check('反例3 报错指认第 1 行与第 2 行', v.some((m) => m.includes('第 1 行') && m.includes('第 2 行')), JSON.stringify(v))
  check('反例3 报错提示抬笔间隔', v.some((m) => m.includes('抬笔')), JSON.stringify(v))
}

// 反例 4：事件时间区间损坏（终点早于起点）
{
  const rows = [{ rowTimeline: { globalStartMs: 0, exclusiveExecutionPlan: [
    { type: 'board', role: 'writing', startOffsetMs: 800, durationMs: 4000, endOffsetMs: 200, content: '损坏板书' },
  ] } }]
  const v = validateBoardSerialRows(rows)
  check('反例4 时间区间损坏被拦', v.length >= 1, `违规数: ${v.length}`)
  check('反例4 报错指认第 1 行', v.some((m) => m.includes('第 1 行')), JSON.stringify(v))
}

// 反例 5：assertBoardSerialRows 必须抛错且错误信息含全部违规（生成出口「当场拦」）
{
  const rows = [{ rowTimeline: { globalStartMs: 0, exclusiveExecutionPlan: [
    { type: 'board', role: 'writing', startOffsetMs: 800, durationMs: 4000, endOffsetMs: 4800, content: 'A' },
    { type: 'board', role: 'writing', startOffsetMs: 1000, durationMs: 3000, endOffsetMs: 4000, content: 'B' },
  ] } }]
  let threw = false
  let msg = ''
  try { assertBoardSerialRows(rows) } catch (e) { threw = true; msg = e.message }
  check('反例5 assert 违规输出抛错', threw)
  check('反例5 错误信息含「板书串行校验未通过」与行号', msg.includes('板书串行校验未通过') && msg.includes('第 1 行'), msg)
}

console.log('')
if (failed > 0) {
  console.log(`validateBoardSerialRows 冒烟失败：${failed} 项未过`)
  console.log(failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
console.log(`板书串行校验 validateBoardSerialRows 冒烟通过 ${passed}/${passed + failed}（正例放行 + 反例拦截 + 报错指认行号）`)
