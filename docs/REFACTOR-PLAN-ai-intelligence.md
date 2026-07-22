# WorkflowAI 智能重构方案

> 目标:让 AI 员工"变聪明"。核心不是继续调 prompt,而是**反转控制权**——让 LLM 做编排与表达的主体,把确定性代码降级为只负责必须可靠的护栏(定价、审批、字段校验)。

---

## 1. 核心判断

当前 AI 的智能上限是**架构决定的,不是 prompt 决定的**。四个根因:

1. **LLM 不做主。** `ai-workflow.ts`(1337 行 / 108 个正则)是真正的大脑,`mergeTripDetails` 用 270 行正则解析字段;即使 `hasRealAI=true`,LLM 抽取结果也被压在最底层(`safeExtractedFields` 只能填空字段,`labeledFields` 最后再覆盖一遍)。
2. **好回复被事后校验丢掉。** `generateAiReplyWithAI` 里 `asksForKnownTripField`、报价审批正则、语言匹配任一命中,就丢弃 LLM 输出、回退到 `fallbackReply` 硬编码模板。
3. **大量对话没走到模型。** `getFastFaqReply` / `getFastOperationalReply` / `getFastFlightArrivalReply` 在 AI 之前短路,`reply-cache` 对重复消息直接返回缓存句。
4. **底座模型弱 + prompt 过度约束。** 默认 `deepseek-chat` / `gpt-4o-mini`;prompt 压"默认1句、最多2句、约35字"并堆砌大量"不要…",把模型逼成电报机。

**为什么怎么改也没改好:** 每个"修复"都在错误的层加一层正则/守卫/特判(见 git log:`Fix repeated hotel address prompts`、`Prevent false flight number extraction`、`Fix charter parsing`……)。各层互相纠缠,修一个冒俩。prompt 层的改动无法穿透被确定性代码否决的问题。

---

## 2. 重构原则

- **控制权反转:** LLM 负责"理解 + 决定问什么 + 措辞";代码负责"能不能报这个价 / 要不要老板审批 / 字段是否合法"。
- **护栏是否决权,不是改写权。** 代码只允许**拒绝或标记**模型的错误,不允许静默重写模型输出。
- **单一编排入口。** 抽取、事件、回复合并为一次带工具/结构化输出的模型调用,减少多次往返与各层打架。
- **可度量。** 先建评测集,任何改动用同一套对话回归,避免"修一个坏两个"。
- **小步替换,双轨灰度。** 新旧路径用 feature flag 并存,按公司/会话灰度切换,可秒级回滚。

---

## 3. 目标架构

```
现状:  message ─▶ 正则快捷路径 ─▶ 正则抽取 ─▶ LLM(填空)─▶ 正则覆盖 ─▶ LLM回复 ─▶ 校验丢弃 ─▶ 模板兜底
                     (决策在正则)                          (决策在正则)              (丢弃模型)

目标:  message ─▶ LLM 编排(理解/抽取/决定下一步/措辞,一次结构化调用)
                        │
                        ├─▶ 确定性护栏(纯函数,可单测):
                        │      · 定价引擎 calculateWorkflowQuote —— 唯一价格来源
                        │      · 审批闸门 approvalRequired / confidence —— 决定是否进 Boss Inbox
                        │      · 字段校验/归一化 —— 日期、航班号、人数合法性
                        │      · PII 脱敏、限流、用量、幂等、租户隔离
                        │
                        └─▶ 回复 = 模型措辞 + 护栏事实(价格/审批状态由代码注入,模型不得编造)
```

关键区别:模型可以**读**护栏结果并据此措辞,但**价格数字、审批状态、司机信息**这些事实由代码提供,模型只负责自然表达。

---

## 4. 分阶段计划(按优先级)

### Phase 0 — 建立安全网(必须先做,约 2–3 天)
没有回归基线,任何重构都会重蹈"修一个坏两个"。

- [ ] 从真实/构造对话中整理 **30–50 条评测用例**(中/英/阿,含:纯航班+酒店、改路线、改时间、砍价、往返、收据、寒暄、多景点包车)。放 `src/lib/domain/__evals__/`。
- [ ] 每条用例断言**结构化结果**(tripDetails 字段、detectedEvents、是否生成报价、是否进 Boss Inbox),而非逐字比对回复文本。
- [ ] 跑通现有 Vitest 作为基线,记录当前通过率。

### Phase 1 — 反转控制权:LLM 编排(核心,约 1–2 周)
- [ ] 新增 `src/lib/ai/orchestrate.ts`:**一次**结构化调用(工具调用或单个大 JSON schema)同时产出 `tripDetailsDelta`、`detectedEvents`、`contact`、`replyDraft`、`nextQuestion`。取代现在 `Promise.all([extractTrip, extractContact, detectEvents])` + 单独 reply 的多次往返。
- [ ] `mergeTripDetails` 逻辑反转:**以模型 delta 为主**,代码只做归一化与合法性校验(日期能解析、航班号形如 `XX000`、人数为正整数);校验失败则丢弃该字段并要求模型重问,而非用正则去猜。
- [ ] 保留正则抽取器,但降级为**兜底**:仅当 `hasRealAI=false` 或模型调用失败时启用。
- [ ] 用 feature flag `AI_ORCHESTRATOR_ENABLED`(可按 companyId 灰度)在 `analyzeCustomerTurn` 里切换新旧路径。

### Phase 2 — 护栏收敛(与 Phase 1 并行)
明确"保留"的东西,并确保它们是**纯函数、可单测、只做否决**:

- [ ] **定价**:`calculateWorkflowQuote` 保留为唯一价格来源。模型永远不产出价格数字。
- [ ] **审批闸门**:保留 `approvalRequired` / `confidence` / `autoQuoteMinConfidence` 逻辑决定进不进 Boss Inbox。这是商业安全边界,不能交给模型。
- [ ] **事件边界**:保留 `filterDetectedEventsForMessage`(高影响事件需显式意图),但简化 `explicitEventIntent` 正则——只保留 Urgent/Receipt/Route Change/Pickup Time Change 这类会误伤钱和承诺的类型,其余交给模型判断。
- [ ] 保留 PII 脱敏、限流、用量、幂等、租户隔离(与智能无关,勿动)。

### Phase 3 — 拆掉压制模型的机制(约 3–5 天)
- [ ] **删除事后丢弃校验**:`generateAiReplyWithAI` 里的 `asksForKnownTripField`、报价审批正则回退。改为把这些约束写进 prompt + 结构化输出的字段约束;若模型仍越界,用**轻量后处理注入事实**(如价格缺失就补一句),而非整段替换成模板。
- [ ] **收敛快捷路径**:`getFastFaqReply` / `getFastOperationalReply` 只保留极少数确定性寒暄(你好/谢谢/表情)。FAQ 交给模型 + 配置知识库,消除"只对中文生效"的不一致。
- [ ] **收敛缓存**:`reply-cache` 只对无上下文的纯寒暄生效(已接近现状,收紧 key 条件即可),避免带状态对话命中缓存。
- [ ] `fallbackReply` 保留,但仅作为**模型完全不可用时的降级**,不再作为"模型答得不合规"时的替换。

### Phase 4 — 升级底座模型 + 松绑 prompt(约 2–3 天)
- [ ] 默认模型升级到强模型(Claude / GPT-4 级)用于编排与回复;抽取这类结构化任务可继续用便宜模型以控成本(双模型分工)。
- [ ] `client.ts` 支持"编排模型"和"抽取模型"分别配置(`LLM_MODEL_ORCHESTRATOR` / `LLM_MODEL_EXTRACT`)。
- [ ] 松绑回复 prompt:把"最多35字 + 一堆不要"改为**正向、少量**的风格指引(简洁、专业、一次问一个关键问题),让强模型自己把握。
- [ ] 用 Phase 0 评测集验证升级前后对比。

---

## 5. 该删 / 该保留清单

| 模块 | 处置 | 理由 |
|---|---|---|
| `mergeTripDetails` 270 行正则 | **降级为兜底** | 与模型抢解析,是"覆盖模型"的主因 |
| `getFastFaqReply` | **大幅收缩** | 只对中文生效、依赖易过期的 FAQ 匹配 |
| `getFastOperationalReply` | **保留极简版** | 纯寒暄短路合理,其余交模型 |
| `asksForKnownTripField` + 报价审批回退 | **删除** | 丢弃合规好回复的元凶,改为事实注入 |
| `reply-cache` | **收紧** | 仅无状态寒暄,防止带上下文误命中 |
| `fallbackReply` | **保留但仅降级用** | 模型不可用时的兜底 |
| `calculateWorkflowQuote` / pricing 引擎 | **保留(核心护栏)** | 价格唯一可信来源 |
| `approvalRequired` / confidence 闸门 | **保留(核心护栏)** | 商业与法律安全边界 |
| `filterDetectedEventsForMessage` | **简化保留** | 防高影响事件误报,但收敛正则 |
| PII / 限流 / 用量 / 幂等 / 租户隔离 | **不动** | 与智能无关的正确基础设施 |
| 抽取/事件/回复三次 LLM 往返 | **合并为一次编排** | 减少往返与各层打架,降延迟 |

---

## 6. 风险与回滚

- **护栏被绕过(报错价、越权承诺):** Phase 2 先固化护栏为纯函数 + 单测,再在 Phase 1 反转控制权。价格/审批永远走代码。
- **模型成本/延迟上升:** 双模型分工(强模型编排、弱模型抽取)+ 合并往返(3 次→1 次)可对冲。
- **回归退化:** 全程 feature flag 双轨 + 按 companyId 灰度,Phase 0 评测集把关,可秒级切回旧路径。
- **多语言退化:** 评测集覆盖中/英/阿;保留 `resolveConversationLang` 的语言锁定(这是正确设计)。

---

## 7. 验收标准

1. Phase 0 评测集通过率:重构后 **≥ 基线**,且目标 ≥ 90%。
2. 单轮 LLM 往返次数从 4 降到 1(编排)+ 定价纯本地。
3. 价格数字 100% 来自 `calculateWorkflowQuote`,模型输出中 0 编造价格(评测断言)。
4. "答得好却被模板替换"的比例(可加日志埋点统计 fallback 命中率)显著下降。
5. 端到端 p95 延迟不高于当前。

---

## 8. 建议实施顺序

**Phase 0 → Phase 2(固护栏)→ Phase 1(反转,灰度)→ Phase 4(升级模型)→ Phase 3(拆压制)。**

先建安全网、先把护栏钉死,再动控制权,最后拆掉旧的压制机制——这样每一步都有回归兜底,不会重演"修一个坏两个"。

---

## 9. 实施进展（2026-07-22 更新）

Phase 0 / 2 / 1 / 4 已落地并用真实模型（DeepSeek）验证；Phase 3 待灰度稳定后进行。

**已完成**
- **Phase 0 安全网**：`src/lib/domain/__evals__/conversation-evals.ts`（22 条结构化用例）+ `.test.ts`（mock 基线，CI 稳定）。
- **Phase 2 护栏**：`src/lib/domain/pricing-guardrail.ts`（`resolveAuthoritativeQuote` 为价格/审批唯一权威来源）+ 单测；`ai-workflow.ts` 委托它，新旧路径共用。
- **Phase 1 编排**：`src/lib/ai/orchestrate.ts` 单次结构化调用；`src/lib/ai/flags.ts` 开关 `AI_ORCHESTRATOR_ENABLED`（默认关，灰度）；`analyzeCustomerTurn` 里失败自动回退旧路径。逐字段容错 + prompt 列合法 eventType，避免整轮丢弃。
- **Phase 4 分角色模型**：`client.ts` 支持 `LLM_MODEL_ORCHESTRATOR` / `LLM_MODEL_EXTRACT`（留空回退 `LLM_MODEL`）。
- **Option A**：`isBareAcknowledgement()` 让裸确认不再冒出报价。
- **防倒退门禁**：`.live.test.ts` 连真实模型，regression 全过 + aspiration ≥13 才绿。

**实测结果**：规则老路 aspiration 7/15 → orchestrator + 真实模型 **15/15**，regression 全程 7/7。`npm test` 152 全绿。

**运行评测门禁（需 DeepSeek key）**
```
npm run eval:live          # 一条命令，跨平台，自动设 EVAL_LIVE 并跑门禁
# 看模型原始输出：先 $env:ORCH_DEBUG=1（PowerShell）再 npm run eval:live
```
注意：`npm run eval:live` 只跑 live 门禁；普通 `npm test` 不联网。若手动设过 `$env:EVAL_LIVE=1`，普通 `npm test` 会连网，跑前 `Remove-Item Env:EVAL_LIVE`。

**上线灰度**：预发/单公司设 `AI_ORCHESTRATOR_ENABLED=true`，可选 `LLM_MODEL_ORCHESTRATOR` 配强模型。开关关着 = 完全维持现状。

**提交注意**：工作树是 CRLF，git 会把上百个未改文件显示为 modified（EOL 噪声）。只 add 真实改动文件：
`src/lib/ai/orchestrate.ts flags.ts client.ts extract.ts`、`src/lib/domain/ai-workflow.ts pricing-guardrail.ts pricing-guardrail.test.ts`、`src/lib/domain/__evals__/`、`docs/REFACTOR-PLAN-ai-intelligence.md`、`.env.example`。或先 `git config core.autocrlf true`。

**Phase 3 待办（灰度稳定后逐块删，每删一块跑门禁）**
- legacy 三路并行抽取（`extract.ts` 的 trip/event/contact 调用）——被 orchestrator 取代后可移除。
- `reply-cache`、`getFastFaqReply` / `getFastOperationalReply` 快捷路径——收敛为极少数确定性寒暄或交给模型。
- `reply.ts` 里事后丢弃 LLM 回复的校验（`asksForKnownTripField`、报价审批正则回退）。
- `mergeTripDetails` 的 270 行正则——降级为纯兜底。

---

## 10. 灰度 soak 发现与修复（2026-07-22）

orchestrator 已在生产打开(Vercel `AI_ORCHESTRATOR_ENABLED=true`,项目 workflowai),在 jpairport.jp 挂件上做真实对话 soak。核心安全行为全部正确:砍价/投诉/取消都正确升级给老板、价格始终来自代码、往返/改时间/多语言均正常。soak 暴露并修复了两个问题(commit `eae28c8`):

**1. 价格在多轮之间乱跳(USD 118 → JPY 18,000 → JPY 60,000)——根因是仓库老隐患,非本次重构引入。**
`mergeTripDetails` 里的 `charterIntent` 本应整词匹配,却被误写成**字符类** `[包车...点]`,导致任意含 点/车/多/个/时 等超常见字的中文消息("便宜一**点**"、"**车**型"、"几**点**")被判成"包车一日游"→ 走高价 day_tour 档,价格随每轮消息乱跳。
修复:改为整词匹配 `包车|包車|一日游|一日遊|游览|按小时租|多个景点|...`。真正的"包车一日游"仍正确识别。

**2. 中文带后缀的道谢没被识别为"纯确认"。**
`isBareAcknowledgement` 认得"谢谢"但认不得"谢谢你/谢谢您/好的谢谢啦"(后缀 + 无空格),导致这些确认仍复读报价。
修复:词表加 `你/您/啦/了` 后缀,并把 token 分隔符从 `\s+` 放宽为 `\s*` 以支持中文无空格拼接。

**锁定:** 新增 `src/lib/domain/soak-fixes.test.ts`(17 条正反例单测)钉死两处修复;`isBareAcknowledgement` 与 `mergeTripDetails` 均已导出以便测试。`npm test` 169 全绿,`npm run eval:live` 门禁 regression 7/7 + aspiration 15/15 通过,已 push 且 Vercel 部署 Ready。

**已知残留(非阻塞):** soak 用过的那条测试对话线程,在修复前已被 bug 污染成 day_tour 状态,且会话存于挂件 iframe 存储、无法从外层页面重置——只影响该旧线程,新访客走修复后代码。如需干净复验,用无痕窗口开 jpairport.jp 即可。
