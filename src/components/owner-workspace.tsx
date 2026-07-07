"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarCheck,
  Check,
  ClipboardCheck,
  Clock,
  Edit3,
  Inbox,
  MessageSquareText,
  Plane,
  Send,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  getMissingQuoteFields,
  createBookingSummary,
} from "@/lib/domain/booking-workflow";
import { analyzeCustomerTurnOnServer } from "@/lib/client/ai-workflow-api";
import { realChatScenarios } from "@/lib/domain/real-chat-scenarios";
import { BusinessConfigurationSchema } from "@/lib/domain/schemas";
import type {
  BookingSummary,
  BossInboxItem,
  BusinessConfiguration,
  CapturedContact,
  ConversationMessage,
  DemoSnapshot,
  DetectedEvent,
  FAQ,
  QuoteSuggestion,
  TripDetails,
  Vehicle,
} from "@/lib/domain/types";
import type { AIStatus } from "@/lib/ai/status-types";

const STORAGE_KEY = "ai-employee-workspace-state-v1";

type QuoteEditField = "suggestedPrice" | "currency" | "vehicleType" | "reason" | "includedFees";
type QuoteEditValue = QuoteSuggestion[QuoteEditField];

interface OwnerWorkspaceProps {
  snapshot: DemoSnapshot;
  aiStatus: AIStatus;
}

interface SavedWorkspaceState {
  messages: ConversationMessage[];
  tripDetails: TripDetails;
  contact?: CapturedContact;
  events: DetectedEvent[];
  bossInbox: BossInboxItem[];
  businessConfig: BusinessConfiguration;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readSavedWorkspace(): Partial<SavedWorkspaceState> {
  if (typeof window === "undefined") return {};

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return {};

    const parsed = JSON.parse(saved) as unknown;
    if (!isRecord(parsed)) return {};

    const state: Partial<SavedWorkspaceState> = {};
    if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
      state.messages = parsed.messages as ConversationMessage[];
    }
    if (isRecord(parsed.tripDetails)) {
      state.tripDetails = parsed.tripDetails as TripDetails;
    }
    if ("contact" in parsed) {
      state.contact = parsed.contact as CapturedContact | undefined;
    }
    if (Array.isArray(parsed.events)) {
      state.events = parsed.events as DetectedEvent[];
    }
    if (Array.isArray(parsed.bossInbox) && parsed.bossInbox.length > 0) {
      state.bossInbox = parsed.bossInbox as BossInboxItem[];
    }

    const businessConfig = BusinessConfigurationSchema.safeParse(parsed.businessConfig);
    if (businessConfig.success) {
      state.businessConfig = businessConfig.data;
    }

    return state;
  } catch {
    return {};
  }
}

export function OwnerWorkspace({ snapshot, aiStatus }: OwnerWorkspaceProps) {
  // Initialize from localStorage if available (simple persistence)
  const [messages, setMessages] = useState<ConversationMessage[]>(() => {
    return readSavedWorkspace().messages ?? snapshot.conversation;
  });

  const [tripDetails, setTripDetails] = useState<TripDetails>(() => {
    return readSavedWorkspace().tripDetails ?? snapshot.tripDetails;
  });

  const [contact, setContact] = useState<CapturedContact | undefined>(() => {
    return readSavedWorkspace().contact ?? snapshot.contact;
  });

  const [events, setEvents] = useState<DetectedEvent[]>(() => {
    return readSavedWorkspace().events ?? snapshot.detectedEvents;
  });

  const [bossInbox, setBossInbox] = useState<BossInboxItem[]>(() => {
    return readSavedWorkspace().bossInbox ?? snapshot.bossInbox;
  });

  // Editable business configuration for teaching the AI / fixing data
  const [businessConfig, setBusinessConfig] = useState<BusinessConfiguration>(() => {
    return readSavedWorkspace().businessConfig ?? snapshot.businessConfiguration;
  });

  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  // Boss Inbox editing state (transient, not persisted)
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQuote, setEditQuote] = useState<Partial<QuoteSuggestion>>({});

  function resetSimulation() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    setMessages(snapshot.conversation);
    setTripDetails(snapshot.tripDetails);
    setContact(snapshot.contact);
    setEvents(snapshot.detectedEvents);
    setBossInbox(snapshot.bossInbox);
    setBusinessConfig(snapshot.businessConfiguration);
    setInput("");
    setIsThinking(false);
    setEditingItemId(null);
    setEditQuote({});
  }

  // Persist key state to localStorage whenever it changes (simple session)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stateToSave = {
        messages,
        tripDetails,
        contact,
        events,
        bossInbox,
        businessConfig,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      // Ignore storage errors (e.g. quota or private mode)
      console.warn('Failed to persist workspace state', e);
    }
  }, [messages, tripDetails, contact, events, bossInbox, businessConfig]);

  function addAiFollowUp(text: string) {
    const now = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const msg: ConversationMessage = {
      id: `msg_ai_${Date.now()}`,
      role: "ai",
      text,
      createdAt: now,
      channel: "website_widget",
    };
    setMessages((current) => [...current, msg]);
  }

  const approvedQuote = useMemo(
    () =>
      bossInbox.find((item) => item.status === "approved" && item.quote)?.quote as
        | QuoteSuggestion
        | undefined,
    [bossInbox],
  );

  const bookingSummary: BookingSummary = useMemo(
    () => createBookingSummary({ tripDetails, contact, approvedQuote }),
    [approvedQuote, contact, tripDetails],
  );

  const missingFields = getMissingQuoteFields(tripDetails);
  const quoteFieldTotal = 5;
  const pendingCount = bossInbox.filter(
    (item) => item.status === "pending" || item.status === "edited"
  ).length;
  const leadReady = Boolean(contact);

  async function sendCustomerMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed) return;
    const turnId = String(messages.length + 1).padStart(3, "0");

    const customerMessage: ConversationMessage = {
      id: `msg_customer_live_${turnId}`,
      role: "customer",
      text: trimmed,
      createdAt: new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      channel: "website_widget",
    };

    setIsThinking(true);
    try {
      const result = await analyzeCustomerTurnOnServer({
        message: trimmed,
        currentTripDetails: tripDetails,
        existingBossItems: bossInbox.map((item) => ({
          status: item.status,
          type: item.type,
          event: item.event ? { eventType: item.event.eventType } : undefined,
        })),
        // Pass recent conversation so AI knows the full context
        recentMessages: messages.slice(-8),
        // Pass current business config so edits (teaching/corrections) affect AI
        businessConfiguration: businessConfig,
      });

      setMessages((current) => [...current, customerMessage, result.aiMessage]);
      setTripDetails(result.tripDetails);
      setContact((current) => result.contact ?? current);
      setEvents((current) => [...result.detectedEvents, ...current]);
      setBossInbox((current) => [...result.bossInboxItems, ...current]);
    } catch {
      const fallbackMessage: ConversationMessage = {
        id: `msg_ai_error_${turnId}`,
        role: "ai",
        text: "抱歉，刚才分析消息时出错了。请稍后再试，或先由老板手动处理这条消息。",
        createdAt: customerMessage.createdAt,
        channel: "website_widget",
      };

      setMessages((current) => [...current, customerMessage, fallbackMessage]);
    } finally {
      setIsThinking(false);
      setInput("");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendCustomerMessage(input);
  }

  function updateBossItem(id: string, status: BossInboxItem["status"]) {
    // Capture current item
    const item = bossInbox.find((i) => i.id === id);

    setBossInbox((current) =>
      current.map((i) => (i.id === id ? { ...i, status } : i))
    );

    if (status === "approved" && item?.quote) {
      const quote = item.quote;
      const followUpText = `好消息！老板已批准报价。

价格：${quote.currency} ${quote.suggestedPrice}（${quote.vehicleType || "车辆"}）
${quote.reason ? `说明：${quote.reason}` : ""}

详细预订确认已更新在右侧“预订确认”面板（状态变为“已就绪”）。

如确认，请回复“确认预订”或告知其他要求。我们将尽快安排司机。`;
      addAiFollowUp(followUpText);
    } else if (status === "approved") {
      const eventType = item?.event?.eventType || item?.type || "请求";
      addAiFollowUp(`该请求（${eventType}）已获得老板批准。我们会按此处理后续安排。`);
    } else if (status === "rejected") {
      addAiFollowUp("抱歉，此请求未获批准。如有其他需求请继续告知。");
    }
  }

  function startEdit(id: string) {
    const item = bossInbox.find((i) => i.id === id);
    if (!item?.quote) return;

    setEditingItemId(id);
    setEditQuote({
      suggestedPrice: item.quote.suggestedPrice,
      currency: item.quote.currency,
      vehicleType: item.quote.vehicleType,
      reason: item.quote.reason,
      includedFees: item.quote.includedFees,
    });

    // Mark as edited
    updateBossItem(id, "edited");
  }

  function cancelEdit() {
    setEditingItemId(null);
    setEditQuote({});
  }

  function saveEdit(id: string, andApprove: boolean = false) {
    const item = bossInbox.find((i) => i.id === id);
    if (!item?.quote) return;

    const updatedQuote: QuoteSuggestion = {
      ...item.quote,
      suggestedPrice: editQuote.suggestedPrice ?? item.quote.suggestedPrice,
      currency: editQuote.currency ?? item.quote.currency,
      vehicleType: editQuote.vehicleType ?? item.quote.vehicleType,
      reason: editQuote.reason ?? item.quote.reason,
      includedFees: editQuote.includedFees ?? item.quote.includedFees,
    };

    // Update the quote in boss inbox
    setBossInbox((current) =>
      current.map((i) =>
        i.id === id
          ? {
              ...i,
              quote: updatedQuote,
              status: andApprove ? "approved" : "edited",
            }
          : i
      )
    );

    if (andApprove) {
      const followUpText = `好消息！老板已批准（编辑后）报价。

价格：${updatedQuote.currency} ${updatedQuote.suggestedPrice}（${updatedQuote.vehicleType || "车辆"}）
${updatedQuote.reason ? `说明：${updatedQuote.reason}` : ""}

详细预订确认已更新在右侧“预订确认”面板。

如确认，请回复“确认预订”或告知其他要求。`;
      addAiFollowUp(followUpText);
    } else {
      addAiFollowUp("报价已编辑。老板可进一步审查后批准。");
    }

    setEditingItemId(null);
    setEditQuote({});
  }

  function updateCompanyProfile(
    field: "name" | "serviceArea",
    value: string,
  ) {
    setBusinessConfig((current) => ({
      ...current,
      companyProfile: {
        ...current.companyProfile,
        [field]: value,
      },
    }));
  }

  function addVehicle() {
    const newVehicle: Vehicle = {
      id: `vehicle_${Date.now()}`,
      name: "新车型",
      type: "New",
      capacity: { passengers: 4, luggage: 3 },
      description: "请编辑描述",
    };

    setBusinessConfig((current) => ({
      ...current,
      vehicles: [...(current.vehicles ?? []), newVehicle],
    }));
  }

  function updateVehicle(index: number, updater: (vehicle: Vehicle) => Vehicle) {
    setBusinessConfig((current) => {
      const vehicles = [...(current.vehicles ?? [])];
      const vehicle = vehicles[index];
      if (!vehicle) return current;

      vehicles[index] = updater(vehicle);
      return { ...current, vehicles };
    });
  }

  function removeVehicle(index: number) {
    setBusinessConfig((current) => ({
      ...current,
      vehicles: (current.vehicles ?? []).filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function updateFaq(index: number, changes: Partial<FAQ>) {
    setBusinessConfig((current) => {
      const faq = [...current.faq];
      const item = faq[index];
      if (!item) return current;

      faq[index] = { ...item, ...changes };
      return { ...current, faq };
    });
  }

  function removeFaq(index: number) {
    setBusinessConfig((current) => ({
      ...current,
      faq: current.faq.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function addFaq() {
    setBusinessConfig((current) => ({
      ...current,
      faq: [
        ...current.faq,
        { id: `faq_${Date.now()}`, question: "新问题", answer: "新答案" },
      ],
    }));
  }

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-stone-950">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-stone-300 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-emerald-800 text-white">
              <Bot size={22} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-600">AI 员工 V1</p>
              <h1 className="text-2xl font-semibold tracking-normal text-stone-950 sm:text-3xl">
                机场接送指挥中心
              </h1>
              <p className="text-[11px] text-emerald-700">
                {aiStatus.configured
                  ? `已启用真实 AI（${aiStatus.providerLabel}）`
                  : "规则模拟模式（请设置 DEEPSEEK_API_KEY）"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Metric label="线索" value={leadReady ? "1" : "0"} tone="emerald" />
            <Metric label="待处理" value={String(pendingCount)} tone="amber" />
            <Metric label="报价字段" value={`${quoteFieldTotal - missingFields.length}/${quoteFieldTotal}`} tone="indigo" />
            <Metric label="预订" value={bookingSummary.status === "ready" ? "1" : "0"} tone="rose" />
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          <aside className="flex min-w-0 flex-col gap-4">
            <Panel title="训练员工" icon={<Sparkles size={18} aria-hidden="true" />}>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-stone-500">公司名称</label>
                  <input
                    className="w-full text-sm font-semibold text-stone-950 border border-stone-300 rounded px-2 py-1"
                    value={businessConfig.companyProfile.name}
                    onChange={(e) => updateCompanyProfile("name", e.target.value)}
                  />
                  <label className="text-xs font-medium text-stone-500 mt-2 block">服务区域</label>
                  <input
                    className="w-full text-sm leading-6 text-stone-600 border border-stone-300 rounded px-2 py-1"
                    value={businessConfig.companyProfile.serviceArea}
                    onChange={(e) => updateCompanyProfile("serviceArea", e.target.value)}
                  />
                </div>
                <ProgressRows
                  rows={[
                    ["公司档案", true],
                    ["定价规则", true],
                    ["升级规则", true],
                    ["联系方式捕获", true],
                    ["预订字段", true],
                  ]}
                />
                <div>
                  <div className="text-xs font-medium text-stone-500 mb-1">支持语言</div>
                  <div className="flex flex-wrap gap-2">
                    {businessConfig.companyProfile.languages.map((language, idx) => (
                      <span
                        className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700"
                        key={idx}
                      >
                        {language}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 可用车型 - 可编辑，用于教AI */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-stone-500">可用车型（教AI用）</p>
                    <button
                      onClick={addVehicle}
                      className="text-[10px] px-2 py-0.5 rounded border border-emerald-700 text-emerald-700 hover:bg-emerald-50"
                    >
                      + 添加车型
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(businessConfig.vehicles ?? []).map((v, idx) => (
                      <div key={idx} className="text-xs bg-white border border-stone-200 rounded px-2 py-1 space-y-1">
                        <input
                          className="w-full font-medium text-stone-800 border-b pb-0.5"
                          value={v.name}
                          onChange={(e) =>
                            updateVehicle(idx, (vehicle) => ({ ...vehicle, name: e.target.value }))
                          }
                        />
                        <div className="flex gap-2 text-[10px]">
                          <input
                            className="flex-1 border rounded px-1"
                            placeholder="乘客"
                            type="number"
                            value={v.capacity.passengers}
                            onChange={(e) =>
                              updateVehicle(idx, (vehicle) => ({
                                ...vehicle,
                                capacity: {
                                  ...vehicle.capacity,
                                  passengers: Number.parseInt(e.target.value, 10) || 0,
                                },
                              }))
                            }
                          />
                          <input
                            className="flex-1 border rounded px-1"
                            placeholder="行李"
                            type="number"
                            value={v.capacity.luggage}
                            onChange={(e) =>
                              updateVehicle(idx, (vehicle) => ({
                                ...vehicle,
                                capacity: {
                                  ...vehicle.capacity,
                                  luggage: Number.parseInt(e.target.value, 10) || 0,
                                },
                              }))
                            }
                          />
                        </div>
                        <textarea
                          className="w-full text-[10px] text-stone-600 border rounded p-1"
                          value={v.description || ""}
                          onChange={(e) =>
                            updateVehicle(idx, (vehicle) => ({
                              ...vehicle,
                              description: e.target.value,
                            }))
                          }
                          rows={2}
                        />
                        <button
                          onClick={() => removeVehicle(idx)}
                          className="text-[9px] text-red-600 hover:underline"
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="公司知识库（可编辑，教AI用）" icon={<ShieldCheck size={18} aria-hidden="true" />}>
              <div className="space-y-3">
                {businessConfig.faq.map((item, idx) => (
                  <div key={idx} className="border-b border-stone-200 pb-3 last:border-0 last:pb-0 space-y-1">
                    <input
                      className="w-full text-sm font-medium text-stone-950 border border-stone-300 rounded px-2 py-0.5"
                      value={item.question}
                      onChange={(e) => updateFaq(idx, { question: e.target.value })}
                      placeholder="问题"
                    />
                    <textarea
                      className="w-full text-sm leading-6 text-stone-600 border border-stone-300 rounded px-2 py-1"
                      value={item.answer}
                      onChange={(e) => updateFaq(idx, { answer: e.target.value })}
                      rows={2}
                      placeholder="答案"
                    />
                    <button
                      onClick={() => removeFaq(idx)}
                      className="text-[10px] text-red-600 hover:underline"
                    >
                      删除此条
                    </button>
                  </div>
                ))}
                <button
                  onClick={addFaq}
                  className="text-xs px-3 py-1 rounded border border-emerald-700 text-emerald-700 hover:bg-emerald-50"
                >
                  + 添加知识条目
                </button>
              </div>
            </Panel>
          </aside>

          <section className="flex min-w-0 flex-col gap-5">
            <Panel
              title="对话测试实验室"
              icon={<MessageSquareText size={18} aria-hidden="true" />}
              action={<StatusPill label="网站挂件" />}
            >
              <div className="grid gap-4 2xl:grid-cols-[minmax(420px,1fr)_280px]">
                <div className="flex min-h-[520px] min-w-0 flex-col rounded-lg border border-stone-300 bg-white">
                  <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Plane size={17} aria-hidden="true" />
                      实时客户对话
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-emerald-700">AI 在线</span>
                      <button
                        onClick={resetSimulation}
                        className="text-[10px] px-2 py-0.5 rounded border border-stone-300 hover:bg-stone-100"
                        type="button"
                      >
                        重置
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                    {messages.map((message) => (
                      <ChatBubble key={message.id} message={message} />
                    ))}
                  </div>
                  <div className="border-t border-stone-200 p-3">
                    <div className="mb-3 flex w-full min-w-0 max-w-full gap-2 overflow-x-auto pb-1">
                      {realChatScenarios.map((scenario) => (
                        <button
                          className="shrink-0 rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-left text-xs font-medium text-stone-700 transition hover:border-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                          key={scenario.id}
                          onClick={() => sendCustomerMessage(scenario.message)}
                          title={scenario.message}
                          type="button"
                          disabled={isThinking}
                        >
                          {scenario.label}
                        </button>
                      ))}
                    </div>
                    <form className="flex min-w-0 gap-2" onSubmit={handleSubmit}>
                      <input
                        className="min-h-11 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                        onChange={(event) => setInput(event.target.value)}
                        placeholder="输入客户消息"
                        value={input}
                      />
                      <button
                        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:opacity-60"
                        title="发送客户消息"
                        type="submit"
                        disabled={isThinking}
                      >
                        <Send size={16} aria-hidden="true" />
                        {isThinking ? "思考中..." : "发送"}
                      </button>
                    </form>
                  </div>
                </div>

                <div className="min-w-0 space-y-4">
                  <FieldTracker tripDetails={tripDetails} missingFields={missingFields} />
                  <Panel title="联系方式" compact icon={<UserRoundCheck size={17} aria-hidden="true" />}>
                    {contact ? (
                      <div>
                        <p className="text-sm font-semibold text-stone-950">{contact.method}</p>
                        <p className="mt-1 break-all text-sm text-stone-600">{contact.value}</p>
                      </div>
                    ) : (
                      <p className="text-sm leading-6 text-stone-600">等待购买意向后捕获联系方式。</p>
                    )}
                  </Panel>
                  <Panel title="事件" compact icon={<AlertTriangle size={17} aria-hidden="true" />}>
                    {events.length > 0 ? (
                      <div className="space-y-3">
                        {events.slice(0, 3).map((event) => (
                          <div key={event.id}>
                            <p className="text-sm font-semibold text-stone-950">{event.eventType}</p>
                            <p className="mt-1 text-xs leading-5 text-stone-600">{event.suggestedOwnerAction}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm leading-6 text-stone-600">本次测试未检测到事件。</p>
                    )}
                  </Panel>
                </div>
              </div>
            </Panel>
          </section>

          <aside className="flex min-w-0 flex-col gap-4">
            <Panel title="老板收件箱" icon={<Inbox size={18} aria-hidden="true" />} action={<StatusPill label={`${pendingCount} 待处理`} />}>
              <div className="space-y-3">
                {bossInbox.map((item) => (
                  <BossInboxCard
                    key={item.id}
                    item={item}
                    onUpdate={updateBossItem}
                    editingId={editingItemId}
                    editForm={editQuote}
                    onStartEdit={startEdit}
                    onSaveEdit={saveEdit}
                    onCancelEdit={cancelEdit}
                    onEditFormChange={(field, value) =>
                      setEditQuote((prev) => ({ ...prev, [field]: value }))
                    }
                  />
                ))}
              </div>
            </Panel>

            <Panel title="预订确认" icon={<ClipboardCheck size={18} aria-hidden="true" />}>
              <BookingSummaryView bookingSummary={bookingSummary} />
            </Panel>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Panel({
  title,
  icon,
  action,
  children,
  compact = false,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-stone-300 bg-[#fffdf8] shadow-sm shadow-stone-200/60">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-emerald-800">{icon}</span>
          <h2 className="truncate text-sm font-semibold text-stone-950">{title}</h2>
        </div>
        {action}
      </div>
      <div className={compact ? "p-3" : "p-4"}>{children}</div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "emerald" | "amber" | "indigo" | "rose" }) {
  const toneClass = {
    emerald: "border-emerald-700/30 bg-emerald-50 text-emerald-900",
    amber: "border-amber-700/30 bg-amber-50 text-amber-900",
    indigo: "border-indigo-700/30 bg-indigo-50 text-indigo-900",
    rose: "border-rose-700/30 bg-rose-50 text-rose-900",
  }[tone];

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-semibold uppercase text-stone-600">
      {label}
    </span>
  );
}

function ProgressRows({ rows }: { rows: Array<[string, boolean]> }) {
  return (
    <div className="space-y-2">
      {rows.map(([label, complete]) => (
        <div className="flex items-center justify-between gap-3 text-sm" key={label}>
          <span className="text-stone-700">{label}</span>
          <span className={complete ? "text-emerald-700" : "text-stone-400"}>
            <Check size={16} aria-hidden="true" />
          </span>
        </div>
      ))}
    </div>
  );
}

function ChatBubble({ message }: { message: ConversationMessage }) {
  const isCustomer = message.role === "customer";

  return (
    <div className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-lg px-3 py-2 text-sm leading-6 ${
          isCustomer ? "bg-emerald-800 text-white" : "border border-stone-200 bg-stone-50 text-stone-800"
        }`}
      >
        <p className="break-words">{message.text}</p>
        <p className={`mt-1 text-[11px] ${isCustomer ? "text-emerald-100" : "text-stone-500"}`}>{message.createdAt}</p>
      </div>
    </div>
  );
}

function FieldTracker({
  tripDetails,
  missingFields,
}: {
  tripDetails: TripDetails;
  missingFields: Array<keyof TripDetails>;
}) {
  const serviceMap: Record<string, string> = {
    airport_pickup: "机场接机",
    airport_dropoff: "机场送机",
    city_transfer: "城市接送",
    round_trip: "往返",
    day_tour: "一日游",
  };

  const rows: Array<[keyof TripDetails, string, string | number | undefined]> = [
    ["serviceType", "服务类型", serviceMap[tripDetails.serviceType || ""] || tripDetails.serviceType],
    ["pickupLocation", "上车地点", tripDetails.pickupLocation],
    ["dropoffLocation", "下车地点", tripDetails.dropoffLocation],
    ["airport", "机场", tripDetails.airport],
    ["terminal", "航站楼", tripDetails.terminal],
    ["date", "日期", tripDetails.date],
    ["time", "时间", tripDetails.time],
    ["flightNumber", "航班", tripDetails.flightNumber],
    ["passengerCount", "乘客", tripDetails.passengerCount],
    ["luggageCount", "行李", tripDetails.luggageCount],
    ["vehiclePreference", "车型", tripDetails.vehiclePreference],
  ];

  return (
    <Panel title="行程字段" compact icon={<CalendarCheck size={17} aria-hidden="true" />}>
      <div className="space-y-2">
        {rows.map(([key, label, value]) => {
          const missing = missingFields.includes(key);
          return (
            <div className="flex items-start justify-between gap-3 text-sm" key={key}>
              <span className="text-stone-500">{label}</span>
              <span className={`max-w-[150px] text-right font-medium ${missing ? "text-amber-700" : "text-stone-950"}`}>
                {value ?? "缺失"}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function BossInboxCard({
  item,
  onUpdate,
  editingId,
  editForm,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditFormChange,
}: {
  item: BossInboxItem;
  onUpdate: (id: string, status: BossInboxItem["status"]) => void;
  editingId?: string | null;
  editForm?: Partial<QuoteSuggestion>;
  onStartEdit?: (id: string) => void;
  onSaveEdit?: (id: string, andApprove?: boolean) => void;
  onCancelEdit?: () => void;
  onEditFormChange?: (field: QuoteEditField, value: QuoteEditValue) => void;
}) {
  const canAct = item.status === "pending" || item.status === "edited";
  const isCurrentlyEditing = editingId === item.id;

  return (
    <article className="rounded-lg border border-stone-300 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-stone-950">
            {item.type === "quote_approval" ? "报价建议" : item.event?.eventType}
          </p>
          <p className="mt-1 text-xs font-medium uppercase text-stone-500">{item.decisionType} · {item.createdAt}</p>
        </div>
        <span
          className={`rounded-md px-2 py-1 text-xs font-semibold ${
            canAct ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
          }`}
        >
          {item.status}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-700">{item.summary}</p>
      <div className="mt-3 rounded-md bg-stone-50 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-950">
          <ArrowRight size={15} aria-hidden="true" />
          {item.recommendation}
        </div>
        <p className="mt-2 text-xs leading-5 text-stone-600">{item.reason}</p>
      </div>
      {canAct && !isCurrentlyEditing && (
        <div className="mt-3 flex gap-2">
          <button
            className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md bg-emerald-800 px-2 text-xs font-semibold text-white hover:bg-emerald-900"
            onClick={() => onUpdate(item.id, "approved")}
            title="Approve"
            type="button"
          >
            <Check size={14} aria-hidden="true" />
            批准
          </button>
          {item.quote && (
            <button
              className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-stone-300 bg-white px-2 text-xs font-semibold text-stone-800 hover:bg-stone-50"
              onClick={() => onStartEdit?.(item.id)}
              title="Edit"
              type="button"
            >
              <Edit3 size={14} aria-hidden="true" />
              编辑
            </button>
          )}
          <button
            className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-rose-300 bg-white px-2 text-xs font-semibold text-rose-800 hover:bg-rose-50"
            onClick={() => onUpdate(item.id, "rejected")}
            title="Reject"
            type="button"
          >
            <X size={14} aria-hidden="true" />
            拒绝
          </button>
        </div>
      )}

      {/* Edit form for this item */}
      {isCurrentlyEditing && item.quote && (
        <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">
          <div className="text-xs font-semibold text-amber-700">正在编辑报价</div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-stone-500">价格</span>
              <input
                type="number"
                className="rounded border border-stone-300 px-2 py-1 text-sm"
                value={editForm?.suggestedPrice ?? item.quote.suggestedPrice}
                onChange={(e) => onEditFormChange?.("suggestedPrice", parseFloat(e.target.value) || 0)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-stone-500">币种</span>
              <input
                type="text"
                className="rounded border border-stone-300 px-2 py-1 text-sm"
                value={editForm?.currency ?? item.quote.currency}
                onChange={(e) => onEditFormChange?.("currency", e.target.value)}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[10px] text-stone-500">车型</span>
            <input
              type="text"
              className="rounded border border-stone-300 px-2 py-1 text-sm"
              value={editForm?.vehicleType ?? item.quote.vehicleType ?? ""}
              onChange={(e) => onEditFormChange?.("vehicleType", e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[10px] text-stone-500">理由 / 说明</span>
            <textarea
              className="rounded border border-stone-300 px-2 py-1 text-sm min-h-[60px]"
              value={editForm?.reason ?? item.quote.reason ?? ""}
              onChange={(e) => onEditFormChange?.("reason", e.target.value)}
            />
          </label>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onSaveEdit?.(item.id, false)}
              className="flex-1 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-stone-50"
              type="button"
            >
              保存编辑
            </button>
            <button
              onClick={() => onSaveEdit?.(item.id, true)}
              className="flex-1 rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900"
              type="button"
            >
              保存并批准
            </button>
            <button
              onClick={() => onCancelEdit?.()}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50"
              type="button"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function BookingSummaryView({ bookingSummary }: { bookingSummary: BookingSummary }) {
  const serviceMap: Record<string, string> = {
    airport_pickup: "机场接机",
    airport_dropoff: "机场送机",
    city_transfer: "城市接送",
    round_trip: "往返",
    day_tour: "一日游",
  };

  const detailRows = [
    ["服务", serviceMap[bookingSummary.serviceType || ""] || bookingSummary.serviceType],
    ["上车", bookingSummary.tripDetails.pickupLocation],
    ["下车", bookingSummary.tripDetails.dropoffLocation],
    ["机场", bookingSummary.tripDetails.airport],
    ["航站楼", bookingSummary.tripDetails.terminal],
    ["日期", bookingSummary.tripDetails.date],
    ["时间", bookingSummary.tripDetails.time],
    ["航班", bookingSummary.tripDetails.flightNumber],
    ["乘客", bookingSummary.tripDetails.passengerCount],
    ["行李", bookingSummary.tripDetails.luggageCount],
    ["车型", bookingSummary.tripDetails.vehiclePreference],
    ["支付", bookingSummary.paymentMethod],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-950">
          <Clock size={16} aria-hidden="true" />
          {bookingSummary.status === "ready" ? "已就绪" : "草稿"}
        </div>
        {bookingSummary.approvedPrice && (
          <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900">
            {bookingSummary.currency} {bookingSummary.approvedPrice}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {detailRows.map(([label, value]) => (
          <div className="flex items-start justify-between gap-3 text-sm" key={label}>
            <span className="text-stone-500">{label}</span>
            <span className="max-w-[220px] text-right font-medium text-stone-950">{value ?? "Missing"}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-stone-200 pt-3">
        <p className="text-xs font-semibold uppercase text-stone-500">包含项目</p>
        <p className="mt-2 text-sm leading-6 text-stone-700">
          {bookingSummary.includedFees?.join(", ") ?? "待确认"}
        </p>
      </div>

      <div className="border-t border-stone-200 pt-3">
        <p className="text-xs font-semibold uppercase text-stone-500">司机信息</p>
        <p className="mt-2 text-sm leading-6 text-stone-700">
          {bookingSummary.driverDetails?.vehicle ?? bookingSummary.tripDetails.vehiclePreference ?? "待分配司机"}
        </p>
      </div>

      <div className="border-t border-stone-200 pt-3">
        <p className="text-xs font-semibold uppercase text-stone-500">备注</p>
        <ul className="mt-2 space-y-2">
          {bookingSummary.specialNotes.map((note) => (
            <li className="text-sm leading-6 text-stone-700" key={note}>
              {note}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-stone-200 pt-3">
        <p className="text-xs font-semibold uppercase text-stone-500">客户消息</p>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-stone-200 bg-white p-3 text-xs leading-5 text-stone-800">
          {bookingSummary.confirmationText}
        </pre>
      </div>
    </div>
  );
}
