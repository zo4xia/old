# 字段-函数-ABC功能-前端映射表（持续更新）

## 2026-05-30 批注

| 字段 | 内容 |
| --- | --- |
| 批注日期 | 2026-05-30 |
| 原记录状态 | 部分有效 |
| 当前真相文件 | `当前项目全局认知图与批注说明.md` |
| 仍然有效 | 主链字段映射、rows/voiceText/boardSlice/chainKey/TTS/BoardEvent/TimelineClip/C visual 字段/预览临时态等映射关系仍然有效，是当前系统非常关键的贯穿知识。 |
| 已被覆盖 | “tldraw 主舞台金手指隔离”这类表述不再适合作为当前正式舞台的唯一实现口径；现在更准确的说法是分层舞台路径下的 overlay/C-content/base 分离。 |
| 为什么覆盖 | 正式主舞台已经切到 drawboard 路线，Konva proof 也已经建立；映射真相仍在，但具体承载实现不能再只写成 tldraw 时代的说法。 |
| 下一步 | 保留字段映射表为真相索引，后续把与舞台承载实现强绑定的描述逐步改成“当前承载路径 + 历史实现批注”形式。 |

# 字段-函数-ABC功能-前端映射表（持续更新）

> 用途：把“字段真相、函数入口、ABC职责、前端位置、映射规则”钉在一张表里，防止边界漂移。  
> 规则：每完成一个节点，必须更新本表。新增字段/函数不入表，视为未完成。

## 更新纪律

1. 先改代码，再回填本表。
2. 每行必须写清“谁写入、谁读取、谁禁止写”。
3. 任何跨层改动（UI->service->gateway->store）都要回填影响列。
4. 若口径变化，保留历史，不覆盖旧记录；在“备注/变更”列写明变更日期与原因。

## 主链映射总表

| 字段 | 函数/入口 | ABC职能归属 | 对应前端组件 | 映射规则 | 写入边界 | 读取边界 | 是否唯一 | 当前状态 | 备注/变更 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `problemText.summary` | `updateProblemText` / `confirmProblemText` | 前置输入（非ABC） | `ProblemWorkspace` | 题文确认后才能进入 rows 生成 | `useTeachingEditorStore` | `AssetPanel` / Agent输入 | 是 | 生效 | 2026-05-29 |
| `rows[].section` | `normalizeScriptAgentTableRows` | ABC分区锚点 | `ScriptAgentTableEditor` | section 决定 chainKey 模板（open/pre/step/end） | `scriptAgentCandidateDraft` | 编译、预览、TTS拆句 | 是 | 生效 | 2026-05-29 |
| `rows[].voiceText` | `compileScriptAgentTableDraft` | A候选语音文本 | `ScriptAgentTableEditor` / `ScriptBoardSummaryStep` | 生成 spokenScript，再进入 TTS 单句拆分 | `scriptAgentCandidateDraft` | `VoiceWorkspace` | 是 | 生效 | 2026-05-29 |
| `rows[].boardSlice` | `compileScriptAgentTableDraft` / `createBoardEventsFromTtsUnits` | C候选内容（先）-> B时间窗口（后） | `ScriptAgentTableEditor` / `VoiceWorkspace` | boardSlice 非空行可进入 C候选与后续 B 生成 | `scriptAgentCandidateDraft` | 预览、boardEvents、timeline | 是 | 生效 | 2026-05-29 |
| `chainKey` | `createRowChainKey` / `createAbcChainLabels` | A/B/C身份映射 | `ScriptAgentTableEditor`（映射提示） | 开场/分析/解题/总结 -> template/step 规则 | 归一化函数自动生成 | 编译、timeline、显示标签 | 是 | 生效 | 2026-05-29 |
| `TtsSentenceResult.durationMs` | `applyTtsSentenceResults` / `createSentenceTimingMap` | A主时钟 | `VoiceWorkspace` / `TeachingTimeline` | 句级时长累积为播放时间轴 | TTS网关返回 | BoardEvent生成 | 是 | 生效 | 2026-05-29 |
| `BoardEvent.startMs/endMs` | `createBoardEventsFromTtsUnits` | B寿命窗口来源 | `VoiceWorkspace`（生成） | 由句序+时长累积，非UI随意写 | timeline-factory | mapBoardEventsToTimelineClips | 是 | 生效 | 2026-05-29 |
| `TimelineClip.startMs/endMs` | `mapBoardEventsToTimelineClips` / `updateBoardTiming` | B寿命窗口 | `VoiceTrack` / `TimelineClipBlock` | B控制显示窗口，超A尾部仅静态留场 | 生成器 + 时间轴编辑 | 播放过滤/显示 | 是 | 生效 | 2026-05-29 |
| `TimelineClip.label` | `mapBoardEventsToTimelineClips` | C演员文本 | `AutoHandwritingLayer` / `TldrawStagePreview` | label -> 可见文本（随reveal） | timeline-factory/编辑器 | 舞台渲染层 | 是 | 生效 | 2026-05-29 |
| `xPercent/yPercent/widthPercent` | `updateBoardClip` / tldraw shape patch | C站位 | `BoardClipInspector` / `TldrawStagePreview` | 百分比坐标，舞台尺寸自适配 | C编辑入口 | 舞台映射 | 是 | 生效 | 2026-05-29 |
| `drawSpeed` | `updateBoardClip` / `getBoardRevealProgress` | C演绎参数 | `BoardClipInspector` | 仅影响 reveal 速度，不改 A/B | C编辑入口 | reveal计算 | 是 | 生效 | 2026-05-29 |
| `layoutPreviewDraft.items[].groupKey` | `/api/agent/board-layout-preview` | C-Agent视觉分区 | `BoardPreviewCard` | 强制四区标签：题目/分析/解答/总结 | 预览网关（临时态） | 只读预览 | 是 | 生效 | 2026-05-29（四区硬约束） |
| `layoutPreviewDraft` | `syncLayoutPreviewDraft` / `clearLayoutPreviewDraft` | 临时视觉预览（非正式ABC真相） | `VoiceWorkspace` / `ScriptBoardSummaryStep` | 仅用于评审，不落正式timeline | store 临时态 | 侧边预览 | 是 | 生效 | 2026-05-29 |
| `goldenFinger overlay strokes` | `GoldenFingerCanvasLayer` | 顶层外挂层（非ABC生命线） | `BoardStageToolOverlay` / `GoldenFingerCanvasLayer` | off穿透；画笔模式拦截；不写base数据 | 覆盖层内部状态 | 录制合成层可见 | 是 | 生效（旧drawboard路径） | 待与tldraw主路径完全对齐 |
| `recordingCanvases(base/content/overlay)` | `useCanvasRecorder` | 交付层（非ABC真相） | `StageRecorderControl` | 只录舞台，不录壳层 UI | 录制模块 | 下载文件 | 是 | 生效 | 浏览器能力优先 |

## 待补齐（强制）

| 项目 | 缺口 | 负责人动作 | 验收 |
| --- | --- | --- | --- |
| tldraw 主舞台金手指隔离 | 保护补丁已加，完整覆盖层擦除体验未统一 | 将擦除能力收敛到独立覆盖层，不破坏底层 ABC | 画笔开启时底层元素不可被误删/误改 |
| 第二步“打开查看/重新生成”全路径语义 | 主入口已拆分，需继续防回归 | 在 workflow 声明与自动化验收里固化 | UI 与文档语义一致 |
