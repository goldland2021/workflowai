import { redirect } from "next/navigation";
import { getAIStatus } from "@/lib/ai/server-status";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { isStripeBillingConfigured } from "@/lib/billing/stripe";
import { getUsageSummary, getCompanySaasState } from "@/lib/supabase/saas";
import { isConfigured } from "@/lib/supabase/client";
import { BillingView } from "@/components/owner-workspace/billing-view";
import { WorkspaceHeader } from "@/components/owner-workspace/workspace-header";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams?: Promise<{ checkout?: string }> }) {
  const companyId = await getCurrentCompanyId();
  if (!companyId) redirect("/login");

  const state = await getCompanySaasState(companyId);
  let usageSummary: Awaited<ReturnType<typeof getUsageSummary>> | null = null;
  if (isConfigured()) {
    try {
      usageSummary = await getUsageSummary(companyId);
    } catch {
      console.warn("SaaS usage migration is not ready for billing page");
    }
  }

  const checkoutResult = (await searchParams)?.checkout;
  return (
    <main className="min-h-screen bg-[#f7f5ef] text-stone-950">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <WorkspaceHeader title="套餐与账单" aiStatus={getAIStatus()} />
        <BillingView
          cancelAtPeriodEnd={state.cancelAtPeriodEnd}
          checkoutResult={checkoutResult}
          currentPlan={state.plan}
          stripeConfigured={isStripeBillingConfigured()}
          subscriptionCurrentPeriodEnd={state.subscriptionCurrentPeriodEnd}
          subscriptionStatus={state.subscriptionStatus}
          trialEndsAt={state.trialEndsAt}
          usageSummary={usageSummary}
        />
      </div>
    </main>
  );
}
