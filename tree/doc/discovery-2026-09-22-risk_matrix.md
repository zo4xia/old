# 风险矩阵（refactor-discovery · 2026-09-22）

> 0 置信度重扫。每项可追溯到具体文件行号。严重性 S / 概率 P / 影响 I 各 1-5，优先级 = S×P×I。
> 与 KNOWN_ISSUES.md / PONYTAIL_DEBT.md / 迭代计划/ 对齐，新增本轮发现项。

## 总表

| # | 风险 | S | P | I | 分 | 优先级 | 证据 locator |
|---|---|---|---|---|---|---|---|
| R1 | Fish Audio API Key 硬编码在源码 | 5 | 5 | 4 | 100 | **P0** | server/fishAudioHandler.js:12-17 |
| R2 | B 输出解析过严，格式偏差整表 422 | 4 | 4 | 5 | 80 | **P0** | server/agentBV2Handler.js:76, src/agent-b-v2/contract.js:71 |
| R3 | 修缮 API 一调就写文件，"保留原文"是假的 | 4 | 3 | 5 | 60 | **P0** | server/knowledgeRefineHandler.js |
| R4 | AgentBDirect.vue 巨石 186.5 KB / ~5000 行 | 3 | 5 | 4 | 60 | **P1** | src/agent-b-v2/AgentBDirect.vue |
| R5 | handoff.canvasParams 与 UI canvasParams ref 两套不映射 | 4 | 3 | 4 | 48 | **P1** | KNOWN_ISSUES P1-1 |
| R6 | scripts/scripts/ 整目录重复副本（哈希完全相同） | 1 | 5 | 1 | 5 | P3 | scripts/scripts/smoke-test-skills.mjs |
| R7 | server/ 跨层复用 src/ 业务模块（prompt/contract/timing） | 3 | 2 | 4 | 24 | **P2** | server/agentBV2Handler.js:1-7 |
| R8 | row-player.html 134 KB 单文件 + BOM + 数据传递断裂 | 4 | 3 | 3 | 36 | **P1** | 迭代计划/下一步改进指南.md P1-P4 |
| R9 | question vs topic 命名未归一 | 2 | 4 | 3 | 24 | P2 | KNOWN_ISSUES P1-2 |
| R10 | zones 死代码导出误导下游 | 2 | 3 | 3 | 18 | P2 | AgentBDirect.vue L135-141 |
| R11 | public/ 作为持久化卷与 Vercel 无磁盘矛盾 | 4 | 2 | 4 | 32 | **P2** | DECISIONS 2026-09-13 |
| R12 | 字体 6 个 CDN 全靠外网，沙箱/离线降级链长 | 2 | 3 | 2 | 12 | P3 | index.html:54-60, stepHandoff.js:31-51 |
| R13 | handoff 白名单 18 字段冗余重叠（坐标 6 套 / 布局 3 套） | 2 | 4 | 2 | 16 | P2 | KNOWN_ISSUES P1-5 |
| R14 | board.drawIntentTool 执行空壳（execute:()=>{}） | 2 | 3 | 2 | 12 | P3 | boardToolCatalog.js:86-95 |
| R15 | L4 用户画笔层未实现（空 div aria-hidden） | 1 | 4 | 2 | 8 | P3 | RealBoardPreview.vue:181 |

## P0 详述

### R1 [100] Fish Audio API Key 硬编码
- **位置**：`server/fishAudioHandler.js:12-17`
- **现象**：`DEFAULT_API_KEYS` 数组直接写死两个 `sk-fish-...` 字符串；`getApiKeys()` 在 env 为空时 fallback 到这两个 key。
- **影响**：源码进 git / 进 Vercel 部署日志 / 进 PR 历史即泄露；任何拿到仓库的人都能用甲方额度。
- **证据**：本轮直接读文件确认。
- **止血**：
  1. 立即把两个 key 从源码删除，改为只从 `FISH_AUDIO_API_KEY` / `FISH_AUDIO_API_KEYS` env 读；
  2. 已泄露的两个 key 在 Fish Audio 控制台轮换；
  3. `docker-compose.base44.yml` / Vercel env 里补配。
- **责任闭合卡**：
  `对象=fishAudioHandler.js:DEFAULT_API_KEYS | 触发者=getApiKeys() | 当前装配=硬编码 fallback | 实际执行者=fishAudioHandler 进程 | 成功副作用=MP3 写 public/audio/ | 失败是否返回且被检查=是（sendJson） | 重试/重放来源=无 | 不能覆盖的对象=已泄露 key 的历史使用记录 | status=confirmed`

### R2 [80] B 输出解析过严
- **位置**：`server/agentBV2Handler.js:76`、`src/agent-b-v2/contract.js:71`
- **现象**：模型多回 `notes`、旧 `答语`、第六字段，或动作工具稍有偏差，整表回 422，可用讲题稿被丢。
- **与本轮代码对照**：contract.js 已有 `STAGE_SYNONYMS` 温和吸附（L14-25）和 `normalizeAgentBV2ActionSpec` 宽容提取（L79-97），但 `parseAgentBV2Response` L151-160 仍对非法 stage 直接 422。KNOWN_ISSUES 标"未修复"与代码现状一致。
- **止血**：服务端宽容提取 rows；忽略旧字段；不确定动作降级为 []；保留可用口播和板书。

### R3 [60] 修缮 API 一调就写文件
- **位置**：`server/knowledgeRefineHandler.js`
- **现象**：前端以为点"应用"才写 handoff，后端一调 `knowledge/refine` 就 `overwriteCurrentHandoff`。
- **已有还原接口**：`POST /api/knowledge/revert` 从 `.original.json` 备份。
- **止血**：后端只算不写，新增 `/api/knowledge/apply`；或前端"保留原文"时调 revert。

## P1 详述

### R4 [60] AgentBDirect.vue 巨石
- **186.5 KB / 5891 行（agent-b-v2 目录总量）**，PONYTAIL_DEBT 已记录拆 10 子组件 + 7 composables 的方案（未执行）。
- 扇入：被 DirectFlow.vue 直接挂载，自身 import 24 个模块。

### R5 [48] 两套 canvasParams
- handoff.canvasParams（数据层唯一真源）vs UI canvasParams ref（显示层）无映射；用户 UI 改参数不生效，导出与渲染不一致。
- 涉及字段：fontSize.question.px vs topicFontSize、coordinateSystem vs coordinateMode、boardPlan vs zones 死代码。

### R8 [36] row-player.html 数据传递断裂
- 迭代计划/下一步改进指南.md 已记录 4 个痛点（演播旧题 / BOM / localStorage 断 / 工具栏消失），本分支名 `2222-feat-all-tasks-complete` 表明正在修。
- row-player.html 自身是 134 KB 单文件，含 superFilter 副本、内嵌 base64 素材、写死 `DATA.problemText`（平行四边形例题）。

## P2/P3 简述

- **R7 server↔src 跨层**：server handler 直接 import src 下的 prompt/contract/timing，前端改教学内容会同时改后端 system prompt，这是有意为之（单源真相），但任何对 contract.js 的改动都同时影响前端校验和后端代理，需在 PR 描述里标注双端影响。
- **R11 public/ 持久化矛盾**：DECISIONS 2026-09-13 明确要求 public/ 放持久磁盘；但 Vercel Functions 无持久磁盘，故 Vercel 仅作 Preview，生产必须用 `node server/productionServer.js`。部署文档已写，但 vercel.json 仍存在，易误导。
- **R12 字体 CDN**：6 个 ZeoSeven CDN 链接全在外网；AGENTS.md 已记录 base44 沙箱 490 不可达降级系统楷体。
- **R14 drawIntentTool 空壳**：boardToolCatalog.js:86-95 给 DRAW_INTENT 返回 `execute:()=>{}`，真实几何由 roughDrawingTool 承担，是死重。
- **R15 L4 用户画笔层**：RealBoardPreview.vue:181 仅空 div aria-hidden。

## 止血顺序建议

1. **R1** 立即（安全，0 代码风险，删硬编码 + env 配置）。
2. **R2 + R3** 一起做（都在 agentBV2/knowledgeRefine handler 边界）。
3. **R8** 按迭代计划/ 已有方案逐项落地。
4. **R4/R5** 排期，不动主链。
5. **R6/R14/R15** 顺手清理。
