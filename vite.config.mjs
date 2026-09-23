// @@API_TTS_COSYVOICE @@API_RECOGNITION @@API_SCRIPT_AGENT @@API_FEISHU_IMPORT @@API_HEALTH @@API_TTS_AUDIO
// Vite dev gateway: 集中承载所有后端 API 端点（TTS/OCR/Agent/飞书）
// 端口：127.0.0.1:5196；环境变量：DASHSCOPE_API_KEY, FEISHU_WEBHOOK_SECRET
import react from '@vitejs/plugin-react';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { createFeishuBoardScriptImportResponse } from './scripts/feishu-board-script-import.mjs';
import {
  compileScriptAgentRowsToDraft,
  readScriptAgentRows,
} from './scripts/script-agent-rows-contract.mjs';
import {
  COSYVOICE_DEFAULT_VOICE,
  COSYVOICE_MODEL,
  COSYVOICE_REST_URL,
  createCosyVoiceRestRequestBody,
} from './scripts/cosyvoice-contract.mjs';
import { loadLocalEnv } from './scripts/load-local-env.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = join(projectRoot, '.tmp-cosyvoice-smoke');

export default defineConfig({
  plugins: [react(), cosyVoiceDevGateway()],
  server: {
    host: '127.0.0.1',
    port: 5196,
  },
});

function cosyVoiceDevGateway() {
  return {
    name: 'cleanroom-cosyvoice-dev-gateway',
    configureServer(server) {
      loadLocalEnv({ cwd: projectRoot });
      mkdirSync(outputDir, { recursive: true });

      server.middlewares.use('/api/health', (_request, response) => {
        sendJson(response, 200, {
          service: 'cleanroom-vite-gateway',
          status: 'ok',
        });
      });

      server.middlewares.use('/api/feishu/board-script/import', async (request, response) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, status: 'failed' });
          return;
        }

        const secret = (process.env.FEISHU_WEBHOOK_SECRET || '').trim();
        const secretHeaderName = (process.env.FEISHU_WEBHOOK_SECRET_HEADER || 'X-Feishu-Webhook-Secret').trim();
        if (secret) {
          const receivedSecret = request.headers[secretHeaderName.toLowerCase()];
          if (receivedSecret !== secret) {
            sendJson(response, 401, {
              error: { code: 'INVALID_FEISHU_WEBHOOK_SECRET', message: `${secretHeaderName} is invalid.` },
              status: 'failed',
            });
            return;
          }
        }

        try {
          const body = await readJsonBody(request);
          sendJson(response, 200, createFeishuBoardScriptImportResponse(body, { secretConfigured: Boolean(secret) }));
        } catch (error) {
          sendJson(response, 500, {
            error: {
              code: 'FEISHU_IMPORT_GATEWAY_ERROR',
              message: error instanceof Error ? error.message : String(error),
            },
            status: 'failed',
          });
        }
      });

      server.middlewares.use('/api/tts/cosyvoice/audio', (request, response) => {
        const fileName = basename(decodeURIComponent(request.url?.split('/').pop() || ''));
        if (!fileName.endsWith('.mp3') && !fileName.endsWith('.wav')) {
          sendJson(response, 400, { error: { code: 'INVALID_AUDIO_FILE', message: 'Only mp3/wav files are served.' } });
          return;
        }

        const audioPath = join(outputDir, fileName);
        if (!existsSync(audioPath)) {
          sendJson(response, 404, { error: { code: 'AUDIO_NOT_FOUND', message: 'Audio file not found.' } });
          return;
        }

        const audioBuffer = readFileSync(audioPath);
        response.statusCode = 200;
        response.setHeader('Content-Length', audioBuffer.length);
        response.setHeader('Content-Type', getAudioContentType(fileName));
        response.end(audioBuffer);
      });

      server.middlewares.use('/api/tts/cosyvoice/sentences', async (request, response) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } });
          return;
        }

        const apiKey = process.env.DASHSCOPE_API_KEY;
        if (!apiKey) {
          sendJson(response, 500, { error: { code: 'MISSING_DASHSCOPE_API_KEY', message: 'DASHSCOPE_API_KEY is missing.' } });
          return;
        }

        try {
          const body = await readJsonBody(request);
          const sentences = validateSentences(body.sentences);
          // @xiaxia-settings-hint: Aliyun A-track settings bridge; mirrors scripts/cosyvoice-gateway.mjs.
          const format = normalizeAudioFormat(body.format);
          const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : COSYVOICE_MODEL;
          const sampleRate = normalizeSampleRate(body.sampleRate);
          const voice = typeof body.voice === 'string' && body.voice.trim() ? body.voice.trim() : COSYVOICE_DEFAULT_VOICE;
          const wordTimestampEnabled = typeof body.wordTimestampEnabled === 'boolean' ? body.wordTimestampEnabled : true;
          const results = [];

          for (const sentence of sentences) {
            results.push(await synthesizeSentence({ apiKey, format, model, sampleRate, sentence, voice, wordTimestampEnabled }));
          }

          sendJson(response, 200, {
            format,
            model,
            results,
            sampleRate,
            status: results.every((result) => result.status === 'ready') ? 'ok' : 'partial',
            voice,
            wordTimestampEnabled,
          });
        } catch (error) {
          sendJson(response, 500, {
            error: {
              code: 'COSYVOICE_GATEWAY_ERROR',
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      });

      server.middlewares.use('/api/recognition/problem-text', async (request, response) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, status: 'failed' });
          return;
        }

        try {
          const body = await readJsonBody(request);
          const config = body.config && typeof body.config === 'object' ? body.config : {};
          const apiKeyRef = typeof config.apiKeyRef === 'string' && config.apiKeyRef.trim() ? config.apiKeyRef.trim() : 'DASHSCOPE_API_KEY';
          const apiKey = process.env[apiKeyRef];
          if (!apiKey) {
            sendJson(response, 500, {
              error: { code: 'MISSING_RECOGNITION_API_KEY', message: `${apiKeyRef} is missing.` },
              status: 'failed',
            });
            return;
          }

          const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';
          if (!imageDataUrl.startsWith('data:image/')) {
            sendJson(response, 400, {
              error: { code: 'MISSING_IMAGE_DATA_URL', message: 'imageDataUrl is required.' },
              status: 'failed',
            });
            return;
          }

          const result = await requestProblemTextRecognition({
            apiKey,
            config,
            imageDataUrl,
            imageName: typeof body.imageName === 'string' ? body.imageName : '',
          });

          sendJson(response, 200, {
            model: result.model,
            problemText: result.problemText,
            requestId: result.requestId,
            status: 'ok',
          });
        } catch (error) {
          sendJson(response, 500, {
            error: {
              code: 'RECOGNITION_GATEWAY_ERROR',
              message: error instanceof Error ? error.message : String(error),
            },
            status: 'failed',
          });
        }
      });

      server.middlewares.use('/api/agent/script-board', async (request, response) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, status: 'failed' });
          return;
        }

        try {
          const body = await readJsonBody(request);
          const config = body.config && typeof body.config === 'object' ? body.config : {};
          const apiKeyRef = typeof config.apiKeyRef === 'string' && config.apiKeyRef.trim() ? config.apiKeyRef.trim() : 'DASHSCOPE_API_KEY';
          const apiKey = process.env[apiKeyRef];
          if (!apiKey) {
            sendJson(response, 500, {
              error: { code: 'MISSING_SCRIPT_AGENT_API_KEY', message: `${apiKeyRef} is missing.` },
              status: 'failed',
            });
            return;
          }

          const problemText = typeof body.problemText === 'string' ? body.problemText.trim() : '';
          if (!problemText) {
            sendJson(response, 400, {
              error: { code: 'MISSING_PROBLEM_TEXT', message: 'problemText is required.' },
              status: 'failed',
            });
            return;
          }

          const agentResult = await requestScriptBoardAgent({
            apiKey,
            config,
            problemText,
            revisionPrompt: typeof body.revisionPrompt === 'string' ? body.revisionPrompt.trim() : '',
          });

          sendJson(response, 200, {
            draft: agentResult.draft,
            model: agentResult.model,
            requestId: agentResult.requestId,
            status: 'ok',
          });
        } catch (error) {
          sendJson(response, 500, {
            error: {
              code: 'SCRIPT_AGENT_GATEWAY_ERROR',
              message: error instanceof Error ? error.message : String(error),
            },
            status: 'failed',
          });
        }
      });

      server.middlewares.use('/api/agent/board-layout-preview', async (request, response) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, status: 'failed' });
          return;
        }

        try {
          const body = await readJsonBody(request);
          const config = body.config && typeof body.config === 'object' ? body.config : {};
          const rows = Array.isArray(body.rows) ? body.rows : [];
          const stageCanvas = body.stageCanvas && typeof body.stageCanvas === 'object' ? body.stageCanvas : {};

          if (!rows.length) {
            sendJson(response, 400, {
              error: { code: 'INVALID_ROWS', message: 'rows must be a non-empty array.' },
              status: 'failed',
            });
            return;
          }

          const apiKeyRef = typeof config.apiKeyRef === 'string' && config.apiKeyRef.trim() ? config.apiKeyRef.trim() : 'DASHSCOPE_API_KEY';
          const apiKey = process.env[apiKeyRef];
          const problemText = typeof body.problemText === 'string' ? body.problemText.trim() : '';

          const preview = apiKey
            ? await resolveBoardLayoutPreviewWithFallback({ apiKey, config, problemText, rows, stageCanvas })
            : createFallbackBoardLayoutPreview({ rows, stageCanvas });

          sendJson(response, 200, {
            preview,
            status: 'ok',
          });
        } catch (error) {
          sendJson(response, 500, {
            error: {
              code: 'BOARD_LAYOUT_PREVIEW_GATEWAY_ERROR',
              message: error instanceof Error ? error.message : String(error),
            },
            status: 'failed',
          });
        }
      });
    },
  };
}

async function requestProblemTextRecognition({ apiKey, config, imageDataUrl, imageName }) {
  const endpoint =
    typeof config.endpoint === 'string' && config.endpoint.trim()
      ? config.endpoint.trim()
      : 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  const model = typeof config.modelName === 'string' && config.modelName.trim() ? config.modelName.trim() : 'qwen3.6-flash';
  const systemPrompt = [
    typeof config.promptSystem === 'string' ? config.promptSystem.trim() : '',
    '请严格输出 JSON，不要输出 Markdown。JSON 格式：{"problemText":"整理后的题文"}。',
  ]
    .filter(Boolean)
    .join('\n\n');
  const template =
    typeof config.promptUserTemplate === 'string' && config.promptUserTemplate.trim()
      ? config.promptUserTemplate
      : '请识别并整理这道数学题。题图或题文内容：{{problemInput}}';
  const userText = template.replaceAll('{{problemInput}}', imageName || '用户上传的题目图片').replaceAll('{{problemText}}', '');

  const providerResponse = await fetch(endpoint, {
    body: JSON.stringify({
      messages: [
        { content: systemPrompt, role: 'system' },
        {
          content: [
            {
              image_url: {
                url: imageDataUrl,
              },
              type: 'image_url',
            },
            {
              text: userText,
              type: 'text',
            },
          ],
          role: 'user',
        },
      ],
      model,
      stream: false,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  const providerText = await providerResponse.text();
  if (!providerResponse.ok) {
    throw new Error(`HTTP ${providerResponse.status} ${sanitizeProviderText(providerText, apiKey)}`.trim());
  }

  const payload = JSON.parse(providerText);
  const content = payload.choices?.[0]?.message?.content;
  return {
    model,
    problemText: parseProblemTextRecognition(typeof content === 'string' ? content : ''),
    requestId: payload.request_id || payload.requestId || payload.id || '',
  };
}

function parseProblemTextRecognition(content) {
  const normalized = content.trim();
  if (!normalized) {
    throw new Error('Recognition returned empty content.');
  }

  const jsonText = extractJsonObject(normalized);
  if (jsonText) {
    const parsed = JSON.parse(jsonText);
    const problemText = typeof parsed.problemText === 'string' ? parsed.problemText.trim() : '';
    if (problemText) {
      return problemText;
    }
  }

  return normalized;
}

async function requestScriptBoardAgent({ apiKey, config, problemText, revisionPrompt }) {
  const endpoint =
    typeof config.endpoint === 'string' && config.endpoint.trim()
      ? config.endpoint.trim()
      : 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  const model = typeof config.modelName === 'string' && config.modelName.trim() ? config.modelName.trim() : 'qwen3.6-flash';
  const systemPrompt = [
    typeof config.promptSystem === 'string' ? config.promptSystem.trim() : '',
    '请严格输出 JSON，不要输出 Markdown。必须输出 {"rows":[{"id":"row-1","section":"开场读题","stepLabel":"读题","voiceText":"口播内容","boardSlice":"板书内容或空字符串"}]}。一行 rows 是一个候选 A 轨语音切片；开场读题主身份是 A-template-open；为防后续错位，prompt/template 层同时保留 B-template-open / C-template-open 占位，当前 boardSlice 必须留空；分析题目对应 A-template-pre，B-template-pre/C-template-pre 一一对应，可按需要填写 C 素材候选；正式解题步骤才允许 A1/B1/C1 递增，boardSlice 写核心 C 素材候选；梳理总结对应 A-template-end，B-template-end/C-template-end 一一对应，可按需要填写 C 素材候选。不要输出 spokenScript/boardPlan；表格模式不要手写 <br> 或 <b>。语气要求：易懂短句，不端着，不硬拗术语。',
  ]
    .filter(Boolean)
    .join('\n\n');
  const template =
    typeof config.promptUserTemplate === 'string' && config.promptUserTemplate.trim()
      ? config.promptUserTemplate
      : '请基于已确认题文生成 rows 表格候选稿。一行 rows 是一个候选 A 轨语音切片；开场读题主身份是 A-template-open；为防后续错位，prompt/template 层同时保留 B-template-open / C-template-open 占位，当前 boardSlice 必须留空；分析题目对应 A-template-pre，B-template-pre/C-template-pre 一一对应，可按需要填写 C 素材候选；正式解题步骤才允许 A1/B1/C1 递增，boardSlice 写核心 C 素材候选；梳理总结对应 A-template-end，B-template-end/C-template-end 一一对应，可按需要填写 C 素材候选；Agent 和用户不要手写 <br> / <b> / ##。题文：{{problemText}}';
  const userPrompt = [
    template.replaceAll('{{problemText}}', problemText).replaceAll('{{problemInput}}', problemText),
    revisionPrompt ? `用户补充要求：${revisionPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const providerResponse = await fetch(endpoint, {
    body: JSON.stringify({
      enable_thinking: true,
      messages: [
        { content: systemPrompt, role: 'system' },
        { content: userPrompt, role: 'user' },
      ],
      model,
      stream: false,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  const providerText = await providerResponse.text();
  if (!providerResponse.ok) {
    throw new Error(`HTTP ${providerResponse.status} ${sanitizeProviderText(providerText, apiKey)}`.trim());
  }

  const payload = JSON.parse(providerText);
  const content = payload.choices?.[0]?.message?.content;
  const draft = parseScriptAgentDraft(typeof content === 'string' ? content : '');
  return {
    draft,
    model,
    requestId: payload.request_id || payload.requestId || payload.id || '',
  };
}

async function requestBoardLayoutPreviewAgent({ apiKey, config, problemText, rows, stageCanvas }) {
  const endpoint =
    typeof config.endpoint === 'string' && config.endpoint.trim()
      ? config.endpoint.trim()
      : 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  const model = typeof config.modelName === 'string' && config.modelName.trim() ? config.modelName.trim() : 'qwen3.6-flash';
  const systemPrompt = [
    '你是板书排版预览助手。只输出 JSON，不要输出 Markdown。',
    '你要根据 rows 里的 boardSlice 给出整版板书预览布局。',
    '输出格式：{"version":"c-layout-preview-v1","items":[{"id":"preview-item-1","rowId":"row-1","chainKey":"step-1","text":"...","xPercent":30,"yPercent":40,"widthPercent":26,"fontSize":64,"groupKey":"题目|分析|解答|总结","stackIndex":1}],"generatedAt":"ISO时间"}',
    '规则：xPercent/yPercent/widthPercent 必须是 0-100 之间数字；只保留 boardSlice 非空行；默认展示整版，不按播放窗口裁剪。groupKey 必须使用四区标签：题目、分析、解答、总结。',
  ].join('\n');

  const userPrompt = JSON.stringify({
    problemText,
    rows,
    stageCanvas,
  });

  const providerResponse = await fetch(endpoint, {
    body: JSON.stringify({
      enable_thinking: true,
      messages: [
        { content: systemPrompt, role: 'system' },
        { content: userPrompt, role: 'user' },
      ],
      model,
      stream: false,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  const providerText = await providerResponse.text();
  if (!providerResponse.ok) {
    throw new Error(`HTTP ${providerResponse.status} ${sanitizeProviderText(providerText, apiKey)}`.trim());
  }

  const payload = JSON.parse(providerText);
  const content = payload.choices?.[0]?.message?.content;
  return parseBoardLayoutPreview(typeof content === 'string' ? content : '', stageCanvas, rows);
}

async function resolveBoardLayoutPreviewWithFallback({ apiKey, config, problemText, rows, stageCanvas }) {
  try {
    return await requestBoardLayoutPreviewAgent({ apiKey, config, problemText, rows, stageCanvas });
  } catch {
    return createFallbackBoardLayoutPreview({ rows, stageCanvas });
  }
}

function parseBoardLayoutPreview(content, stageCanvas, rows) {
  const normalized = content.trim();
  if (!normalized) {
    return createFallbackBoardLayoutPreview({ rows, stageCanvas });
  }

  const jsonText = extractJsonObject(normalized);
  if (!jsonText) {
    return createFallbackBoardLayoutPreview({ rows, stageCanvas });
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed.items)) {
      return createFallbackBoardLayoutPreview({ rows, stageCanvas });
    }

    const rowSectionMap = new Map(rows.map((row) => [String(row.id || ''), String(row.section || '')]));

    return {
      version: 'c-layout-preview-v1',
      generatedAt: typeof parsed.generatedAt === 'string' && parsed.generatedAt.trim() ? parsed.generatedAt : new Date().toISOString(),
      items: parsed.items
        .map((item, index) => {
          const rowId = String(item.rowId || '');
          const sourceSection = rowSectionMap.get(rowId) ?? '';
          return {
            id: String(item.id || `preview-item-${index + 1}`),
            rowId,
            chainKey: typeof item.chainKey === 'string' ? item.chainKey : undefined,
            text: String(item.text || ''),
            xPercent: clampNumber(item.xPercent, 0, 100),
            yPercent: clampNumber(item.yPercent, 0, 100),
            widthPercent: clampNumber(item.widthPercent, 10, 100),
            fontSize: clampNumber(item.fontSize, 16, 120),
            groupKey: normalizeAreaGroupKey(item.groupKey, sourceSection),
            stackIndex: Number.isFinite(Number(item.stackIndex)) ? Number(item.stackIndex) : index,
          };
        })
        .filter((item) => item.text.trim()),
    };
  } catch {
    return createFallbackBoardLayoutPreview({ rows, stageCanvas });
  }
}

function createFallbackBoardLayoutPreview({ rows, stageCanvas }) {
  const boardRows = rows
    .filter((row) => typeof row.boardSlice === 'string' && row.boardSlice.trim())
    .map((row, index) => ({
      ...row,
      _index: index,
      _area: normalizeAreaGroupKey('', row.section),
    }));

  const sortedRows = [...boardRows].sort((a, b) => {
    const rankA = readAreaRank(a._area);
    const rankB = readAreaRank(b._area);
    if (rankA !== rankB) return rankA - rankB;
    return a._index - b._index;
  });

  const areaCounters = new Map();

  const items = sortedRows.map((row, index) => {
    const area = row._area;
    const currentCount = areaCounters.get(area) ?? 0;
    areaCounters.set(area, currentCount + 1);

    const col = currentCount % 2;
    const line = Math.floor(currentCount / 2);

    const text = row.boardSlice.trim();
    const widthPercent = Math.min(40, Math.max(20, 18 + text.length * 0.42));
    const xPercent = col === 0 ? 14 : 52;
    const yPercent = Math.min(90, readAreaBaseY(area) + line * 9.5);

    return {
      id: `preview-item-${index + 1}`,
      rowId: String(row.id || `row-${index + 1}`),
      chainKey: typeof row.chainKey === 'string' ? row.chainKey : undefined,
      text,
      xPercent,
      yPercent,
      widthPercent,
      fontSize: clampNumber(stageCanvas?.boardFontSize ?? 64, 24, 96),
      groupKey: area,
      stackIndex: index,
    };
  });

  return {
    version: 'c-layout-preview-v1',
    generatedAt: new Date().toISOString(),
    items,
  };
}

function normalizeAreaGroupKey(groupKey, section) {
  const source = String((section || groupKey || '')).trim();

  if (source === '开场读题') return '题目';
  if (source === '分析题目') return '分析';
  if (source === '解题环节') return '解答';
  if (source === '梳理总结') return '总结';

  return '未分区';
}

function readAreaRank(area) {
  if (area === '题目') return 0;
  if (area === '分析') return 1;
  if (area === '解答') return 2;
  if (area === '总结') return 3;
  return 4;
}

function readAreaBaseY(area) {
  if (area === '题目') return 16;
  if (area === '分析') return 32;
  if (area === '解答') return 50;
  if (area === '总结') return 76;
  return 50;
}

function parseScriptAgentDraft(content) {
  const normalized = content.trim();
  if (!normalized) {
    throw new Error('Agent returned empty content.');
  }

  const jsonText = extractJsonObject(normalized);
  if (jsonText) {
    const parsed = JSON.parse(jsonText);
    const rows = readScriptAgentRows(parsed);
    if (rows.length) {
      return compileScriptAgentRowsToDraft(rows);
    }
  }

  throw new Error('Agent 必须返回 rows 表格候选 JSON；不要返回 spokenScript/boardPlan、Markdown 或普通正文。');
}

function extractJsonObject(content) {
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : content;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return '';
  }
  return candidate.slice(start, end + 1);
}

async function synthesizeSentence({ apiKey, format, model, sampleRate, sentence, voice, wordTimestampEnabled }) {
  try {
    const providerResponse = await fetch(COSYVOICE_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-SSE': 'enable',
      },
      body: JSON.stringify(
        // @xiaxia-settings-hint: Last local hop before DashScope; do not drop format/sampleRate/wordTimestampEnabled.
        createCosyVoiceRestRequestBody({
          format,
          model,
          sampleRate,
          text: sentence.text,
          voice,
          wordTimestampEnabled,
        }),
      ),
    });

    const providerText = await providerResponse.text();
    if (!providerResponse.ok) {
      return {
        audioUrl: '',
        durationMs: sentence.estimatedDurationMs || 1200,
        error: `HTTP ${providerResponse.status} ${sanitizeProviderText(providerText, apiKey)}`.trim(),
        sentenceId: sentence.id,
        status: 'failed',
        text: sentence.text,
        timingJson: '',
      };
    }

    const parsed = parseProviderEvents(providerText);
    if (!parsed.audioUrl) {
      return {
        audioUrl: '',
        durationMs: sentence.estimatedDurationMs || 1200,
        error: `No audio URL returned; requestId=${parsed.requestId || 'unknown'}`,
        requestId: parsed.requestId,
        sentenceId: sentence.id,
        status: 'failed',
        text: sentence.text,
        timingJson: JSON.stringify(parsed),
      };
    }

    const audioResponse = await fetch(parsed.audioUrl);
    if (!audioResponse.ok) {
      return {
        audioUrl: '',
        durationMs: sentence.estimatedDurationMs || parsed.durationMs || 1200,
        error: `Audio download failed: HTTP ${audioResponse.status}`,
        requestId: parsed.requestId,
        sentenceId: sentence.id,
        status: 'failed',
        text: sentence.text,
        timingJson: JSON.stringify(parsed),
      };
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    const fileName = `${safeFilePart(sentence.id)}-${Date.now()}.${format}`;
    writeFileSync(join(outputDir, fileName), audioBuffer);

    return {
      audioBytes: audioBuffer.length,
      audioUrl: `/api/tts/cosyvoice/audio/${fileName}`,
      durationMs: parsed.durationMs || sentence.estimatedDurationMs || 1200,
      requestId: parsed.requestId,
      sentenceId: sentence.id,
      status: 'ready',
      text: sentence.text,
      timingJson: JSON.stringify(parsed),
    };
  } catch (error) {
    return {
      audioUrl: '',
      durationMs: sentence.estimatedDurationMs || 1200,
      error: error instanceof Error ? sanitizeProviderText(error.message, apiKey) : String(error),
      sentenceId: sentence.id,
      status: 'failed',
      text: sentence.text,
      timingJson: '',
    };
  }
}

function validateSentences(sentences) {
  if (!Array.isArray(sentences) || sentences.length === 0) {
    throw new Error('sentences must be a non-empty array.');
  }

  return sentences.map((sentence, index) => {
    const id = typeof sentence.id === 'string' && sentence.id.trim() ? sentence.id.trim() : `tts-sentence-${String(index + 1).padStart(3, '0')}`;
    const text = typeof sentence.text === 'string' ? sentence.text.trim() : '';
    if (!text) {
      throw new Error(`sentence ${id} text is required.`);
    }

    return {
      estimatedDurationMs: Number(sentence.estimatedDurationMs) || undefined,
      id,
      order: Number(sentence.order) || index + 1,
      text,
    };
  });
}

function normalizeAudioFormat(format) {
  return format === 'wav' ? 'wav' : 'mp3';
}

function normalizeSampleRate(sampleRate) {
  const value = Number(sampleRate);
  if (!Number.isFinite(value)) {
    return 22050;
  }
  return Math.min(48000, Math.max(8000, Math.round(value)));
}

function parseProviderEvents(rawText) {
  const result = {
    audioId: '',
    audioUrl: '',
    characters: undefined,
    durationMs: 0,
    expiresAt: undefined,
    requestId: '',
    sentences: [],
  };
  const sentenceMap = new Map();

  for (const payload of parseEventPayloads(rawText)) {
    result.requestId = payload.request_id || payload.requestId || result.requestId;
    result.characters = payload.usage?.characters ?? result.characters;

    const output = payload.output || {};
    const audio = output.audio || {};
    if (typeof audio.url === 'string' && audio.url) {
      result.audioUrl = audio.url;
    }
    if (typeof audio.id === 'string' && audio.id) {
      result.audioId = audio.id;
    }
    if (typeof audio.expires_at === 'number') {
      result.expiresAt = audio.expires_at;
    }

    const sentencePayload = output.sentence;
    if (sentencePayload && typeof sentencePayload.index === 'number') {
      const existing = sentenceMap.get(sentencePayload.index) || {
        index: sentencePayload.index,
        originalText: output.original_text || '',
        words: [],
      };

      if (output.original_text && !existing.originalText) {
        existing.originalText = output.original_text;
      }

      if (Array.isArray(sentencePayload.words)) {
        existing.words = sentencePayload.words.map((word) => ({
          beginIndex: Number(word.begin_index || 0),
          beginTime: Number(word.begin_time || 0),
          endIndex: Number(word.end_index || 0),
          endTime: Number(word.end_time || 0),
          text: String(word.text || ''),
        }));
      }

      sentenceMap.set(sentencePayload.index, existing);
    }
  }

  result.sentences = Array.from(sentenceMap.values()).sort((first, second) => first.index - second.index);
  result.durationMs = result.sentences.reduce((max, sentence) => {
    const sentenceEnd = sentence.words.reduce((wordMax, word) => Math.max(wordMax, word.endTime), 0);
    return Math.max(max, sentenceEnd);
  }, 0);
  return result;
}

function parseEventPayloads(rawText) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('{')) {
    return [JSON.parse(trimmed)];
  }

  const payloads = [];
  for (const line of rawText.split(/\r?\n/)) {
    if (!line.startsWith('data:')) {
      continue;
    }

    const data = line.slice('data:'.length).trim();
    if (!data || data === '[DONE]') {
      continue;
    }

    payloads.push(JSON.parse(data));
  }

  return payloads;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16 * 1024 * 1024) {
      throw new Error('Request body is too large.');
    }
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  if (!rawBody.trim()) {
    return {};
  }
  return JSON.parse(rawBody);
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function getAudioContentType(fileName) {
  return fileName.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
}

function safeFilePart(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48);
}

function sanitizeProviderText(text, apiKey) {
  return String(text).replaceAll(apiKey, '[REDACTED]').slice(0, 800);
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.min(max, Math.max(min, numeric));
}
