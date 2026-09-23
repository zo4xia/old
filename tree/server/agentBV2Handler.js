import fs from 'node:fs'
import path from 'node:path'
import { AGENT_B_V2_SYSTEM_PROMPT } from '../src/agent-b-v2/prompt.js'
import { getSkillById, DEFAULT_SKILL_ID } from '../src/agent-b-v2/skills/index.js'
import { parseAgentBV2Response, normalizeAgentBV2BoardCells, sanitizeRowLayout, AGENT_B_V2_STAGES } from '../src/agent-b-v2/contract.js'
import { writeResultFile } from './boardResultStore.js'
// 画布参数唯一真源：src/services/stepHandoff.js
import {
  isOptions,
  readJsonBody,
  requestAnthropicMessage,
  requestChatCompletion,
  resolveUserCredentials,
  sendJson,
  getChatMessageText,
} from './http.js'

// ---------- 软降级：尽量从模型输出中提取可用的 rows ----------
// ponytail: 唯一真源已抽到 src/lib/parseLLMJson.js
import { parseLLMJson } from '../src/lib/parseLLMJson.js'

function parseJsonObjectLoose(text) {
  return parseLLMJson(text)
}

function tryExtractFallbackRows(text) {
  const parsed = parseJsonObjectLoose(text)
  if (!parsed || typeof parsed !== 'object') return null
  if (!Array.isArray(parsed.rows) || !parsed.rows.length) return null

  // 用 contract 的归一化函数提取能用的行
  // 非法 stage 会被兜底修正，非法 actionSpec 会被过滤掉
  const normalized = normalizeAgentBV2BoardCells(parsed.rows)
  return normalized.length ? normalized : null
}

const AGENT_B_SYSTEM_MESSAGE = AGENT_B_V2_SYSTEM_PROMPT

// ★ 2026-09-22 handoff 瘦身（用户拍板）：Agent B 只收 handoff 本体，不再有第二份白名单、
//   不再注入 `_字段名_说明` 注释条目、不再拼「画布舞台感知与内容排版提醒」等规范文案。
//   handoff 的字段集 = 交接台 UI 明文可见字段 + 题目原文（构建侧 src/services/stepHandoff.js 已收敛），
//   这里原样透传（值不碰），解读方式全部由系统提示词 prompt.js 负责。

function toAnthropicContent(content) {
  return content.flatMap((item) => {
    if (item.type === 'text') return [{ type: 'text', text: item.text }]
    const url = item.image_url?.url
    const dataUrl = typeof url === 'string' && url.match(/^data:([^;]+);base64,(.+)$/)
    if (dataUrl) {
      return [{
        type: 'image',
        source: { type: 'base64', media_type: dataUrl[1], data: dataUrl[2] },
      }]
    }
    if (typeof url === 'string') {
      return [{ type: 'image', source: { type: 'url', url } }]
    }
    return []
  })
}

export async function handleAgentBV2Request(req, res) {
  if (isOptions(req, res)) return true
  if (req.method !== 'POST') return false

  try {
    const body = await readJsonBody(req)
    let credentials
    try {
      credentials = resolveUserCredentials(body)
    } catch (error) {
      return sendJson(req, res, 400, {
        ok: false,
        error: error.message,
      })
    }
    const handoff = body.handoff || {}
    // system prompt 优先级：用户自定义 > 指定 skill > 默认 v2 prompt
    let systemMessage
    if (typeof body.systemPrompt === 'string' && body.systemPrompt.trim()) {
      systemMessage = body.systemPrompt.trim()
    } else {
      const skillId = body.skillId || DEFAULT_SKILL_ID
      const skill = getSkillById(skillId)
      systemMessage = skill ? skill.buildSystemPrompt() : AGENT_B_SYSTEM_MESSAGE
    }
    // ★ Agent B 用户消息 = handoff 本体（原样透传，值不碰）。字段怎么读由系统提示词统一说明，
    //   这里不再注入字段注释、坐标格式说明或舞台排版提醒等任何额外文案。
    const userContent = [
      { type: 'text', text: `【Agent A handoff】\nfile: handoff.json\n${JSON.stringify(handoff, null, 2)}` },
    ]

    // 支持视觉识别的模型：若有本地截图文件，安全提供视觉多模态输入
    let screenshotDataUrl = null
    if (handoff.screenshotUrl) {
      try {
        const rawUrl = String(handoff.screenshotUrl).trim()
        if (rawUrl.startsWith('data:image/')) {
          screenshotDataUrl = rawUrl
        } else {
          const cleanPath = rawUrl.replace(/^\//, '')
          const fullPath = path.resolve(process.cwd(), 'public', cleanPath)
          if (fs.existsSync(fullPath)) {
            const ext = path.extname(fullPath).toLowerCase().slice(1) || 'jpeg'
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
            const base64 = fs.readFileSync(fullPath).toString('base64')
            screenshotDataUrl = `data:${mime};base64,${base64}`
          }
        }
      } catch (err) {
        console.warn('[Agent B] 截图读取跳过:', err.message)
      }
    }
    const isAnthropic = body.apiType === 'anthropic-messages'
    const modelLower = String(credentials.model || '').toLowerCase()
    const isVisionModel = isAnthropic || modelLower.includes('vision') || modelLower.includes('4o') || modelLower.includes('claude') || modelLower.includes('gemini')
    if (screenshotDataUrl && isVisionModel) {
      userContent.push({
        type: 'image_url',
        image_url: { url: screenshotDataUrl },
      })
    }

    const MAX_RETRIES = 2
    let parsed = null
    let lastText = ''
    let lastData = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // 静默重试：不把解析错误抛给用户，带上错误反馈让模型自己修正重出
      const currentUserContent = attempt === 0
        ? userContent
        : [
            ...userContent,
            {
              type: 'text',
              text: `【上一次输出解析失败，请修正后重新输出完整结果】错误：${parsed.error}。硬性要求：顶层必须是 JSON 对象 {"rows":[...]}；每行必须含 stage/speech/board/actionSpec 五字段；stage 仅限"题目""分析""解答""总结"四种值，禁止使用"思路""讲解""过程""步骤""方法""计算""答案"等同义词。`,
            },
          ]

      const { response, data } = isAnthropic
        ? await requestAnthropicMessage({
            ...credentials,
            timeoutMs: 90000,
            body: {
              system: systemMessage,
              max_tokens: 8192,
              temperature: Number(body.temperature ?? 0.7),
              messages: [{ role: 'user', content: toAnthropicContent(currentUserContent) }],
            },
          })
        : await requestChatCompletion({
            ...credentials,
            timeoutMs: 300000,
            body: {
              temperature: Number(body.temperature ?? 0.7),
              stream: false,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: currentUserContent },
              ],
            },
          })

      if (!response.ok) {
        return sendJson(req, res, response.status, {
          ok: false,
          error: data?.error?.message || data?.message || `上游失败 ${response.status}`,
        })
      }

      lastText = isAnthropic
        ? getChatMessageText(data)
        : getChatMessageText(data?.choices?.[0]?.message)
      lastData = data
      parsed = parseAgentBV2Response(lastText, {
        problemType: handoff?.problemType,
        allowSynonyms: attempt === MAX_RETRIES,
        boardPlan: handoff?.boardPlan,
        canvasParams: handoff?.canvasParams,
        coordinateMode: body.canvasParams?.coordinateMode,
      })

      if (parsed.ok) break
      // 所有解析失败（JSON 格式错、缺 rows、非法 stage 等）都带错误反馈静默重试
      console.warn(`[Agent B] 第 ${attempt + 1} 次输出解析失败(${parsed.code || 'CONTRACT_INVALID'})，${attempt < MAX_RETRIES ? '带错误反馈重试' : '进入软降级提取'}`)
    }

    if (!parsed.ok) {
      // 软降级：解析失败时尽量提取能用的 rows，不直接报错
      // 只有完全拿不到 rows 时才返回错误
      const rawFallback = tryExtractFallbackRows(lastText)
      if (rawFallback && rawFallback.length) {
        const fallbackRows = sanitizeRowLayout(rawFallback, {
          boardPlan: handoff?.boardPlan,
          canvasParams: handoff?.canvasParams,
          coordinateMode: body.canvasParams?.coordinateMode,
        })
        const resultPayload = {
          rows: fallbackRows,
          model: credentials.model,
          skillId: body.skillId || DEFAULT_SKILL_ID,
          handoff: handoff || null,
          usage: lastData?.usage || null,
          finishReason: lastData?.stop_reason || lastData?.choices?.[0]?.finish_reason || '',
          createdAt: new Date().toISOString(),
          degraded: true,
          degradeReason: parsed.error,
          degradeCode: parsed.code || 'AGENT_B_V2_CONTRACT_INVALID',
        }
        const { projectCode, filename } = writeResultFile(resultPayload)
        return sendJson(req, res, 200, {
          ok: true,
          model: credentials.model,
          rows: fallbackRows,
          // R2-1 收敛：problemText/boardPlan 提到响应顶层（原埋在 handoff 内层），下游不必再解包
          problemText: handoff?.problemText || '',
          boardPlan: handoff?.boardPlan || handoff?.zoneAnchors || null,
          projectCode,
          filename,
          finishReason: lastData?.stop_reason || lastData?.choices?.[0]?.finish_reason || '',
          usage: lastData?.usage || null,
          degraded: true,
          degradeReason: parsed.error,
          degradeCode: parsed.code || 'AGENT_B_V2_CONTRACT_INVALID',
          warning: 'Agent B 输出格式不完全符合规范，已尽力提取可用内容，建议检查或重新生成',
        })
      }
      // 完全提取不出来才返回错误
      return sendJson(req, res, 422, {
        ok: false,
        code: parsed.code || 'AGENT_B_V2_CONTRACT_INVALID',
        error: parsed.error,
        finishReason: lastData?.stop_reason || lastData?.choices?.[0]?.finish_reason || '',
        usage: lastData?.usage || null,
        diagnostic: { rawTextHead: lastText.slice(0, 500), retried: parsed.code === 'INVALID_STAGE' },
      })
    }
    // 写入实体文件存档（B 生成结果的唯一真相源）
    const resultPayload = {
      rows: parsed.value,
      model: credentials.model,
      skillId: body.skillId || DEFAULT_SKILL_ID,
      handoff: handoff || null,
      usage: lastData?.usage || null,
      finishReason: lastData?.stop_reason || lastData?.choices?.[0]?.finish_reason || '',
      createdAt: new Date().toISOString(),
    }
    const { projectCode, filename } = writeResultFile(resultPayload)
    return sendJson(req, res, 200, {
      ok: true,
      model: credentials.model,
      rows: parsed.value,
      // R2-1 收敛：problemText/boardPlan 提到响应顶层（原埋在 handoff 内层），下游不必再解包
      problemText: handoff?.problemText || '',
      boardPlan: handoff?.boardPlan || handoff?.zoneAnchors || null,
      projectCode,
      filename,
      finishReason: lastData?.stop_reason || lastData?.choices?.[0]?.finish_reason || '',
      usage: lastData?.usage || null,
    })
  } catch (error) {
    const status = error?.name === 'AbortError' ? 504 : 500
    return sendJson(req, res, status, {
      ok: false,
      error: error?.name === 'AbortError' ? 'Agent B 上游大模型响应超时（已为您持续等待 300 秒），请检查网络或更换响应更快的大模型' : error?.message || String(error),
    })
  }
}

export function agentBV2ProxyPlugin() {
  return {
    name: 'agent-b-v2-direct-proxy',
    configureServer(server) {
      server.middlewares.use('/api/agent-b-v2/generate', (req, res, next) => {
        Promise.resolve(handleAgentBV2Request(req, res)).then((handled) => {
          if (!handled) next()
        }).catch(next)
      })
    },
  }
}
