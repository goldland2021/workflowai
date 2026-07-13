import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { getAIStatus } from "@/lib/ai/server-status";
import { getUsageSummary } from "@/lib/supabase/saas";
import { isConfigured } from "@/lib/supabase/client";
import {
  getBossInboxItems,
  getConversationsSince,
  getAiFailures,
  getRecentBookings,
  type BookingRow,
} from "@/lib/supabase/database";
import { Metric, Panel } from "@/components/owner-workspace/panel";
import { WorkspaceHeader } from "@/components/owner-workspace/workspace-header";
import { PLAN_DEFINITIONS } from "@/lib/saas/plans";
import Link from "next/link";

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
  let usageSummary: Awaited<ReturnType<typeof getUsageSummary>> | null = null;
  let aiFailures: Awaited<ReturnType<typeof getAiFailures>> = [];

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

    try {
      aiFailures = await getAiFailures(companyId, 5);
    } catch {
      console.warn("AI failure log migration is not ready");
    }

    try {
      usageSummary = await getUsageSummary(companyId);
    } catch {
      console.warn("SaaS usage migration is not ready");
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

        {usageSummary && (
          <Panel title="套餐与用量">
            <div className="grid gap-3 sm:grid-cols-4">
              {([
                ["AI消息", "ai_messages"],
                ["对话", "conversations"],
                ["线索", "leads"],
                ["报价建议", "quote_suggestions"],
              ] as const).map(([label, metric]) => (
                <div className="rounded-md border border-stone-200 bg-white px-3 py-2" key={metric}>
                  <p className="text-xs text-stone-500">{label}</p>
                  <p className="mt-1 text-lg font-semibold text-stone-950">
                    {usageSummary.usage[metric]} <span className="text-xs font-normal text-stone-500">/ {usageSummary.limits[metric]}</span>
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-stone-600">
              当前套餐：{PLAN_DEFINITIONS[usageSummary.plan].label} · {usageSummary.plan === "trial"
                ? usageSummary.trialExpired
                  ? "试用已结束"
                  : `试用至 ${new Date(usageSummary.trialEndsAt).toLocaleDateString("zh-CN")}`
                : usageSummary.subscriptionCurrentPeriodEnd
                  ? `当前周期至 ${new Date(usageSummary.subscriptionCurrentPeriodEnd).toLocaleDateString("zh-CN")}`
                  : `状态：${usageSummary.subscriptionStatus}`}
            </p>
            <Link className="mt-3 inline-flex text-xs font-semibold text-emerald-800 hover:underline" href="/billing">
              查看套餐与管理账单 →
            </Link>
          </Panel>
        )}

        {aiFailures.length > 0 && (
          <Panel title="AI运行提醒">
            <div className="space-y-2">
              {aiFailures.map((failure) => (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs" key={failure.id}>
                  <div className="flex flex-wrap justify-between gap-2 font-semibold text-rose-900">
                    <span>{failure.stage}</span>
                    <span>{new Date(failure.created_at).toLocaleString("zh-CN")}</span>
                  </div>
                  <p className="mt-1 break-words leading-5 text-rose-800">{failure.message}</p>
                </div>
              ))}
            </div>
          </Panel>
        )}

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
