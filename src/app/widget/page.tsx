import WidgetClient from "@/components/chat-widget/widget-client";
import { getBusinessConfig } from "@/lib/supabase/database";

export const metadata = {
  title: "WorkflowAI Chat Widget",
};

interface WidgetPageProps {
  searchParams: Promise<{ company?: string; token?: string; origin?: string; lang?: string }>;
}

export default async function WidgetPage({ searchParams }: WidgetPageProps) {
  const { company, token, origin, lang } = await searchParams;
  const configuration = company ? await getBusinessConfig(company).catch(() => null) : null;

  return (
    <WidgetClient
      companyId={company}
      widgetToken={token}
      widgetOrigin={origin}
      title={configuration?.companyProfile.name}
      language={lang}
    />
  );
}
