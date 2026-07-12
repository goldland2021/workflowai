import "server-only";

export type AITaskType =
  | "extract_trip"        // 提取行程信息 ← 需要高精度
  | "detect_event"        // 检测业务事件 ← 需要高精度
  | "extract_contact"     // 提取联系方式 ← 中等精度
  | "suggest_quote"       // 生成报价建议 ← 中等精度
  | "reply_customer"      // 回复客户 ← 需要自然
  | "reply_fallback";     // 兜底回复 ← 固定模板

/** 每种 AI 任务的最佳温度配置 */
export const AI_TEMPERATURE: Record<AITaskType, number> = {
  extract_trip: 0.1,      // 精确提取，不要发挥
  detect_event: 0.2,      // 事件检测需要准确
  extract_contact: 0.3,   // 联系方式提取
  suggest_quote: 0.3,     // 报价建议可以有一点浮动
  reply_customer: 0.7,    // 客服回复需要自然
  reply_fallback: 0.0,    // 固定模板，不发挥
};

/** 返回指定任务类型的温度 */
export function getTemperature(task: AITaskType): number {
  return AI_TEMPERATURE[task] ?? 0.3;
}
