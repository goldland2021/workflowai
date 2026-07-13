"use client";

import dynamic from "next/dynamic";

const ChatWidget = dynamic(
  () => import("@/components/chat-widget/ChatWidget"),
  { ssr: false },
);

interface WidgetClientProps {
  companyId?: string;
  widgetToken?: string;
  widgetOrigin?: string;
  title?: string;
  language?: string;
}

export default function WidgetClient({ companyId, widgetToken, widgetOrigin, title, language }: WidgetClientProps) {
  return (
    <ChatWidget
      companyId={companyId}
      widgetToken={widgetToken}
      widgetOrigin={widgetOrigin}
      title={title}
      language={language}
    />
  );
}
