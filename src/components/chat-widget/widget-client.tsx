"use client";

import dynamic from "next/dynamic";

const ChatWidget = dynamic(
  () => import("@/components/chat-widget/ChatWidget"),
  { ssr: false },
);

interface WidgetClientProps {
  companyId?: string;
}

export default function WidgetClient({ companyId }: WidgetClientProps) {
  return <ChatWidget companyId={companyId} defaultOpen />;
}
