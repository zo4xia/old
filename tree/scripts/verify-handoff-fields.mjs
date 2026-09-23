#!/usr/bin/env node
/**
 * 程序化字段对照（验收点 1）：
 *   buildStep1Handoff 输出键集  ==  交接台 UI 三个标签页实际渲染字段集 + problemText
 *   多余键必须为 0，缺失键必须为 0。脚本输出，不目测。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const vueSrc = readFileSync(path.join(root, '..', 'src/agent-b-v2/AgentBDirect.vue'), 'utf8')

// ---- 1. 提取 <template> 内三个 <a-tab-pane> 区段（交接台三个标签页） ----
const tplStart = vueSrc.indexOf('<template>')
const tplEnd = vueSrc.lastIndexOf('</template>') // 首个 </template> 是插槽模板闭合，取最后一个
const tpl = vueSrc.slice(tplStart, tplEnd)
const panes = [...tpl.matchAll(/<a-tab-pane[^>]*>/g)]
if (panes.length < 3) { console.error('FAIL: 未找到 3 个标签页'); process.exit(1) }
const tabRegion = tpl.slice(panes[0].index, tpl.indexOf('</a-tab-pane>', panes[2].index))
const tabNames = panes.slice(0, 3).map(m => m[0].match(/tab="([^"]+)"/)?.[1])

// ---- 2. 标签页内明文可见字段：qh-field-key 标签 + handoff?.X 引用 ----
const labels = [...tabRegion.matchAll(/qh-field-key">([^<]+)</g)].map(m => m[1])
const refs = [...tabRegion.matchAll(/handoff(?:\.value)?\?\.(\w+)/g)].map(m => m[1])

// 标签 → 顶层 handoff 键的映射（依据渲染代码逐条核对）：
//   cuCode        → stageRatioSuggestion 的子字段（标签页内渲染 stageRatioSuggestion.cuCode）
//   agentMeta     → agentPageName / agentCapability / handoffVersion（同一行合并展示）
//   teachingFocus / keyFormulaList → knowledgeAnalysis 的子字段（不构成顶层键）
const LABEL_MAP = {
  cuCode: ['stageRatioSuggestion'],
  agentMeta: ['agentPageName', 'agentCapability', 'handoffVersion'],
  teachingFocus: [],
  keyFormulaList: [],
}
const uiFields = new Set()
for (const label of labels) {
  for (const k of LABEL_MAP[label] ?? [label]) if (k) uiFields.add(k)
}
for (const r of refs) uiFields.add(r)

// ---- 3. 纯标签字段（值经 computed 渲染）核对：computed 必须读对应 handoff 键 ----
const script = vueSrc.slice(0, tplStart)
const labelOnlyFields = ['problemType', 'boardFocus', 'suggestedLayout', 'confirmedAt'] // suggestedGrade 在模板中直接引用（已计入 refs）
const computedChecks = []
for (const f of labelOnlyFields) {
  const ok = new RegExp(`handoff(?:\\.value)?[?.]+\\b${f}\\b|['"]${f}['"]`).test(script)
  computedChecks.push({ field: f, scriptReadsHandoff: ok })
}

// ---- 4. 构建 handoff（全量 mock 输入），取输出键集 ----
const { buildStep1Handoff } = await import(path.join(root, '..', 'src/services/stepHandoff.js'))
const handoff = buildStep1Handoff({
  problemText: '一列火车从甲地开往乙地，每小时行 120 千米，5 小时到达。甲乙两地相距多少千米？',
  problemType: 'e',
  boardFocus: '行程问题线段图',
  keepOriginal: true,
  relatedKnowledge: [{ point: '路程=速度×时间' }],
  knowledgeAnalysis: {
    suggestedGrade: '四年级',
    coreKnowledge: ['速度×时间=路程'],
    teachingFocus: '理解三者关系',
    keyFormulaList: ['s=v×t'],
    commonMistakes: [{ mistake: '单位漏写', reason: '粗心' }],
  },
  boardPlan: { question: { fontSize: 29, x: 1, y: 2 }, zones: [{ id: 'z1', label: '题目区', anchor: [8, 40] }] },
  suggestedGrade: '四年级',
  uncertainItems: ['单元'],
  suggestedLayout: '左题右板',
  agentPageName: 'Step1Entry',
  agentCapability: '题目分析',
  screenshotUrl: 'https://example.com/s.png',
  knowledgeBasePath: 'kb/grade4',
})
const handoffKeys = Object.keys(handoff)

// ---- 5. 对照 ----
const ALLOWED_EXTRA = ['problemText'] // 用户拍板新增的题目文本字段
const extra = handoffKeys.filter(k => !uiFields.has(k) && !ALLOWED_EXTRA.includes(k))
const missing = [...uiFields].filter(k => !handoffKeys.includes(k))

console.log('=== 交接台 UI 三标签页（%s）===' , tabNames.join(' | '))
console.log('UI 明文字段标签 (qh-field-key):', labels.join(', '))
console.log('UI 直接引用 handoff?.X       :', [...new Set(refs)].join(', '))
console.log('computed 渲染字段核对          :', computedChecks.map(c => `${c.field}=${c.scriptReadsHandoff ? 'OK' : 'MISS'}`).join(', '))
console.log('UI 顶层字段集 (%d 个)         :', uiFields.size, [...uiFields].sort().join(', '))
console.log('handoff 输出键集 (%d 个)      :', handoffKeys.length, handoffKeys.sort().join(', '))
console.log('新增题目文本字段              :', ALLOWED_EXTRA.join(', '))
console.log('多余键 (%d 个)               :', extra.length, extra.join(', '))
console.log('缺失键 (%d 个)               :', missing.length, missing.join(', '))

const computedBad = computedChecks.filter(c => !c.scriptReadsHandoff)
const pass = extra.length === 0 && missing.length === 0 && computedBad.length === 0
console.log(pass ? '\nRESULT: PASS — handoff 键集 == UI 三标签页字段集 + problemText' : '\nRESULT: FAIL')
process.exit(pass ? 0 : 1)
