"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ConversationMessage, TripDetails } from "@/lib/domain/types";
import type { ExistingBossInboxItem } from "@/lib/domain/workflow-types";
import { analyzeCustomerTurnOnServer, loadConversationHistory } from "@/lib/client/ai-workflow-api";

export interface ChatMessage {
  id: string;
  role: "customer" | "ai" | "owner" | "system";
  text: string;
  createdAt: string;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isOpen: boolean;
  isTyping: boolean;
  error: string | null;
  toggleOpen: () => void;
  sendMessage: (text: string) => Promise<void>;
  clearError: () => void;
}

const SESSION_KEY = "wai_session_id";
const CONVERSATION_KEY = "wai_conversation_id";

function scopedKey(key: string, companyId?: string): string {
  return `${key}:${companyId || "default"}`;
}

function getSessionId(companyId?: string): string {
  if (typeof window === "undefined") return "";
  const key = scopedKey(SESSION_KEY, companyId);
  let sid = localStorage.getItem(key);
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, sid);
  }
  return sid;
}

function getConversationId(companyId?: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(scopedKey(CONVERSATION_KEY, companyId));
}

function setConversationId(id: string, companyId?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(scopedKey(CONVERSATION_KEY, companyId), id);
}

function createWelcomeMessage(text?: string): ChatMessage {
  return {
    id: "welcome",
    role: "ai",
    text: text ?? "👋 您好！请告诉我您的行程信息，我来帮您安排接送服务。",
    createdAt: "",
  };
}

export function useChat(
  companyId: string | undefined,
  apiEndpoint?: string,
  defaultOpen = false,
  widgetToken?: string,
  widgetOrigin?: string,
  welcomeMessage?: string,
  errorFallbackMessage?: string,
): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([createWelcomeMessage(welcomeMessage)]);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tripDetails, setTripDetails] = useState<TripDetails>({});
  const [existingBossItems, setExistingBossItems] = useState<ExistingBossInboxItem[]>([]);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const cid = getConversationId(companyId);
    if (!cid) return;

    loadConversationHistory({ conversationId: cid, companyId, widgetToken, widgetOrigin }, apiEndpoint).then((data) => {
      if (data.messages.length > 0) {
        const history: ChatMessage[] = data.messages.map((m) => ({
          id: m.id,
          role: m.role as "customer" | "ai" | "owner" | "system",
          text: m.text,
          createdAt: m.created_at,
        }));
        setMessages(history);
      }
    }).catch(() => {});
  }, [apiEndpoint, companyId, widgetOrigin, widgetToken]);

  const toggleOpen = useCallback(() => setIsOpen((p) => !p), []);
  const clearError = useCallback(() => setError(null), []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isTyping) return;

    const customerMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: "customer",
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, customerMsg]);
    setIsTyping(true);
    setError(null);

    try {
      const sessionId = getSessionId(companyId);
      const conversationId = getConversationId(companyId);

      // Build ConversationMessage[] for recent context
      const recentMessages: ConversationMessage[] = messages
        .filter((m) => m.role !== "system")
        .slice(-6)
        .map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          createdAt: m.createdAt,
          channel: "website_widget",
        }));

      const result = await analyzeCustomerTurnOnServer(
        {
          message: text.trim(),
          currentTripDetails: tripDetails,
          existingBossItems,
          recentMessages: recentMessages.length > 0 ? recentMessages : undefined,
          sessionId,
          conversationId: conversationId || undefined,
          companyId,
          widgetToken,
          widgetOrigin,
        },
        apiEndpoint,
      );

      if (result.conversationId) {
        setConversationId(result.conversationId, companyId);
      }

      setTripDetails(result.tripDetails);
      setExistingBossItems((current) => [
        ...current,
        ...result.bossInboxItems.map((item) => ({
          status: item.status,
          type: item.type,
          event: item.event ? { eventType: item.event.eventType } : undefined,
        })),
      ]);

      const aiMsg: ChatMessage = {
        id: result.aiMessage.id || `ai_${Date.now()}`,
        role: "ai",
        text: result.aiMessage.text,
        createdAt: result.aiMessage.createdAt || new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送消息失败，请稍后再试");
      setMessages((prev) => [...prev, {
        id: `fallback_${Date.now()}`,
        role: "ai",
        text: errorFallbackMessage ?? "抱歉，我现在无法回复。请稍后再试或通过 WhatsApp 联系我们。",
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      setIsTyping(false);
    }
  }, [apiEndpoint, messages, isTyping, companyId, tripDetails, existingBossItems, widgetToken, widgetOrigin, errorFallbackMessage]);

  return { messages, isOpen, isTyping, error, toggleOpen, sendMessage, clearError };
}
