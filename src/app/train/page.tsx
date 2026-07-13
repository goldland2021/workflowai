import { redirect } from "next/navigation";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { getAIStatus } from "@/lib/ai/server-status";
import { airportTransferConfiguration } from "@/lib/domain/airport-transfer";
import { isConfigured } from "@/lib/supabase/client";
import { getBusinessConfig } from "@/lib/supabase/database";
import { TrainEmployeeView } from "@/components/owner-workspace/train-employee-view";

export const dynamic = "force-dynamic";

export default async function TrainPage() {
  const companyId = await getCurrentCompanyId();
  if (!companyId) {
    redirect("/login");
  }

  const aiStatus = getAIStatus();
  const storedConfig = isConfigured() ? await getBusinessConfig(companyId) : null;
  const businessConfig = storedConfig ?? airportTransferConfiguration;

  return (
    <TrainEmployeeView
      businessConfig={businessConfig}
      companyId={companyId}
      aiStatus={aiStatus}
      hasStoredConfig={Boolean(storedConfig)}
    />
  );
}
