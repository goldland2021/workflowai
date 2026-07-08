import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminSession, adminSessionCookieName } from "@/lib/auth/admin";
import { OwnerWorkspace } from "@/components/owner-workspace";
import { getAIStatus } from "@/lib/ai/server-status";
import { getDemoSnapshot } from "@/lib/domain/airport-transfer";
import { isConfigured } from "@/lib/supabase/client";
import { getBusinessConfig, getBossInboxItems, getConversations, getMessages } from "@/lib/supabase/database";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  if (!verifyAdminSession(cookieStore.get(adminSessionCookieName)?.value)) {
    redirect("/login");
  }
  const aiStatus = getAIStatus();
  const hasDb = isConfigured();
  let snapshot = getDemoSnapshot();

  if (hasDb) {
    try {
      // Try to load real data
      const config = await getBusinessConfig();
      const inboxItems = await getBossInboxItems("pending");
      const conversations = await getConversations(5);

      if (config) {
        snapshot = {
          ...snapshot,
          businessConfiguration: config,
        };
      }

      if (inboxItems.length > 0) {
        snapshot = {
          ...snapshot,
          bossInbox: inboxItems.map((item) => ({
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
                  vehicleType: (item as any).vehicle_type ?? undefined,
                  reason: item.reason ?? "",
                  confidence: item.confidence ?? 75,
                  missingFields: [],
                  includedFees: ["Tolls", "Parking fees", "Taxes"],
                }
              : undefined,
          })),
        };
      }
    } catch {
      // DB available but tables not ready yet - fallback gracefully
      console.warn("Supabase tables not ready, using demo data");
    }
  }

  return <OwnerWorkspace snapshot={snapshot} aiStatus={aiStatus} />;
}


