import { redirect } from "next/navigation";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { OwnerWorkspace } from "@/components/owner-workspace";
import { getAIStatus } from "@/lib/ai/server-status";
import { getDemoSnapshot } from "@/lib/domain/airport-transfer";
import { isConfigured } from "@/lib/supabase/client";
import { getBossInboxItems } from "@/lib/supabase/database";
import type { BossInboxItem } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const companyId = await getCurrentCompanyId();
  if (!companyId) {
    redirect("/login");
  }

  const aiStatus = getAIStatus();
  const demo = getDemoSnapshot();
  let bossInbox: BossInboxItem[] = demo.bossInbox;

  if (isConfigured()) {
    try {
      const inboxItems = await getBossInboxItems(companyId, "pending");

      if (inboxItems.length > 0) {
        bossInbox = inboxItems.map((item) => ({
          id: item.id,
          type: item.type as never,
          status: item.status as never,
          customerName: item.customer_name ?? "",
          summary: item.summary ?? "",
          recommendation: item.recommendation ?? "",
          reason: item.reason ?? "",
          confidence: item.confidence ?? 0,
          decisionType: item.decision_type ?? "",
          createdAt: item.created_at,
          quote: item.suggested_price
            ? {
                id: `quote_${item.id}`,
                suggestedPrice: item.suggested_price,
                currency: item.currency ?? "USD",
                vehicleType: item.vehicle_type ?? undefined,
                reason: item.reason ?? "",
                confidence: item.confidence ?? 75,
                missingFields: [],
                includedFees: ["Tolls", "Parking fees", "Taxes"],
              }
            : undefined,
        }));
      }
    } catch {
      // DB available but tables not ready yet - fallback gracefully
      console.warn("Supabase tables not ready, using demo data");
    }
  }

  return (
    <OwnerWorkspace
      bossInbox={bossInbox}
      tripDetails={demo.tripDetails}
      contact={demo.contact}
      bookingSummary={demo.bookingSummary}
      aiStatus={aiStatus}
    />
  );
}
