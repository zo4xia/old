/**
 * superFilter.js — 车同轨·书同文 10 步过滤流水线（唯一真源）
 *
 * ponytail: 从 row-player.html L648-716 抽出，Vue 项目 src/ 与 row-player.html 共用。
 * 当前接入点: RealBoardPreview.vue (B 页画布预览) + AgentBDirect.vue (表格板书列渲染)
 * 未接入: BoardContentLayer.vue (Step1 题目文本, 不需要过滤) / mathText.js (未用)
 *
 * 10 步流水线（顺序不能倒）:
 *   ① \n 还原（后非字母）   ② 控制字符退化为空格
 *   ③ HTML 实体解码         ④ LaTeX 损伤修复
 *   ⑤ 删 $ \left \right     ⑥ 手写体缺字降级 = R1-6 逐字符写法表（×→x ÷→上下分数 ∵∴→因为所以 上标/自绘标记）
 *   ⑦ LaTeX → Unicode       ⑧ 角标 x²→x² x³→x³
 *   ⑨ 除号 → \frac{a}{b}    ⑩ 压行内空白
 *
 * @qh-core LANE=SHARED POINT=SUPER_FILTER
 */

// —— R1-6 逐字符写法表（2026-09-22 用户拍板，台账 R1-6a/b/c）——
// 字体事实（507 平方乔木体 6891 字符实测，cmap 全量核对）：ASCII 全有；数学符号几乎全缺
//   （²³×÷−√≈≠≤≥°℃½∶∵∴π±⊥∥→⇒∠△∞ 全部不在字库）→ 每缺一个符号就有一条「怎么写」。
// 输出三原则（R1-6c）：① 排版动作（上标=字体里的字符缩小放右上角；分数线=.-. 英文标点拼成）
//   ② 字体里有的替代字符/汉字词  ③ 自绘笔画标记 \sd{...}（渲染层画笔画，字体零依赖）
// ★ 单一数据源镜像：本表与 src/utils/superFilter.js 逐字一致，改任一边必须同步另一边。
// 上标内部标记：² ³ = 缩小的 2/3；° = 缩小的 o；\uE002..\uE00B = 缩小的数字 0-9（渲染层吃掉，绝不落板）
function SUPCH(d){return d==='2'?'²':d==='3'?'³':String.fromCharCode(0xE002+(+d||0));}
function supCharOf(ch){
  if(ch==='²')return '2'; if(ch==='³')return '3'; if(ch==='\u00B0')return 'o';
  var c=ch.charCodeAt(0);
  if(c>=0xE002&&c<=0xE00B)return String(c-0xE002);
  return null;
}
const GLYPH2COMMON=[
  // —— R1-6a 用户拍板三条（立即生效）——
  [/[\u00D7\u2715\u2716\u2717]/g,'x'],                 // 乘号 → 英文小写 x（用户原话）
  [/\u00F7/g,'\u0001'], [/\u2215/g,'\u0001'],         // ÷∕ → 占位符，稍后与两侧操作数组合成上下分数（R1-6a）
  [/\u2212/g,'-'],                                    // 减号 → 半角 -（R1-6b）
  [/\u2235/g,'因为'], [/\u2234/g,'所以'],             // ∵∴ → 汉字（R1-6b）
  // —— R1-6b 推断项（方案A落地，交付清单逐项标注，待用户确认后可调）——
  [/[\u2248\u2243]/g,'约'],                           // ≈ → 汉字「约」
  [/\u2260/g,'\\sd{ne}'],                             // ≠ → 等号上自绘斜线
  [/\u2264/g,'\\sd{le}'], [/\u2265/g,'\\sd{ge}'],     // ≤≥ → 半角<> 加自绘横线
  [/\u221A/g,'\\sd{sqrt}'],                           // √ → 自绘根号
  [/\u2103/g,'C\u00B0'],                              // ℃ = C + 缩小的 o（° 渲染层吃成上标）
  [/\u2236/g,'：'],                                   // 比号 ∶ → 全角冒号（字库里有）
  [/\u00BD/g,'\\frac{1}{2}'], [/\u00BC/g,'\\frac{1}{4}'], [/\u00BE/g,'\\frac{3}{4}'],   // ½¼¾ → 上下分数
  [/\u2153/g,'\\frac{1}{3}'], [/\u2154/g,'\\frac{2}{3}'],
  // —— R1-6b 未列、按同款先例补的缺字（方案A，交付清单里逐项标注待确认）——
  [/(\d)\s*[\u00B7\u2219]\s*(?=\d)/g,'$1 x '],        // 乘点（数字之间）→ x；汉字姓名间隔点不碰
  [/([A-Za-z])\s*[\u00B7\u2219]\s*(?=[A-Za-z0-9])/g,'$1 x '],  // 字母间乘点 → x；孤立 ·（人名间隔点）保留原样
  [/\u03C0/g,'\\sd{pi}'],                             // π → 自绘（按 √ 自绘先例）
  [/\u00B1/g,'\\sd{pm}'],                             // ± → 自绘
  [/\u22A5/g,'\\sd{perp}'], [/\u2225/g,'\\sd{para}'], // ⊥∥ → 自绘
  [/[\u2192\u21D2]/g,'\\sd{arrow}'],                  // →⇒ → 自绘箭头
  [/\u2220/g,'角'],                                   // ∠ → 汉字「角」（按 因为/所以 汉字词先例）
  [/[\u25B3\u25B2]/g,'三角形'],                       // △▲ → 汉字
  [/\u221E/g,'无穷'],                                 // ∞ → 汉字
  // —— 全角 ASCII 归一（字库缺全角 ASCII；CJK 标点 ，。？！；：“”‘’ 字库里有、绝不碰）——
  [/[\uFF10-\uFF19]/g,function(m){return String.fromCharCode(m.charCodeAt(0)-0xFEE0);}],
  [/\uFF05/g,'%'],[/\uFF0B/g,'+'],[/\uFF0D/g,'-'],[/\uFF1D/g,'='],[/\uFF1C/g,'<'],[/\uFF1E/g,'>'],
  [/\uFF08/g,'('],[/\uFF09/g,')'],[/\uFF0E/g,'.'],[/\uFF0A/g,'*'],[/\uFF0F/g,'/'],
  // —— 旧规则存档（已被 R1-6 修订，按「只增不改」原则保留注释不启用）——
  // [/\u00F7/g,'/'],      // 旧规则 ÷→/ ：已被 R1-6a「除号=分数上下写法（.-.分数线）」修订（2026-09-22）
  // [/\u2234/g,'因此'],   // 旧规则 ∴→因此：已被 R1-6b「∵∴写汉字因为所以」修订（2026-09-22）
];
const LATEX2U=[
  // ★ Task 23 修正: \times/\div 后面紧跟数字时 \b 不匹配 (如 \times20.4), 改用 (?=\d|\s|$|[^a-zA-Z]) 前瞻
  [/\\times(?=\d|\s|$|[^a-zA-Z])/g,'x'],
  [/\\div(?=\d|\s|$|[^a-zA-Z])/g,'\u0001'],           // R1-6a 修订：除号分数上下写法（旧规则 \div→/ 已被修订）
  [/\\cdot\b/g,'x'],                                  // 乘点命令 → x（跟随乘号规则；旧规则 →· 已被 R1-6 修订，· 字库缺）
  // ⚠ 角标只吞 ^ 与数字/命令本身，绝不吞后续空格（否则 "x^2 + y^2" 会被连成 "x²+"）
  [/\^\s*(?:\{\s*\\circ\s*\}|\\circ)/g,'\u00B0'],[/\\circ\b/g,'\u00B0'],[/\\degree\b/g,'\u00B0'],
  [/\^\s*(?:\{\s*2\s*\}|2)(?!\d)/g,'²'],[/\^\s*(?:\{\s*3\s*\}|3)(?!\d)/g,'³'],   // 平方立方：小字号右上角
  [/\^\s*\{\s*([0-9])\s*\}/g,function(m,d){return SUPCH(d);}],                    // 一般上标 ^{d}：同款缩小右上角
  [/\^\s*([0-9])(?!\d)/g,function(m,d){return SUPCH(d);}],                        // 一般上标 ^d
  [/\\angle\b/g,'角'],[/\\pm\b/g,'\\sd{pm}'],[/\\perp\b/g,'\\sd{perp}'],[/\\parallel\b/g,'\\sd{para}'],
  [/\\triangle\b/g,'三角形'],[/\\therefore\b/g,'所以'],[/\\because\b/g,'因为'],    // ∴→所以（R1-6b 修订旧规则→因此）
  [/\\le(?:q)?\b/g,'\\sd{le}'],[/\\ge(?:q)?\b/g,'\\sd{ge}'],[/\\ne(?:q)?\b/g,'\\sd{ne}'],[/\\approx\b/g,'约'],
  [/\\pi\b/g,'\\sd{pi}'],[/\\infty\b/g,'无穷'],
  [/\\sqrt\s*\{([^}]*)\}/g,'\\sd{sqrt}$1'],[/\\sqrt\b/g,'\\sd{sqrt}'],            // √ 自绘（R1-6b 方案A）
  [/\\rightarrow\b/g,'\\sd{arrow}'],[/\\Rightarrow\b/g,'\\sd{arrow}'],[/\\to\b/g,'\\sd{arrow}'],
  // ★ Task 20: 兜底处理 Agent B LLM 输出里不该出现的 LaTeX 命令
  [/\\text\s*\{([^}]*)\}/g,'$1'],
  [/\\quad\b/g,' '],[/\\qquad\b/g,'  '],
  [/\\,/g,' '],[/\\;/g,' '],[/\\:/g,' '],[/\\!/g,''],
  [/\\displaystyle\s+/g,''],[/\\dfrac\s*\{/g,'\\frac{'],[/\\tfrac\s*\{/g,'\\frac{'],
  [/\\%/g,'%'],[/\\\{/g,'{'],[/\\\}/g,'}'],[/\\&/g,'&'],[/\\_/g,'_'],[/\\\$/g,''],  // 转义标点还原（R1-6：别让 \% \{ 字面落板）
];
// 结构数学：LaTeX 命令 / ^_{...} / 连续上下标 —— 手写体写不了，需要公式图
// ★ v5：\frac 分数与 \sd 自绘标记是渲染层能吃掉的排版动作，不再算结构数学
const STRUCT_MATH=/\\(?!frac\b|sd\b)[a-zA-Z]+|[A-Za-z0-9)\]}]\s*[\^_]\s*\{[^}]+\}|[A-Za-z0-9)\]}]\s*[\^_]\s*[A-Za-z0-9]\s*[\^_]/;


// ① LaTeX 转义损伤修复：\frac 被吃成 rac / frac / \u000c+rac
function repairCommonLatexEscapeDamage(t) {
  return t
    .replace(/\u000c\s*rac/g, '\\frac')
    .replace(/(^|[^\w\\])rac(?=\s*\{)/g, '$1\\frac')
    .replace(/(^|[^\w\\])frac(?=\s*\{)/g, '$1\\frac')
}

// ② HTML 实体解码（⚠ &amp; 必须最后解，否则 &amp;lt; 会被二次解成 <）
function decodeHtmlEntities(t) {
  return t
    .replace(/&times;/g, 'x').replace(/&divide;/g, '\u0001').replace(/&minus;/g, '-')
    .replace(/&plusmn;/g, '\\sd{pm}').replace(/&deg;/g, '°')
    .replace(/&le;/g, '\\sd{le}').replace(/&ge;/g, '\\sd{ge}').replace(/&ne;/g, '\\sd{ne}')
    .replace(/&radic;/g, '\\sd{sqrt}').replace(/&prop;/g, '∝')
    .replace(/&middot;/g, '·').replace(/&mdash;/g, '—').replace(/&hellip;/g, '…')
    .replace(/&sup2;/g, '²').replace(/&sup3;/g, '³')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

/**
 * normalizeBoardLine — 10 步过滤流水线，单行板书清洗
 * @param {string} s 原始板书行
 * @returns {string} 规范化后的板书行
 */
export function normalizeBoardLine(s) {
  let t = String(s == null ? '' : s)

  // ① 字面量 \n 还原（只在后面不跟字母时，否则打断 \neq \not \nabla）
  t = t.replace(/\\r\\n/g, '\n').replace(/\\n(?![a-zA-Z])/g, '\n')
  // ② 控制字符 \t \b \v \f 退化为空格
  t = t.replace(/[\t\u0008\u000B\u000C\u0001]+/g, ' ')
  // ③ HTML 实体解码（&amp; 最后解）
  t = decodeHtmlEntities(t)
  // ④ LaTeX 损伤修复
  t = repairCommonLatexEscapeDamage(t)
  // ⑤ LaTeX 环境与定界符剥壳：\begin{aligned}/\end{aligned}、\\ 换行、& 对齐符、\(\) \[\]
  //    （渲染层没有 KaTeX，prompt 让模型用 aligned 排版 → 统一剥壳成普通板书行，绝不字面落板）
  //    ⚠ & 对齐符只在 aligned 环境内出现, 但 step③ 已把 &amp; 解码成 &
  //    所以先删 aligned 的 &（紧跟在字母/数字/表达式后面的 &，用于对齐）
  //    再删剩余的 \begin/\end/\\/\(/\)/\[/\] 定界符
  t = t
    .replace(/\\(?:begin|end)\s*\{[^}]*\}/g, '')
    .replace(/\\\\/g, '\n')
    .replace(/\\\(|\\\)/g, '')
    .replace(/\\\[|\\\]/g, '')
    // 只删 LaTeX aligned 对齐符: 行首 & 或 & 后跟 = (如 S &= ...), 不删普通文字里的 &
    .replace(/(^|\n)\s*&\s*(?==)/gm, '$1')
    .replace(/\s*&\s*(?==)/g, '')
  // ⑥ 删 $ \left \right（绝不字面落板）
  t = t.replace(/\$+/g, '').replace(/\\left\b|\\right\b/g, '')
  // ⑥ 手写体缺字降级（先跑）
  for (const [re, s2] of GLYPH2COMMON) t = t.replace(re, s2)
  // ⑦ LaTeX → Unicode
  for (const [re, s2] of LATEX2U) t = t.replace(re, s2)
  // ⑧ 角标：x^2 → x²、x^3 → x³，一般数字角标同款缩放右上角（R1-6c：上标是排版动作）
  t = t.replace(/(\w|\))\^\{([0-9])\}/g, (m, a, d) => a + SUPCH(d))
  t = t.replace(/(\w|\))\^([0-9])(?!\d)/g, (m, a, d) => a + SUPCH(d))
  // ⑧' 除号成上下分数：a ÷ b → \frac{a}{b}（R1-6a 用户拍板）；孤立 ÷ → 汉字「除以」
  t = t.replace(/([\w.]+)\s*\u0001\s*([\w.]+)/g, '\\frac{$1}{$2}')
  t = t.replace(/\u0001/g, '除以')
  // ⑨ 除号 a/b → \frac{a}{b}
  t = t.replace(/(^|[^\w./\\{])([A-Za-z]|\d+)\s*\/\s*([A-Za-z]|\d+)(?=$|[^\w./])/g, '$1\\frac{$2}{$3}')
  // ⑩ 压行内空白（绝不碰 \n）
  t = t.replace(/[\t ]+/g, ' ').trim()
  return t
}

/**
 * toBoardLines — 板书字段（字符串/数组/对象）统一过滤 → 一行一个的行数组
 */
export function toBoardLines(v) {
  if (Array.isArray(v)) {
    return v
      .map(x => (x && typeof x === 'object') ? (x.content ?? x.text ?? '') : (x ?? ''))
      .flatMap(x => normalizeBoardLine(x).split('\n'))
      .map(l => l.trim())
      .filter(l => l.length)
  }
  if (v && typeof v === 'object') return toBoardLines(v.content ?? v.text ?? '')
  return String(v == null ? '' : v)
    .split('\n')
    .flatMap(l => normalizeBoardLine(l).split('\n'))
    .map(l => l.trim())
    .filter(l => l.length)
}

/**
 * isStructMath — 检测一行是否含结构数学（手写体写不了，需要公式图）
 */
export function isStructMath(line) {
  return STRUCT_MATH.test(line)
}

// ponytail: 唯一真源 — row-player.html + BoardContentLayer + RealBoardPreview + mathText 都 import 这个
