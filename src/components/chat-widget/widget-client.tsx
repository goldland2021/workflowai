"use client";

import dynamic from "next/dynamic";

const ChatWidget = dynamic(
  () => import("@/components/chat-widget/ChatWidget"),
  { ssr: false },
);

export default function WidgetClient() {
  return <ChatWidget defaultOpen />;
}
