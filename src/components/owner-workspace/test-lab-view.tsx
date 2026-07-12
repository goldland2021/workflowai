"use client";

import { AlertTriangle, ClipboardCheck, Plane, Send, UserRoundCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { AIStatus } from "@/lib/ai/status-types";
import { analyzeCustomerTurnOnServer } from "@/lib/client/ai-workflow-api";
import { getDemoSnapshot } from "@/lib/domain/airport-transfer";
import { getMissingQuoteFields } from "@/lib/domain/booking-workflow";
import { realChatScenarios } from "@/lib/domain/real-chat-scenarios";
import { BusinessConfigurationSchema } from "@/lib/domain/schemas";
import type {
  BossInboxItem,
  BusinessConfiguration,
  CapturedContact,
  ConversationMessage,
  DetectedEvent,
  TripDetails,
} from "@/lib/domain/types";
import { ChatBubble } from "./chat-bubble";
import { FieldTracker } from "./field-tracker";
import { Panel } from "./panel";
import { TRAIN_STORAGE_KEY } from "./train-employee-view";
import { WorkspaceHeader } from "./workspace-header";

const TEST_LAB_STORAGE_KEY = "ai-employee-test-lab-v1";

interface SavedTestLabState {
  messages: ConversationMessage[];
  tripDetails: TripDetails;
  contact?: CapturedContact;
  events: DetectedEvent[];
  previewItems: BossInboxItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readSavedTestLab(): Partial<SavedTestLabState> {
  try {
    const saved = localStorage.getItem(TEST_LAB_STORAGE_KEY);
    if (!saved) return {};

    const parsed = JSON.parse(saved) as unknown;
    if (!isRecord(parsed)) return {};

    const state: Partial<SavedTestLabState> = {};
    if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
      state.messages = parsed.messages as ConversationMessage[];
    }
    if (isRecord(parsed.tripDetails)) state.tripDetails = parsed.tripDetails as TripDetails;
    if ("contact" in parsed) state.contact = parsed.contact as CapturedContact | undefined;
    if (Array.isArray(parsed.events)) state.events = parsed.events as DetectedEvent[];
    if (Array.isArray(parsed.previewItems)) state.previewItems = parsed.previewItems as BossInboxItem[];
    return state;
  } catch {
    return {};
  }
}

function readTrainDraftConfig(fallback: BusinessConfiguration): BusinessConfiguration {
  try {
    const saved = localStorage.getItem(TRAIN_STORAGE_KEY);
    if (!saved) return fallback;
    const parsed = BusinessConfigurationSchema.safeParse(JSON.parse(saved));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

interface TestLabViewProps {
  initialBusinessConfig: BusinessConfiguration;
  aiStatus: AIStatus;
}

export function TestLabView({ initialBusinessConfig, aiStatus }: TestLabViewProps) {
  const demo = getDemoSnapshot();

  const [messages, setMessages] = useState<ConversationMessage[]>(demo.conversation);
  const [tripDetails, setTripDetails] = useState<TripDetails>(demo.tripDetails);
  const [contact, setContact] = useState<CapturedContact | undefined>(demo.contact);
  const [events, setEvents] = useState<DetectedEvent[]>(demo.detectedEvents);
  const [previewItems, setPreviewItems] = useState<BossInboxItem[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const saved = readSavedTestLab();
      if (saved.messages && saved.messages.length > 0) setMessages(saved.messages);
      if (saved.tripDetails) setTripDetails(saved.tripDetails);
      if ("contact" in saved) setContact(saved.contact);
      if (saved.events) setEvents(saved.events);
      if (saved.previewItems) setPreviewItems(saved.previewItems);
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        TEST_LAB_STORAGE_KEY,
        JSON.stringify({ messages, tripDetails, contact, events, previewItems }),
      );
    } catch (e) {
      console.warn("Failed to persist Test Lab state", e);
    }
  }, [messages, tripDetails, contact, events, previewItems]);

  const missingFields = getMissingQuoteFields(tripDetails);

  function resetSimulation() {
    localStorage.removeItem(TEST_LAB_STORAGE_KEY);
    setMessages(demo.conversation);
    setTripDetails(demo.tripDetails);
    setContact(demo.contact);
    setEvents(demo.detectedEvents);
    setPreviewItems([]);
    setInput("");
    setIsThinking(false);
  }

  async function sendCustomerMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed) return;
    const turnId = String(messages.length + 1).padStart(3, "0");

    const customerMessage: ConversationMessage = {
      id: `msg_customer_live_${turnId}`,
      role: "customer",
      text: trimmed,
      createdAt: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
      channel: "website_widget",
    };

    setIsThinking(true);
    try {
      const configForPreview = readTrainDraftConfig(initialBusinessConfig);

      const result = await analyzeCustomerTurnOnServer({
        message: trimmed,
        currentTripDetails: tripDetails,
        existingBossItems: previewItems.map((item) => ({
          status: item.status,
          type: item.type,
          event: item.event ? { eventType: item.event.eventType } : undefined,
        })),
        recentMessages: messages.slice(-8),
        businessConfiguration: configForPreview,
        simulate: true,
      });

      setMessages((current) => [...current, customerMessage, result.aiMessage]);
      setTripDetails(result.tripDetails);
      setContact((current) => result.contact ?? current);
      setEvents((current) => [...result.detectedEvents, ...current]);
      setPreviewItems((current) => [...result.bossInboxItems, ...current]);
    } catch {
      const fallbackMessage: ConversationMessage = {
        id: `msg_ai_error_${turnId}`,
        role: "ai",
        text: "抱歉，刚才分析消息时出错了。请稍后再试。",
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

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-stone-950">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <WorkspaceHeader title="对话测试实验室" aiStatus={aiStatus} />

        <p className="text-xs text-stone-500">
          在这里模拟客户对话来测试你训练的 AI，不会产生真实的客户记录或老板收件箱任务。
        </p>

        <section className="grid gap-4 2xl:grid-cols-[minmax(420px,1fr)_280px]">
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
            <Panel title="会送去老板审批吗？" compact icon={<ClipboardCheck size={17} aria-hidden="true" />}>
              {previewItems.length > 0 ? (
                <div className="space-y-2">
                  {previewItems.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
                      <p className="text-xs font-semibold text-amber-900">{item.decisionType}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-amber-800">{item.recommendation}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-stone-600">目前 AI 会自己回复，不需要老板审批。</p>
              )}
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}
