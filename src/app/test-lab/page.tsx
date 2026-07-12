import { redirect } from "next/navigation";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { getAIStatus } from "@/lib/ai/server-status";
import { airportTransferConfiguration } from "@/lib/domain/airport-transfer";
import { isConfigured } from "@/lib/supabase/client";
import { getBusinessConfig } from "@/lib/supabase/database";
import { TestLabView } from "@/components/owner-workspace/test-lab-view";

export const dynamic = "force-dynamic";

export default async function TestLabPage() {
  const companyId = await getCurrentCompanyId();
  if (!companyId) {
    redirect("/login");
  }

  const aiStatus = getAIStatus();
  const businessConfig = isConfigured()
    ? (await getBusinessConfig(companyId)) ?? airportTransferConfiguration
    : airportTransferConfiguration;

  return <TestLabView initialBusinessConfig={businessConfig} aiStatus={aiStatus} />;
}
