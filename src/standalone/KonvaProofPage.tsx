// @cleanroom-component: KonvaProofPage
// @domain: standalone-prototype
// @route: standalone=konva-proof
// @depends: StageCanvasConfig, TimelineClip(kind=board), boardReveal/getBoardRevealProgress, boardStickerGeometry defaults, react-konva
// @boundary: proof-of-capability only; validates Konva content-layer rendering against current project truth, does not rewrite the main workflow

import { Button, Card, Input, Slider, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { Group, Layer, Rect, Stage, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { StageCanvasConfig, TimelineClip } from '../domain/teachingProject';
import { getBoardRevealProgress } from '../modules/boardReveal/getBoardRevealProgress';
import { DEFAULT_BOARD_DRAW_SPEED } from '../modules/boardReveal/boardRevealConfig';
import {
  DEFAULT_BOARD_STICKER_WIDTH_PERCENT,
  DEFAULT_BOARD_STICKER_X_PERCENT,
  DEFAULT_BOARD_STICKER_Y_PERCENT,
  getBoardStickerFontSize,
} from '../modules/boardSticker/boardStickerGeometry';
import {
  COURSEWARE_LABEL_HEIGHT_RATIO,
  COURSEWARE_LABEL_LEFT_RATIOS,
  COURSEWARE_LABEL_TOP_RATIOS,
  COURSEWARE_LABEL_WIDTH_RATIO,
  COURSEWARE_PROBLEM_LEFT_RATIO,
  COURSEWARE_PROBLEM_MAX_WIDTH_RATIO,
  COURSEWARE_PROBLEM_TOP_RATIO,
  COURSEWARE_SYSTEM_FONT_FAMILY,
  resolveProblemFontSize,
} from '../modules/canvasStage/coursewareChrome';
import {
  createBoardTypographyConfig,
  DEFAULT_BOARD_FONT_NAME,
  DEFAULT_BOARD_FONT_URL,
} from '../modules/boardFont/boardFontConfig';

const { Text: AntText, Title } = Typography;

const PROOF_CANVAS: StageCanvasConfig = {
  background: '#ffffff',
  ...createBoardTypographyConfig({
    boardFontName: DEFAULT_BOARD_FONT_NAME,
    boardFontSize: 42,
    boardFontUrl: DEFAULT_BOARD_FONT_URL,
  }),
  height: 720,
  preset: 'landscape-720p',
  width: 1280,
};

const SAMPLE_PROBLEM_TEXT = '例题：一辆车 2 小时行驶 120 公里，平均每小时行驶多少公里？';
const SAMPLE_LABELS = [
  '120 ÷ 2 = 60',
  '先算总路程，再算每小时\n120÷2=60',
  'x = 3\ny = 2×3+1 = 7',
];

function createDemoClip(label: string): TimelineClip {
  return {
    color: '#171717',
    drawSpeed: DEFAULT_BOARD_DRAW_SPEED,
    endMs: 14000,
    fontSize: 42,
    id: 'konva-proof-clip-1',
    kind: 'board',
    label,
    revealEndMs: 9000,
    revealStartMs: 0,
    sourceEndMs: 9000,
    sourceStartMs: 0,
    startMs: 0,
    trackId: 'track-board',
    widthPercent: 48,
    xPercent: 58,
    yPercent: 56,
  };
}

export function KonvaProofPage() {
  const [playheadMs, setPlayheadMs] = useState(3000);
  const [boardLabel, setBoardLabel] = useState(SAMPLE_LABELS[0]);
  const [clip, setClip] = useState<TimelineClip>(() => createDemoClip(SAMPLE_LABELS[0]));

  const boardFontSize = getBoardStickerFontSize(clip.fontSize, PROOF_CANVAS.boardFontSize);
  const revealProgress = getBoardRevealProgress({
    drawSpeed: clip.drawSpeed,
    playheadMs,
    revealEndMs: clip.revealEndMs ?? clip.sourceEndMs ?? clip.endMs,
    revealStartMs: clip.revealStartMs ?? clip.sourceStartMs ?? clip.startMs,
  });

  const visibleText = useMemo(() => {
    const sourceText = clip.label.trim();
    const visibleLength = Math.max(1, Math.ceil(sourceText.length * revealProgress));
    return sourceText.slice(0, visibleLength);
  }, [clip.label, revealProgress]);

  const boardX = PROOF_CANVAS.width * ((clip.xPercent ?? DEFAULT_BOARD_STICKER_X_PERCENT) / 100);
  const boardY = PROOF_CANVAS.height * ((clip.yPercent ?? DEFAULT_BOARD_STICKER_Y_PERCENT) / 100);
  const boardWidth = PROOF_CANVAS.width * ((clip.widthPercent ?? DEFAULT_BOARD_STICKER_WIDTH_PERCENT) / 100);
  const problemFontSize = resolveProblemFontSize(PROOF_CANVAS);

  const updateLabel = (nextLabel: string) => {
    setBoardLabel(nextLabel);
    setClip((current) => ({ ...current, label: nextLabel }));
  };

  const handleDragEnd = (event: KonvaEventObject<DragEvent>) => {
    const node = event.target;
    const nextXPercent = (node.x() / PROOF_CANVAS.width) * 100;
    const nextYPercent = (node.y() / PROOF_CANVAS.height) * 100;
    setClip((current) => ({
      ...current,
      xPercent: Number(nextXPercent.toFixed(2)),
      yPercent: Number(nextYPercent.toFixed(2)),
    }));
  };

  return (
    <div className="drawboard-standalone-page konva-proof-page">
      <header className="drawboard-standalone-page__header">
        <Title level={4}>Konva 内容层 Proof</Title>
        <AntText type="secondary">只验证第四步内容层承载：四区标签、题目区、C 板书 reveal、拖拽位置映射。</AntText>
      </header>

      <Card className="drawboard-standalone-page__controls" title="Konva Proof 控制台">
        <div className="drawboard-standalone-grid">
          <label>
            当前板书
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => updateLabel(event.target.value)} value={boardLabel} />
          </label>
          <label>
            进度 {playheadMs}ms
            <Slider max={14000} min={0} onChange={(value) => setPlayheadMs(Array.isArray(value) ? value[0] : value)} value={playheadMs} />
          </label>
          <Space size={8} wrap>
            <Button onClick={() => updateLabel(SAMPLE_LABELS[0])}>示例 1</Button>
            <Button onClick={() => updateLabel(SAMPLE_LABELS[1])}>示例 2</Button>
            <Button onClick={() => updateLabel(SAMPLE_LABELS[2])}>示例 3</Button>
          </Space>
          <div className="drawboard-standalone-row">
            <Tag color="blue">reveal: {Math.round(revealProgress * 100)}%</Tag>
            <Tag color="default">x: {Math.round(clip.xPercent ?? 0)}%</Tag>
            <Tag color="default">y: {Math.round(clip.yPercent ?? 0)}%</Tag>
            <Tag color="default">width: {Math.round(clip.widthPercent ?? 0)}%</Tag>
            <Tag color="default">font: {boardFontSize}px</Tag>
          </div>
        </div>
      </Card>

      <div className="konva-proof-stage-wrap">
        <Stage className="konva-proof-stage" height={PROOF_CANVAS.height} width={PROOF_CANVAS.width}>
          <Layer>
            <Rect
              cornerRadius={0}
              fill={PROOF_CANVAS.background}
              height={PROOF_CANVAS.height}
              stroke="#59cee5"
              strokeWidth={8}
              width={PROOF_CANVAS.width}
              x={0}
              y={0}
            />

            {([
              ['题目', COURSEWARE_LABEL_LEFT_RATIOS.problem, COURSEWARE_LABEL_TOP_RATIOS.problem],
              ['分析', COURSEWARE_LABEL_LEFT_RATIOS.analysis, COURSEWARE_LABEL_TOP_RATIOS.analysis],
              ['解答', COURSEWARE_LABEL_LEFT_RATIOS.solution, COURSEWARE_LABEL_TOP_RATIOS.solution],
              ['总结', COURSEWARE_LABEL_LEFT_RATIOS.summary, COURSEWARE_LABEL_TOP_RATIOS.summary],
            ] as const).map(([label, leftRatio, topRatio]) => {
              const x = PROOF_CANVAS.width * leftRatio;
              const y = PROOF_CANVAS.height * topRatio;
              const width = PROOF_CANVAS.width * COURSEWARE_LABEL_WIDTH_RATIO;
              const height = PROOF_CANVAS.height * COURSEWARE_LABEL_HEIGHT_RATIO;
              return (
                <Group key={label} x={x} y={y}>
                  <Rect cornerRadius={6} fill="#59cee5" height={height} width={Math.max(width * 0.72, 56)} />
                  <Text
                    align="center"
                    fill="#ffffff"
                    fontFamily={COURSEWARE_SYSTEM_FONT_FAMILY}
                    fontSize={12}
                    fontStyle="bold"
                    height={height}
                    text={label}
                    verticalAlign="middle"
                    width={Math.max(width * 0.72, 56)}
                    x={0}
                    y={0}
                  />
                </Group>
              );
            })}

            <Text
              fill="#243247"
              fontFamily={COURSEWARE_SYSTEM_FONT_FAMILY}
              fontSize={problemFontSize}
              fontStyle="600"
              lineHeight={1.46}
              text={SAMPLE_PROBLEM_TEXT}
              width={Math.min(PROOF_CANVAS.width * COURSEWARE_PROBLEM_MAX_WIDTH_RATIO, 520 * (PROOF_CANVAS.width / 1120))}
              x={PROOF_CANVAS.width * COURSEWARE_PROBLEM_LEFT_RATIO}
              y={PROOF_CANVAS.height * COURSEWARE_PROBLEM_TOP_RATIO}
            />

            <Text
              draggable
              fill={clip.color ?? '#171717'}
              fontFamily={PROOF_CANVAS.boardFontFamily}
              fontSize={boardFontSize}
              lineHeight={1.35}
              onDragEnd={handleDragEnd}
              text={visibleText}
              width={boardWidth}
              x={boardX}
              y={boardY}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
