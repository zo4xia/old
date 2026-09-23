import type { AppConfig } from '../config/defaultConfig';

/**
 * 配置单盒子出口（workflow 真正运行时只从这里取值）
 * 目标：减少组件/服务层散落读取，形成唯一配置读口。
 */
export type RuntimeConfigBox = {
  scriptAgent: AppConfig['scriptAgent'];
  tts: AppConfig['tts'];
  recognition: AppConfig['recognition'];
  automation: AppConfig['automation'];
  stageDefaults: AppConfig['stageDefaults'];
  output: AppConfig['output'];
};

export function readRuntimeConfigBox(config: AppConfig): RuntimeConfigBox {
  return {
    scriptAgent: config.scriptAgent,
    tts: config.tts,
    recognition: config.recognition,
    automation: config.automation,
    stageDefaults: config.stageDefaults,
    output: config.output,
  };
}
