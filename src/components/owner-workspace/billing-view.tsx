"use client";

import { Check, CreditCard, ExternalLink, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { PlanId } from "@/lib/saas/plans";
import { PLAN_DEFINITIONS } from "@/lib/saas/plans";
import type { UsageSummary } from "@/lib/supabase/saas";
import { Panel } from "./panel";

const planOrder: PlanId[] = ["trial", "starter", "growth"];

export function BillingView({
  currentPlan,
  subscriptionStatus,
  trialEndsAt,
  subscriptionCurrentPeriodEnd,
  cancelAtPeriodEnd,
  usageSummary,
  stripeConfigured,
  checkoutResult,
}: {
  currentPlan: PlanId;
  subscriptionStatus: string;
  trialEndsAt: string;
  subscriptionCurrentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usageSummary: UsageSummary | null;
  stripeConfigured: boolean;
  checkoutResult?: string;
}) {
  const [loadingPlan, setLoadingPlan] = useState<Exclude<PlanId, "trial"> | "portal" | null>(null);
  const [message, setMessage] = useState("");

  async function startCheckout(plan: Exclude<PlanId, "trial">) {
    setLoadingPlan(plan);
    setMessage("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) {
        setMessage(data?.error ?? "暂时无法打开支付页面。");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setMessage("暂时无法打开支付页面，请稍后重试。");
    } finally {
      setLoadingPlan(null);
    }
  }

  async function openPortal() {
    setLoadingPlan("portal");
    setMessage("");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) {
        setMessage(data?.error ?? "暂时无法打开账单管理。");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setMessage("暂时无法打开账单管理，请稍后重试。");
    } finally {
      setLoadingPlan(null);
    }
  }

  const isPaid = currentPlan !== "trial" && Boolean(subscriptionStatus === "active" || subscriptionStatus === "past_due");

  return (
    <div className="space-y-5">
      {checkoutResult === "success" && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          支付页面已完成。订阅状态会在 Stripe Webhook 到达后自动更新。
        </p>
      )}
      {checkoutResult === "cancelled" && (
        <p className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700">你已取消本次支付。</p>
      )}
      {!stripeConfigured && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Stripe 还没有配置。当前页面可以预览套餐，但支付按钮需要测试环境变量和 Stripe Price ID。
        </p>
      )}
      {message && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{message}</p>}

      <Panel title="当前订阅" icon={<CreditCard size={18} aria-hidden="true" />}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-stone-950">{PLAN_DEFINITIONS[currentPlan].label}</p>
            <p className="mt-1 text-xs text-stone-600">
              状态：{subscriptionStatus}
              {subscriptionCurrentPeriodEnd && ` · 当前周期至 ${new Date(subscriptionCurrentPeriodEnd).toLocaleDateString("zh-CN")}`}
              {currentPlan === "trial" && ` · 试用至 ${new Date(trialEndsAt).toLocaleDateString("zh-CN")}`}
              {cancelAtPeriodEnd && " · 到期后取消"}
            </p>
          </div>
          {isPaid && (
            <button
              className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              disabled={loadingPlan !== null}
              onClick={openPortal}
              type="button"
            >
              {loadingPlan === "portal" ? <LoaderCircle className="animate-spin" size={14} aria-hidden="true" /> : <ExternalLink size={14} aria-hidden="true" />}
              管理账单
            </button>
          )}
        </div>
        {usageSummary && (
          <div className="mt-4 grid gap-2 border-t border-stone-200 pt-4 sm:grid-cols-4">
            {(["ai_messages", "conversations", "leads", "quote_suggestions"] as const).map((metric) => (
              <div className="rounded-md border border-stone-200 bg-white px-3 py-2" key={metric}>
                <p className="text-[11px] text-stone-500">{metric === "ai_messages" ? "AI消息" : metric === "quote_suggestions" ? "报价建议" : metric === "conversations" ? "对话" : "线索"}</p>
                <p className="mt-1 text-sm font-semibold text-stone-950">
                  {usageSummary.usage[metric]} <span className="text-[11px] font-normal text-stone-500">/ {usageSummary.limits[metric]}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <section className="grid gap-4 lg:grid-cols-3">
        {planOrder.map((plan) => {
          const definition = PLAN_DEFINITIONS[plan];
          const isCurrent = currentPlan === plan;
          const actionPlan = plan === "trial" ? null : plan;
          return (
            <article className={`rounded-md border bg-white p-4 ${isCurrent ? "border-emerald-700 ring-1 ring-emerald-700" : "border-stone-200"}`} key={plan}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-stone-950">{definition.label}</h2>
                  <p className="mt-1 text-xs leading-5 text-stone-600">{definition.description}</p>
                </div>
                {isCurrent && <span className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-800">当前套餐</span>}
              </div>
              <p className="mt-4 text-2xl font-semibold text-stone-950">
                {definition.monthlyPrice === 0 ? "免费" : `$${definition.monthlyPrice}`}
                {definition.monthlyPrice > 0 && <span className="text-xs font-normal text-stone-500"> / 月</span>}
              </p>
              <ul className="mt-4 space-y-2 border-t border-stone-200 pt-4 text-xs text-stone-700">
                <li className="flex gap-2"><Check className="shrink-0 text-emerald-700" size={14} aria-hidden="true" />每月 {definition.aiMessages.toLocaleString()} 条 AI 消息</li>
                <li className="flex gap-2"><Check className="shrink-0 text-emerald-700" size={14} aria-hidden="true" />每月 {definition.conversations.toLocaleString()} 个对话</li>
                <li className="flex gap-2"><Check className="shrink-0 text-emerald-700" size={14} aria-hidden="true" />每月 {definition.leads.toLocaleString()} 条线索</li>
                <li className="flex gap-2"><Check className="shrink-0 text-emerald-700" size={14} aria-hidden="true" />网站 Widget 和 Boss Inbox</li>
              </ul>
              {actionPlan && !isCurrent && (
                <button
                  className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!stripeConfigured || loadingPlan !== null}
                  onClick={() => (isPaid ? openPortal() : startCheckout(actionPlan))}
                  type="button"
                >
                  {loadingPlan === actionPlan && <LoaderCircle className="animate-spin" size={15} aria-hidden="true" />}
                  {isPaid ? "在账单中管理" : `升级到${definition.label}`}
                </button>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
