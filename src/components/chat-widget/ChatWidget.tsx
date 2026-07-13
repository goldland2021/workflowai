"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { useChat } from "./use-chat";

// ─── Inline Styles ───

const styles = {
  container: { all: "initial" as const, position: "fixed" as const, zIndex: 999999, bottom: "24px", right: "24px", fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" },
  bubble: { width: "56px", height: "56px", borderRadius: "50%", background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)", border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(37, 211, 102, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.2s, box-shadow 0.2s", position: "absolute" as const, bottom: "0", right: "0" } as React.CSSProperties,
  bubbleHover: { transform: "scale(1.08)", boxShadow: "0 6px 24px rgba(37, 211, 102, 0.4)" },
  bubbleIcon: { width: "28px", height: "28px", fill: "white" },
  notificationDot: { position: "absolute" as const, top: "-4px", right: "-4px", width: "12px", height: "12px", background: "#FF3B30", borderRadius: "50%", border: "2px solid white" },
  panel: { position: "absolute" as const, bottom: "68px", right: "0", width: "360px", maxWidth: "calc(100vw - 48px)", height: "520px", maxHeight: "calc(100vh - 120px)", background: "white", borderRadius: "16px", boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)", display: "flex", flexDirection: "column" as const, overflow: "hidden", animation: "waiSlideUp 0.25s ease-out" } as React.CSSProperties,
  header: { padding: "16px 20px", background: "linear-gradient(135deg, #075E54 0%, #128C7E 100%)", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: "0" },
  headerLeft: { display: "flex", alignItems: "center", gap: "12px" },
  headerAvatar: { width: "36px", height: "36px", borderRadius: "50%", background: "rgba(255, 255, 255, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" },
  headerTitle: { fontSize: "15px", fontWeight: "600", margin: "0" },
  headerSubtitle: { fontSize: "11px", opacity: "0.8", margin: "2px 0 0" },
  headerClose: { background: "none", border: "none", color: "white", cursor: "pointer", fontSize: "20px", opacity: "0.7", padding: "4px" } as React.CSSProperties,
  messageList: { flex: "1", overflowY: "auto" as const, padding: "16px", display: "flex", flexDirection: "column" as const, gap: "8px", background: "#ECE5DD" },
  messageRow: (r: string) => ({ display: "flex", justifyContent: r === "customer" ? "flex-end" : "flex-start", animation: "waiFadeIn 0.2s ease-out" }),
  messageBubble: (r: string) => ({ maxWidth: "80%", padding: "10px 14px", borderRadius: r === "customer" ? "16px 4px 16px 16px" : "4px 16px 16px 16px", background: r === "customer" ? "#DCF8C6" : "white", color: "#1a1a1a", fontSize: "14px", lineHeight: "1.5", boxShadow: "0 1px 2px rgba(0, 0, 0, 0.06)", whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const }),
  typingIndicator: { display: "flex", gap: "4px", padding: "10px 14px", background: "white", borderRadius: "4px 16px 16px 16px", maxWidth: "60px", justifyContent: "center" },
  typingDot: (d: number) => ({ width: "8px", height: "8px", borderRadius: "50%", background: "#999", animation: "waiBounce 1.2s infinite", animationDelay: `${d}s` } as React.CSSProperties),
  inputArea: { padding: "12px 16px", background: "white", borderTop: "1px solid #E5E5E5", display: "flex", gap: "8px", alignItems: "flex-end", flexShrink: "0" },
  input: { flex: "1", border: "1px solid #E0E0E0", borderRadius: "24px", padding: "10px 16px", fontSize: "14px", outline: "none", resize: "none" as const, fontFamily: "inherit", minHeight: "20px", maxHeight: "120px", lineHeight: "1.5" } as React.CSSProperties,
  sendButton: { width: "40px", height: "40px", borderRadius: "50%", border: "none", background: "#128C7E", color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: "0", transition: "background 0.2s" } as React.CSSProperties,
  sendButtonDisabled: { background: "#CCC", cursor: "not-allowed" },
  sendIcon: { width: "18px", height: "18px", fill: "white", transform: "rotate(90deg)" },
  errorBar: { padding: "8px 16px", background: "#FFF3F3", color: "#D32F2F", fontSize: "12px", borderTop: "1px solid #FFD0D0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: "0" },
  errorDismiss: { background: "none", border: "none", color: "#D32F2F", cursor: "pointer", fontSize: "14px", fontWeight: "600", padding: "2px 6px" } as React.CSSProperties,
};

function fmtTime(iso: string): string {
  try { const d = new Date(iso); if (isNaN(d.getTime())) return ""; return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}

// ─── Icons ───
function ChatIcon() { return <svg viewBox="0 0 24 24" style={styles.bubbleIcon}><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" fill="white" /></svg>; }
function SendIcon() { return <svg viewBox="0 0 24 24" style={styles.sendIcon}><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor" /></svg>; }

// ─── Props ───
interface ChatWidgetProps {
  title?: string;
  subtitle?: string;
  defaultOpen?: boolean;
  apiBaseUrl?: string;
  companyId?: string;
  widgetToken?: string;
  widgetOrigin?: string;
  language?: string;
}

const widgetCopy = {
  zh: { subtitle: "AI 客服在线", typing: "正在输入...", close: "关闭", input: "输入消息...", send: "发送", open: "打开聊天", welcome: (brand: string) => `👋 您好！欢迎来到${brand}。请告诉我您的行程信息，我来帮您安排包车服务。`, error: "抱歉，我现在无法回复。请稍后再试或通过 WhatsApp 联系我们。" },
  en: { subtitle: "AI concierge online", typing: "Typing...", close: "Close", input: "Type a message...", send: "Send", open: "Open chat", welcome: (brand: string) => `👋 Welcome to ${brand}. Tell me about your itinerary and I will help arrange your private charter.`, error: "Sorry, I cannot reply right now. Please try again later or contact us on WhatsApp." },
  ar: { subtitle: "مساعد الذكاء الاصطناعي متصل", typing: "يكتب...", close: "إغلاق", input: "اكتب رسالة...", send: "إرسال", open: "فتح المحادثة", welcome: (brand: string) => `👋 مرحبًا بك في ${brand}. أخبرني بتفاصيل رحلتك وسأساعدك في ترتيب سيارة خاصة.`, error: "عذرًا، لا يمكنني الرد الآن. حاول لاحقًا أو تواصل معنا عبر واتساب." },
} as const;

// ─── Main Component ───
export default function ChatWidget({ title = "WorkflowAI", subtitle, defaultOpen = false, apiBaseUrl, companyId, widgetToken, widgetOrigin, language = "zh" }: ChatWidgetProps) {
  const languageKey = language.toLowerCase().startsWith("ar") ? "ar" : language.toLowerCase().startsWith("en") ? "en" : "zh";
  const copy = widgetCopy[languageKey];
  const { messages, isOpen, isTyping, error, toggleOpen, sendMessage, clearError } = useChat(
    companyId,
    apiBaseUrl,
    defaultOpen,
    widgetToken,
    widgetOrigin,
    copy.welcome(title),
    copy.error,
  );
  const [txt, setTxt] = useState("");
  const [hover, setHover] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inpRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);
  useEffect(() => { if (isOpen) setTimeout(() => inpRef.current?.focus(), 300); }, [isOpen]);

  const send = useCallback(() => { const t = txt.trim(); if (!t || isTyping) return; setTxt(""); sendMessage(t); }, [txt, isTyping, sendMessage]);
  const onKey = useCallback((e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }, [send]);
  const onInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => { setTxt(e.target.value); const el = e.target; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; }, []);

  return (<>
    <style>{`
      @keyframes waiSlideUp { from { opacity: 0; transform: translateY(16px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes waiFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes waiBounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-8px); } }
    `}</style>
    <div style={styles.container}>
      {isOpen && (
        <div style={styles.panel}>
          <div style={styles.header}>
            <div style={styles.headerLeft}>
              <div style={styles.headerAvatar}>🤖</div>
              <div>
                <p style={styles.headerTitle}>{title}</p>
                <p style={styles.headerSubtitle}>{isTyping ? copy.typing : (subtitle ?? copy.subtitle)}</p>
              </div>
            </div>
            <button onClick={toggleOpen} style={styles.headerClose} aria-label={copy.close}>✕</button>
          </div>
          <div style={styles.messageList}>
            {messages.map((m) => m.role !== "system" ? (
              <div key={m.id} style={styles.messageRow(m.role)}>
                <div>
                  <div style={styles.messageBubble(m.role)}>{m.text}</div>
                  <div style={{ fontSize: "10px", color: "#999", marginTop: "4px", textAlign: m.role === "customer" ? "right" : "left", padding: "0 4px" }}>{fmtTime(m.createdAt)}</div>
                </div>
              </div>
            ) : null)}
            {isTyping && (
              <div style={styles.messageRow("ai")}>
                <div style={styles.typingIndicator}>
                  {[0, 0.2, 0.4].map((d, i) => <div key={i} style={styles.typingDot(d)} />)}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          {error && (
            <div style={styles.errorBar}>
              <span>{error}</span>
              <button onClick={clearError} style={styles.errorDismiss}>✕</button>
            </div>
          )}
          <div style={styles.inputArea}>
            <textarea ref={inpRef} value={txt} onChange={onInput} onKeyDown={onKey} placeholder={copy.input} rows={1} style={styles.input} disabled={isTyping} aria-label={copy.input} dir={languageKey === "ar" ? "rtl" : "auto"} />
            <button onClick={send} disabled={!txt.trim() || isTyping} style={{ ...styles.sendButton, ...(!txt.trim() || isTyping ? styles.sendButtonDisabled : {}) }} aria-label={copy.send}><SendIcon /></button>
          </div>
        </div>
      )}
      {!isOpen && (
        <button onClick={toggleOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ ...styles.bubble, ...(hover ? styles.bubbleHover : {}) }} aria-label={copy.open}>
          <ChatIcon />
          <div style={styles.notificationDot} />
        </button>
      )}
    </div>
  </>);
}
