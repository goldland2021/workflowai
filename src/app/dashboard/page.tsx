import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { getAIStatus } from "@/lib/ai/server-status";
import { isConfigured } from "@/lib/supabase/client";
import {
  getBossInboxItems,
  getConversationsSince,
  getRecentBookings,
  type BookingRow,
} from "@/lib/supabase/database";
import { Metric, Panel } from "@/components/owner-workspace/panel";
import { WorkspaceHeader } from "@/components/owner-workspace/workspace-header";

export const dynamic = "force-dynamic";

function startOfTodayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function formatBookingLine(booking: BookingRow): string {
  const route = [booking.pickup_location, booking.dropoff_location].filter(Boolean).join(" → ");
  return route || "路线待定";
}

function formatServiceLabel(serviceType: string | null): string | undefined {
  return serviceType?.replace(/_/g, " ");
}

export default async function DashboardPage() {
  const companyId = await getCurrentCompanyId();
  if (!companyId) {
    redirect("/login");
  }

  const aiStatus = getAIStatus();

  let todaysConversationCount = 0;
  let todaysLeadsCount = 0;
  let pendingDecisionsCount = 0;
  let recentBookings: BookingRow[] = [];

  if (isConfigured()) {
    try {
      const [conversationsToday, pendingItems, bookings] = await Promise.all([
        getConversationsSince(companyId, startOfTodayIso()),
        getBossInboxItems(companyId, "pending"),
        getRecentBookings(companyId, 8),
      ]);

      todaysConversationCount = conversationsToday.length;
      todaysLeadsCount = conversationsToday.filter((c) => Boolean(c.contact_value)).length;
      pendingDecisionsCount = pendingItems.length;
      recentBookings = bookings;
    } catch {
      console.warn("Supabase tables not ready for dashboard stats");
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-stone-950">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <WorkspaceHeader title="仪表盘" aiStatus={aiStatus} />

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="今日线索" value={String(todaysLeadsCount)} tone="emerald" />
          <Metric label="今日对话" value={String(todaysConversationCount)} tone="indigo" />
          <Metric label="待处理决策" value={String(pendingDecisionsCount)} tone="amber" />
          <Metric label="最近预订" value={String(recentBookings.length)} tone="rose" />
        </section>

        <Panel title="最近预订" icon={<ClipboardList size={18} aria-hidden="true" />}>
          {recentBookings.length > 0 ? (
            <div className="space-y-2">
              {recentBookings.map((booking) => (
                <div key={booking.id} className="rounded-md border border-stone-200 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-stone-950">{formatBookingLine(booking)}</span>
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                      {booking.status ?? "draft"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {[
                      formatServiceLabel(booking.service_type),
                      booking.date,
                      booking.time,
                      booking.passenger_count ? `${booking.passenger_count} 位乘客` : undefined,
                      booking.approved_price ? `${booking.currency ?? "USD"} ${booking.approved_price}` : "价格待定",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-stone-600">暂无预订记录。</p>
          )}
        </Panel>
      </div>
    </main>
  );
}
