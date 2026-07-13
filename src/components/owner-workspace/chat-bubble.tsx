import type { ConversationMessage } from "@/lib/domain/types";

function formatMessageTime(value: string): string {
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function ChatBubble({ message }: { message: ConversationMessage }) {
  const isCustomer = message.role === "customer";

  return (
    <div className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-lg px-3 py-2 text-sm leading-6 ${
          isCustomer ? "bg-emerald-800 text-white" : "border border-stone-200 bg-stone-50 text-stone-800"
        }`}
      >
        <p className="break-words">{message.text}</p>
        <p className={`mt-1 text-[11px] ${isCustomer ? "text-emerald-100" : "text-stone-500"}`}>
          {formatMessageTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}
