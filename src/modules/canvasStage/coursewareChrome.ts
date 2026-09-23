import type { CSSProperties } from 'react';
import type { StageCanvasConfig } from '../../domain/teachingProject';

export const COURSEWARE_SYSTEM_FONT_FAMILY =
  'Inter, "Microsoft YaHei", "PingFang SC", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const COURSEWARE_LABEL_LEFT_RATIO = 0.017;
export const COURSEWARE_LABEL_WIDTH_RATIO = 0.041;
export const COURSEWARE_LABEL_HEIGHT_RATIO = 0.026;
export const COURSEWARE_PROBLEM_LEFT_RATIO = 0.027;
export const COURSEWARE_PROBLEM_TOP_RATIO = 0.072;
export const COURSEWARE_PROBLEM_MAX_WIDTH_RATIO = 0.44;
export const COURSEWARE_LABEL_TOP_RATIOS = {
  problem: 0.024,
  analysis: 0.24,
  solution: 0.024,
  summary: 0.74,
} as const;
export const COURSEWARE_LABEL_LEFT_RATIOS = {
  problem: COURSEWARE_LABEL_LEFT_RATIO,
  analysis: COURSEWARE_LABEL_LEFT_RATIO,
  solution: 0.5,
  summary: COURSEWARE_LABEL_LEFT_RATIO,
} as const;

export function createCoursewareChromeStyleVars(canvas: StageCanvasConfig): CSSProperties {
  return {
    '--courseware-label-problem-left': toPercent(COURSEWARE_LABEL_LEFT_RATIOS.problem),
    '--courseware-label-analysis-left': toPercent(COURSEWARE_LABEL_LEFT_RATIOS.analysis),
    '--courseware-label-solution-left': toPercent(COURSEWARE_LABEL_LEFT_RATIOS.solution),
    '--courseware-label-summary-left': toPercent(COURSEWARE_LABEL_LEFT_RATIOS.summary),
    '--courseware-label-problem-top': toPercent(COURSEWARE_LABEL_TOP_RATIOS.problem),
    '--courseware-label-analysis-top': toPercent(COURSEWARE_LABEL_TOP_RATIOS.analysis),
    '--courseware-label-solution-top': toPercent(COURSEWARE_LABEL_TOP_RATIOS.solution),
    '--courseware-label-summary-top': toPercent(COURSEWARE_LABEL_TOP_RATIOS.summary),
    '--courseware-problem-left': toPercent(COURSEWARE_PROBLEM_LEFT_RATIO),
    '--courseware-problem-top': toPercent(COURSEWARE_PROBLEM_TOP_RATIO),
    '--courseware-problem-width': toPercent(COURSEWARE_PROBLEM_MAX_WIDTH_RATIO),
    '--courseware-system-font': COURSEWARE_SYSTEM_FONT_FAMILY,
    '--stage-problem-font-size': `${resolveProblemFontSize(canvas)}px`,
  } as CSSProperties;
}

export function resolveProblemFontSize(canvas: StageCanvasConfig) {
  return Math.max(18, canvas.height * 0.014);
}

function toPercent(ratio: number) {
  return `${ratio * 100}%`;
}
