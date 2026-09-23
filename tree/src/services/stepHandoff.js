/* @qh-core LANE=STEP1 POINT=HANDOFF_OWNER payload from Agent A to Agent B */
/**
 * 第1步 → 板书参数书稿页 交接
 * 信号：用户点击「确定进入生成表」
 * 核心：题目内容、题型、板书侧重 + 第1步已定题目坐标
 */
/* 画布参数【唯一真源】
 * 全项目画布尺寸 / 题目字号 / 板书字号 / 题目行高只在此定义，其余位置一律 import。
 * 禁止再写字面值（30 / 38 / 1.65 / 1.7 / 1726 / 980）；发现别处硬编码 = 那处是 bug。
 * 注意 skills/ 下的 html 是测试草稿，不是本文件的依据。
 *
 * ★ Task 10 修复 (2026-09-21)：恢复甲方原始要求（row-player.html v1.1 2026-09-17 拍板版）
 *   - 板书字号 35px → 38px（35 与 42 折中）
 *   - 板书字体 LikeJianJianTi(490) → 平方乔木体(507) 优先，490 作为降级栈尾
 *   - 板书行高无数字 → 1.7±随机（区间 1.55~1.85，下游渲染职责，均值 1.7）
 *   - 板书速度 1秒2-3字 + ±5% 轻微抖动 + 书写时长超出音频窗口自适应加速
 *   - 字距 0-2px 微小随机 → 三路抖动（字号/基线/字距）+ 位置抖动
 */
export const CANVAS_SIZE = { width: 1726, height: 980, unit: 'px', origin: '左上角(0,0), X向右Y向下' }
export const COORDINATE_SYSTEM = '百分比坐标 0-100'
export const QUESTION_FONT_SIZE = 30
export const QUESTION_LINE_HEIGHT = 1.65
// ★ Task 10: 板书字号 38px（甲方 2026-09-17 拍板，35 与 42 折中）
export const BOARD_FONT_SIZE = 38
export const BOARD_FONT_RATIO_TEXT = '约题目的1.2~1.5倍，推荐38px'
// ★ Task 10: 主手写体 = 平方乔木体 (CDN 507)；490 (栗壳坚坚体) 降为字体栈尾
export const HANDWRITING_FAMILY = '平方乔木体'
export const HANDWRITING_CSS_HREF = 'https://fontsapi.zeoseven.com/507/main/result.css'
// ★ Task 10: 完整字体栈（与 row-player.html line 116-122 同步镜像）
//   顺序：507 平方乔木体（主）→ 157 平方韶华体 → 511 平方上上谦体 → 510 平方三生体 → 509 平方韶拓体 → 490 栗壳坚坚体 → 系统楷体
export const HANDWRITING_FONT_STACK = [
  '"平方乔木体"',
  '"平方韶华体"',
  '"平方上上谦体"',
  '"平方三生体"',
  '"PingFangSaTuoTi"',
  '"LikeJianJianTi"',
  'KaiTi',
  'STKaiti',
  '"PingFang SC"',
  'serif',
].join(', ')
// ★ Task 10: 降级字体 CDN href 列表（与上面栈顺序同序）
export const HANDWRITING_CSS_HREF_FALLBACKS = [
  'https://fontsapi.zeoseven.com/507/main/result.css',  // 主：平方乔木体
  'https://fontsapi.zeoseven.com/157/main/result.css',  // 平方韶华体
  'https://fontsapi.zeoseven.com/511/main/result.css',  // 平方上上谦体
  'https://fontsapi.zeoseven.com/510/main/result.css',  // 平方三生体
  'https://fontsapi.zeoseven.com/509/main/result.css',  // 平方韶拓体
  'https://fontsapi.zeoseven.com/490/main/result.css',  // 栗壳坚坚体（原主字体降为降级）
]
// ★ Task 10: 板书行高真相源 = 1.7±随机（区间 1.55~1.85，下游渲染职责）
export const BOARD_LINE_HEIGHT_MEAN = 1.7
export const BOARD_LINE_HEIGHT_MIN = 1.55
export const BOARD_LINE_HEIGHT_MAX = 1.85
// ★ Task 10: 板书速度真相源 = 1秒2-3字 + ±5% 抖动 + 超音频窗口自适应加速
export const BOARD_SPEED_CHARS_PER_SEC = 2.5  // 1秒2-3字，均值2.5
export const BOARD_SPEED_JITTER = 0.05       // ±5% 轻微抖动
export const BOARD_SPEED_ADAPTIVE_COMPRESS = true  // 书写时长超出音频窗口时自适应加速压进音频内

/** 行高口径：题目 1.65 固定 / 板书 1.7±随机（1.55~1.85）+ 渲染层微小随机抖动 */
export const LINE_HEIGHT_RULE =
  '板书行高均值 1.7，逐行 1.55~1.85 微小随机（seed 冻结，幂等可 seek）；题目行高 1.65 固定'
export const LINE_HEIGHT_FORMULA =
  '板书 line-height = 1.7 + random(-0.15, +0.15)（seed 冻结）；题目 line-height = 1.65 固定'

/** 生成 handoff 的 canvasParams：stepHandoff 生成与 server 兜底补全共用同一份 */
export function buildCanvasParams() {
  // ★ 2026-09-22 收敛（夏夏要求：handoff 只留 UI 看得见的干净值）
  //   family 只放纯字体名；规范说明留在 fontSource.label / lineHeightFormula，UI 不再吐整段文案
  const boardFamily = HANDWRITING_FAMILY
  return {
    canvasSize: { ...CANVAS_SIZE },
    coordinateSystem: COORDINATE_SYSTEM,
    fontSource: {
      handwriting: {
        family: HANDWRITING_FAMILY,
        fontStack: HANDWRITING_FONT_STACK,
        label: '手写体（分析/解答/总结板书，主字体=平方乔木体 CDN 507）',
        fontWeight: 'normal',
        cssHref: HANDWRITING_CSS_HREF,
        cssHrefFallbacks: HANDWRITING_CSS_HREF_FALLBACKS,
        loadSnippet: `<link href="${HANDWRITING_CSS_HREF}" onload="this.rel='stylesheet'" rel="preload" as="style" crossorigin />`,
        // ★ Task 10: 多 CDN 字体降级栈（异步按需加载，不阻塞首屏）
        loadSnippetFallbacks: HANDWRITING_CSS_HREF_FALLBACKS.slice(1).map(
          href => `<link rel="stylesheet" href="${href}" media="print" onload="this.media='all'" />`
        ).join('\n        '),
        fallbackSnippet: `<noscript><link rel="stylesheet" href="${HANDWRITING_CSS_HREF}" /></noscript>`,
        usage: `渲染前必须先加载该 CSS（font-family: "${HANDWRITING_FAMILY}"; font-weight: normal），字体栈 fallback 顺序见 fontStack；507 不可用时按栈降级`,
      },
      question: {
        family: 'Segoe UI/PingFang SC/Microsoft YaHei',
        label: '印刷体（题目层，本地字体，不加载网络字体）',
        fontWeight: 'normal',
      },
    },
    fontSize: {
      question: { px: QUESTION_FONT_SIZE, family: '微软雅黑', color: '黑色' },
      analysis: { px: BOARD_FONT_SIZE, family: boardFamily, color: '红色' },
      solution: { px: BOARD_FONT_SIZE, family: boardFamily, color: '黑色' },
      summary: { px: BOARD_FONT_SIZE, family: boardFamily, color: '黑色' },
    },
    lineHeight: {
      question: QUESTION_LINE_HEIGHT,
      // ★ 2026-09-22 收敛：others 只放均值数值；区间见 boardMin/boardMax，公式见 lineHeightFormula
      others: BOARD_LINE_HEIGHT_MEAN,
      boardMean: BOARD_LINE_HEIGHT_MEAN,
      boardMin: BOARD_LINE_HEIGHT_MIN,
      boardMax: BOARD_LINE_HEIGHT_MAX,
    },
    letterSpacing: {
      question: '0',
      others: '下游渲染参数：0-2px 微小随机（模拟手写感，B 不需要处理）',
    },
    style: '老师上课草算演示，微微达芬奇手稿style（草稿推演质感，轻盈生动；板书绝不可溢出画布）',
    // ★ Task 10: 板书速度真相源 - 1秒2-3字 + ±5%抖动 + 自适应加速
    boardSpeed: `下游渲染参数：1秒约${BOARD_SPEED_CHARS_PER_SEC}个汉字，每行±${BOARD_SPEED_JITTER * 100}%轻微抖动；书写时长超出音频窗口时自适应加速压进音频内（音频=行时长唯一主时钟）`,
    boardSpeedCharsPerSec: BOARD_SPEED_CHARS_PER_SEC,
    boardSpeedJitter: BOARD_SPEED_JITTER,
    boardSpeedAdaptiveCompress: BOARD_SPEED_ADAPTIVE_COMPRESS,
    actionSpeed: '差不多同样速度（rough-line/rough-arrow/rough-notation绘制速度）',
    lineHeightFormula: LINE_HEIGHT_FORMULA,
  }
}

export function hasUsableAgentAKnowledge(analysis) {
  return Array.isArray(analysis?.coreKnowledge) && analysis.coreKnowledge.length > 0
}

/* 题型比例判断（SK-06 绑定CU）
 * 根据题型、知识点、题目文本判断属于 a/b/c/d/e 哪类，给出各stage时间占比建议
 * a 计算确定：整数/小数/分数计算、竖式、口算 → 解答50-78%为主
 * b 方法确定：图形面积/周长、植树、鸡兔同笼、归一、税率、利率、比和比例 → 解答55-65%
 * c 答案不确定：最值、规律、列举组合、开放应用 → 分析≈解答25-50%
 * d 建模推导：行程、工程、浓度、等量代换、列方程 → 边画边讲，解答55-70%
 * e 概念确定：图形认识、概念辨析、单位换算、定义判定 → 读题+直接判定，分析可近0
 */
const STAGE_RATIO_TABLE = {
  a: {
    cuCode: 'CU-02',
    category: '计算确定',
    topicExamples: '整数计算、小数宝典(加减乘除)、分数计算、竖式/口算',
    analysisPct: '4-12%',
    solutionPct: '50-78%',
    summaryPct: '15-28%',
    introPct: '7%',
    essence: '解答绝对主体+收尾必做法则/方法大总结；读题/寒暄极短',
    keywords: ['计算', '整数', '小数', '分数', '竖式', '口算', '加减乘除', '四则运算'],
  },
  b: {
    cuCode: 'CU-03',
    category: '方法确定',
    topicExamples: '长方形&正方形(面积/周长)、平行四边形/梯形(面积)、植树、鸡兔同笼(假设)、归一、税率、利润利率、比和比例',
    analysisPct: '5-15%',
    solutionPct: '55-65%',
    summaryPct: '5-10%',
    introPct: '23%',
    essence: '解答绝对主体，标准结构',
    keywords: ['长方形', '正方形', '平行四边形', '梯形', '面积', '周长', '植树', '鸡兔同笼', '归一', '税率', '利润', '利率', '比和比例', '比例'],
  },
  c: {
    cuCode: 'CU-01',
    category: '答案不确定',
    topicExamples: '最值(开放)、规律&算式规律(探索)、列举与组合(方案)、开放应用',
    analysisPct: '25-40%',
    solutionPct: '38-50%',
    summaryPct: '8-14%',
    introPct: '13%',
    essence: '分析≈解答，试错链承载决策（分析=试错探索含否定/重选；解答=收敛结论）',
    keywords: ['最值', '最大', '最小', '规律', '找规律', '列举', '组合', '开放', '至少', '至多', '可能'],
  },
  d: {
    cuCode: 'CU-04',
    category: '建模推导',
    topicExamples: '行程、工程、浓度、等量代换与应用、列方程解应用',
    analysisPct: '5-15%',
    solutionPct: '55-70%',
    summaryPct: '5-10%',
    introPct: '20%',
    essence: '边画边讲，模型即分析载体',
    keywords: ['行程', '相遇', '追及', '工程', '浓度', '等量代换', '列方程', '解方程', '方程'],
  },
  e: {
    cuCode: 'CU-05',
    category: '概念确定',
    topicExamples: '图形认识与分类、概念辨析(质数合数/奇偶/因数倍数)、单位换算判定、定义判定',
    analysisPct: '0-8%',
    solutionPct: '55-65%',
    summaryPct: '5-10%',
    introPct: '29%',
    essence: '读题+直接判定，分析可近0',
    keywords: ['图形认识', '分类', '概念辨析', '单位换算', '定义', '判断', '比较', '辨认'],
  },
}

export function detectStageRatio(problemType, relatedKnowledge, problemText) {
  const text = `${problemType || ''} ${(relatedKnowledge || []).map(k => typeof k === 'string' ? k : (k.knowledgePoint || k.name || '')).join(' ')} ${problemText || ''}`
  let bestMatch = null
  let bestScore = 0
  for (const [key, rule] of Object.entries(STAGE_RATIO_TABLE)) {
    let score = 0
    for (const kw of rule.keywords) {
      if (text.includes(kw)) score += 1
    }
    if (score > bestScore) {
      bestScore = score
      bestMatch = key
    }
  }
  if (!bestMatch) return null
  const rule = STAGE_RATIO_TABLE[bestMatch]
  return {
    type: bestMatch,
    cuCode: rule.cuCode,
    category: rule.category,
    topicExamples: rule.topicExamples,
    suggestedRatio: {
      analysis: rule.analysisPct,
      solution: rule.solutionPct,
      summary: rule.summaryPct,
      introAndClosing: rule.introPct,
    },
    essence: rule.essence,
    confidence: bestScore >= 2 ? 'high' : 'medium',
  }
}

export function buildStep1Handoff(input = {}) {
  // ★ 2026-09-22 handoff 瘦身（用户拍板）：只输出交接台 UI 三个标签页明文可见的字段 + 题目原文。
  //   删除隐藏字段：keepOriginal / coordinateSpec / topicLayout / showGrid / essence；
  //   commonMistakes 从 knowledgeAnalysis 内层提升为顶层字段（交接台「易错点」按顶层键渲染）。
  //   值一律原样透传（环节配比、题型编码等系统判定值禁止顺手修正）；字段结构变了，值没变。
  const problemText = String(input.problemText || '').trim()
  const problemType = input.problemType || null
  const boardFocus = input.boardFocus || null
  const imageKind = input.imageKind || (input.keepOriginal ? 'has_diagram' : 'text_only')
  const relatedKnowledge = Array.isArray(input.relatedKnowledge)
    ? JSON.parse(JSON.stringify(input.relatedKnowledge))
    : null

  // Agent A 深度知识点分析结果（识别时 LLM 直接产出）
  const knowledgeAnalysis = hasUsableAgentAKnowledge(input.knowledgeAnalysis)
    ? JSON.parse(JSON.stringify(input.knowledgeAnalysis))
    : null

  // 从 knowledgeAnalysis 提取参考年级（供 Agent B 参考）
  const suggestedGrade = String(input.suggestedGrade || knowledgeAnalysis?.suggestedGrade || '').trim()

  // 从 boardPlan 提取各区域定位锚点（落座标签 + 区域参考起点，板书由渲染层自然排版）
  const boardPlan = roundLayoutNumbers(input.boardPlan ? JSON.parse(JSON.stringify(input.boardPlan)) : null)
  // ★ 2026-09-22：同上，boardPlan.question.fontSize 也会漂移（实测 29），钉死为规范值
  if (boardPlan?.question && Object.prototype.hasOwnProperty.call(boardPlan.question, 'fontSize')) {
    boardPlan.question.fontSize = QUESTION_FONT_SIZE
  }
  const zoneAnchors = extractZoneAnchors(boardPlan)

  // 画布参数（Agent B 动作坐标与渲染区域参考，固定值不随题目变化）
  const ratioResult = detectStageRatio(problemType, relatedKnowledge, problemText)

  const canvasParams = buildCanvasParams()

  // 易错点：交接台「易错点」按顶层键渲染，从 knowledgeAnalysis 内层同值提升（原值不动）
  const commonMistakes = Array.isArray(knowledgeAnalysis?.commonMistakes)
    ? JSON.parse(JSON.stringify(knowledgeAnalysis.commonMistakes))
    : []

  return {
    handoffVersion: 1,
    confirmedAt: new Date().toISOString(),
    problemText,
    problemType,
    boardFocus,
    relatedKnowledge,
    knowledgeAnalysis,
    commonMistakes,
    suggestedGrade,
    uncertainItems: Array.isArray(input.uncertainItems) ? JSON.parse(JSON.stringify(input.uncertainItems)) : [],
    suggestedLayout: input.suggestedLayout || null,
    imageKind,
    zoneAnchors,
    boardPlan,
    canvasParams,
    // B 图片传输冻结：甲方后续确认该能力并追加预算后，再恢复原图/快照交接。
    // 当前 B 只接收题干文字和 Agent A 的结构化布局信息。
    agentPageName: input.agentPageName || '',
    agentCapability: input.agentCapability || '',
    screenshotUrl: input.screenshotUrl || null,
    knowledgeBasePath: input.knowledgeBasePath || 'doc/knowledge-a.compact.json',
    // ★ 环节配比（UI 标签「环节配比占比」）= 讲解内容各阶段占整节课 / 整份讲义的比例：
    //   分析 / 解答 / 总结 / 开收场 分别占多少，由系统按题型（SK-06 绑定 CU）判定。
    //   它是内容占比建议，不是硬约束；区间值（如 5-15%）与定值（如开收场 23%）并存属正常，不要求求和 = 100。
    //   ★ 禁止以「重复 / 矛盾 / 加起来不等于 100」为由删除或改写其内容。
    // ★ 2026-09-22：原先同一份 ratioResult 在 JSON 里存了两遍（stageRatioSuggestion + 环节配比占比），
    //   删除的是 JSON 里那份多余的副本键，UI 标签与系统判定值原样保留、继续从 stageRatioSuggestion 读取。
    stageRatioSuggestion: ratioResult,
  }
}

function roundLayoutNumbers(value) {
  if (Array.isArray(value)) return value.map(roundLayoutNumbers)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundLayoutNumbers(item)]))
  }
  return typeof value === 'number' && Number.isFinite(value)
    ? Number(value.toFixed(2))
    : value
}

/**
 * 从 boardPlan 提取各区域的标签位置和动作参考位置。
 * 这些坐标会传给 Agent B，让它在生成 draw 动作时有明确的落点参考。
 */
function extractZoneAnchors(boardPlan) {
  if (!boardPlan) return null
  const anchors = {}
  // 题目区
  if (boardPlan.topicLabel || boardPlan.question) {
    anchors.question = {
      label: boardPlan.topicLabel || null,
      labelStartCoord: boardPlan.topicLabel
        ? { x: boardPlan.topicLabel.x, y: boardPlan.topicLabel.y }
        : null,
      regionStartCoord: boardPlan.question
        ? { x: boardPlan.question.x, y: boardPlan.question.y, w: boardPlan.question.w, h: boardPlan.question.h || null }
        : null,
    }
  }
  // 分析区、解答区、总结区
  const zones = ['analysis', 'solution', 'summary']
  const labelZones = ['analysisLabel', 'solutionLabel', 'summaryLabel']
  for (let i = 0; i < zones.length; i += 1) {
    const zone = zones[i]
    const labelKey = labelZones[i]
    const label = boardPlan[labelKey]
    const region = boardPlan[zone]
    if (label || region) {
      anchors[zone] = {
        label: label || null,
        labelStartCoord: label
          ? { x: label.x, y: label.y }
          : null,
        regionStartCoord: region
          ? { x: region.x, y: region.y, w: region.w, h: region.h || null }
          : null,
      }
    }
  }
  return anchors
}
