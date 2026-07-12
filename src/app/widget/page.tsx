import WidgetClient from "@/components/chat-widget/widget-client";

export const metadata = {
  title: "WorkflowAI Chat Widget",
};

export const dynamic = "force-static";

export default function WidgetPage() {
  return <WidgetClient />;
}
