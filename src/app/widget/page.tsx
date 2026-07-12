import WidgetClient from "@/components/chat-widget/widget-client";

export const metadata = {
  title: "WorkflowAI Chat Widget",
};

interface WidgetPageProps {
  searchParams: Promise<{ company?: string }>;
}

export default async function WidgetPage({ searchParams }: WidgetPageProps) {
  const { company } = await searchParams;
  return <WidgetClient companyId={company} />;
}
