"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ConversationMessage } from "@/lib/domain/types";
import { analyzeCustomerTurnOnServer, loadConversationHistory } from "@/lib/client/ai-workflow-api";
import { airportTransferConfiguration } from "@/lib/domain/airport-transfer";

export interface ChatMessage {
  id: string;
  role: "customer" | "ai" | "system";
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

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

function getConversationId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("wai_conversation_id");
}

function setConversationId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("wai_conversation_id", id);
}

function createWelcomeMessage(): ChatMessage {
  return {
    id: "welcome",
    role: "ai",
    text: "👋 您好！欢迎来到天桥机场接送。请告诉我您的行程信息，我来帮您安排接送服务。",
    createdAt: new Date().toISOString(),
  };
}

export function useChat(apiEndpoint?: string, defaultOpen = false): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([createWelcomeMessage()]);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const cid = getConversationId();
    if (!cid) return;

    loadConversationHistory({ conversationId: cid }, apiEndpoint).then((data) => {
      if (data.messages.length > 0) {
        const history: ChatMessage[] = data.messages.map((m) => ({
          id: m.id,
          role: m.role as "customer" | "ai" | "system",
          text: m.text,
          createdAt: m.created_at,
        }));
        setMessages(history);
      }
    }).catch(() => {});
  }, [apiEndpoint]);

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
      const sessionId = getSessionId();
      const conversationId = getConversationId();

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
          currentTripDetails: {},
          existingBossItems: [],
          recentMessages: recentMessages.length > 0 ? recentMessages : undefined,
          businessConfiguration: airportTransferConfiguration,
          sessionId,
          conversationId: conversationId || undefined,
        },
        apiEndpoint,
      );

      if (result.conversationId) {
        setConversationId(result.conversationId);
      }

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
        text: "抱歉，我现在无法回复。请稍后再试或通过 WhatsApp 联系我们。",
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      setIsTyping(false);
    }
  }, [apiEndpoint, messages, isTyping]);

  return { messages, isOpen, isTyping, error, toggleOpen, sendMessage, clearError };
}
