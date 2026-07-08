"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarCheck,
  Car,
  Check,
  ClipboardCheck,
  Clock,
  CreditCard,
  Edit3,
  Inbox,
  MessageSquareText,
  Plane,
  ReceiptText,
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
  DriverDetails,
  FAQ,
  QuoteSuggestion,
  ReceiptRequest,
  TripDetails,
  Vehicle,
} from "@/lib/domain/types";
import type { AIStatus } from "@/lib/ai/status-types";
import { ChatBubble } from "./owner-workspace/chat-bubble";
import { FieldTracker } from "./owner-workspace/field-tracker";
import { BossInboxCard } from "./owner-workspace/boss-inbox-card";
import { BookingSummaryView } from "./owner-workspace/booking-summary-view";
import { FulfillmentTracker } from "./owner-workspace/fulfillment-tracker";
import { Panel, Metric, StatusPill, ProgressRows } from "./owner-workspace/panel";
import { ErrorBoundary } from "../components/error-boundary";
import { LoadingSkeleton, PanelSkeleton } from "../components/loading-skeleton";


const STORAGE_KEY = "ai-employee-workspace-state-v1";


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
  driverDetails: DriverDetails;
  paymentMethod: string;
  receiptRequest: ReceiptRequest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

function parseDriverDetails(value: unknown): DriverDetails | undefined {
  if (!isRecord(value)) return undefined;

  const details: DriverDetails = {
    name: readOptionalString(value, "name"),
    phone: readOptionalString(value, "phone"),
    vehicle: readOptionalString(value, "vehicle"),
    color: readOptionalString(value, "color"),
    licensePlate: readOptionalString(value, "licensePlate"),
    whatsapp: readOptionalString(value, "whatsapp"),
  };

  return Object.values(details).some(Boolean) ? details : undefined;
}

function parseReceiptRequest(value: unknown): ReceiptRequest | undefined {
  if (!isRecord(value) || typeof value.needed !== "boolean") return undefined;

  return {
    needed: value.needed,
    receiptName: readOptionalString(value, "receiptName"),
    amount: readOptionalNumber(value, "amount"),
    currency: readOptionalString(value, "currency"),
  };
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
    state.driverDetails = parseDriverDetails(parsed.driverDetails) ?? {};
    if (typeof parsed.paymentMethod === "string") {
      state.paymentMethod = parsed.paymentMethod;
    }
    state.receiptRequest = parseReceiptRequest(parsed.receiptRequest) ?? { needed: false };

    return state;
  } catch {
    return {};
  }
}

export function OwnerWorkspace({ snapshot, aiStatus }: OwnerWorkspaceProps) {
  // Always start with snapshot values for SSR/hydration safety.
  // Load from localStorage in useEffect after mount to avoid mismatch.
  const [messages, setMessages] = useState<ConversationMessage[]>(snapshot.conversation);
  const [tripDetails, setTripDetails] = useState<TripDetails>(snapshot.tripDetails);
  const [contact, setContact] = useState<CapturedContact | undefined>(snapshot.contact);
  const [events, setEvents] = useState<DetectedEvent[]>(snapshot.detectedEvents);
  const [bossInbox, setBossInbox] = useState<BossInboxItem[]>(snapshot.bossInbox);

  // Editable business configuration for teaching the AI / fixing data
  const [businessConfig, setBusinessConfig] = useState<BusinessConfiguration>(snapshot.businessConfiguration);
  const [driverDetails, setDriverDetails] = useState<DriverDetails>(snapshot.bookingSummary.driverDetails ?? {});
  const [paymentMethod, setPaymentMethod] = useState<string>(snapshot.bookingSummary.paymentMethod ?? "Cash to driver after service");
  const [receiptRequest, setReceiptRequest] = useState<ReceiptRequest>(snapshot.bookingSummary.receiptRequest ?? { needed: false });

  // Load persisted state after hydration
  useEffect(() => {
    const saved = readSavedWorkspace();
    if (saved.messages && saved.messages.length > 0) setMessages(saved.messages);
    if (saved.tripDetails) setTripDetails(saved.tripDetails);
    if ("contact" in saved) setContact(saved.contact);
    if (saved.events) setEvents(saved.events);
    if (saved.bossInbox && saved.bossInbox.length > 0) setBossInbox(saved.bossInbox);
    if (saved.businessConfig) setBusinessConfig(saved.businessConfig);
    if (saved.driverDetails) setDriverDetails(saved.driverDetails);
    if (saved.paymentMethod) setPaymentMethod(saved.paymentMethod);
    if (saved.receiptRequest) setReceiptRequest(saved.receiptRequest);
  }, []);

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
    setDriverDetails(snapshot.bookingSummary.driverDetails ?? {});
    setPaymentMethod(snapshot.bookingSummary.paymentMethod ?? "Cash to driver after service");
    setReceiptRequest(snapshot.bookingSummary.receiptRequest ?? { needed: false });
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
        driverDetails,
        paymentMethod,
        receiptRequest,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      // Ignore storage errors (e.g. quota or private mode)
      console.warn('Failed to persist workspace state', e);
    }
  }, [messages, tripDetails, contact, events, bossInbox, businessConfig, driverDetails, paymentMethod, receiptRequest]);

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
    () =>
      createBookingSummary({
        tripDetails,
        contact,
        approvedQuote,
        driverDetails,
        paymentMethod,
        receiptRequest,
      }),
    [approvedQuote, contact, driverDetails, paymentMethod, receiptRequest, tripDetails],
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

  function updateDriverDetail(field: keyof DriverDetails, value: string) {
    setDriverDetails((current) => ({
      ...current,
      [field]: value || undefined,
    }));
  }

  function updateReceiptRequest(changes: Partial<ReceiptRequest>) {
    setReceiptRequest((current) => ({
      ...current,
      ...changes,
    }));
  }

  return (
        <ErrorBoundary><main className="min-h-screen bg-[#f7f5ef] text-stone-950">
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
            <Panel title="训练员工（编辑此处可教AI知识）" icon={<Sparkles size={18} aria-hidden="true" />}>
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
                  <p className="text-[10px] text-emerald-700 mt-2">提示：修改上方公司信息、车型、知识库后，AI会立即使用新知识回复。</p>
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

            <Panel title="公司知识库（编辑后AI会立即使用）" icon={<ShieldCheck size={18} aria-hidden="true" />}>
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

            <Panel title="履约跟踪" icon={<Car size={18} aria-hidden="true" />}>
              <FulfillmentTracker
                driverDetails={driverDetails}
                paymentMethod={paymentMethod}
                receiptRequest={receiptRequest}
                onDriverChange={updateDriverDetail}
                onPaymentMethodChange={setPaymentMethod}
                onReceiptChange={updateReceiptRequest}
              />
            </Panel>
          </aside>
        </section>
      </div>
        </main></ErrorBoundary>
  );
}

