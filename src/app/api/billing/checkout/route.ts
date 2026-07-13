import { z } from "zod";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { getBillingBaseUrl, getStripe, getStripePriceId, isStripeCheckoutConfigured } from "@/lib/billing/stripe";
import { getCompanyById } from "@/lib/supabase/database";
import { getCompanySaasState } from "@/lib/supabase/saas";

const CheckoutSchema = z.object({
  plan: z.enum(["starter", "growth"]),
});

export async function POST(request: Request) {
  const companyId = await getCurrentCompanyId();
  if (!companyId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStripeCheckoutConfigured()) {
    return Response.json({ error: "Stripe 尚未配置，请先设置测试环境变量。" }, { status: 503 });
  }

  const parsed = CheckoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid plan." }, { status: 400 });

  const priceId = getStripePriceId(parsed.data.plan);
  if (!priceId) {
    return Response.json({ error: `尚未配置 ${parsed.data.plan} 的 Stripe Price ID。` }, { status: 503 });
  }

  try {
    const [company, state] = await Promise.all([
      getCompanyById(companyId),
      getCompanySaasState(companyId),
    ]);
    if (!company) return Response.json({ error: "Company not found." }, { status: 404 });

    if (state.stripeSubscriptionId && state.subscriptionStatus !== "cancelled") {
      return Response.json({ error: "当前已有有效订阅，请使用账单管理修改套餐。" }, { status: 409 });
    }

    const stripe = getStripe();
    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${getBillingBaseUrl(request)}/billing?checkout=success`,
      cancel_url: `${getBillingBaseUrl(request)}/billing?checkout=cancelled`,
      client_reference_id: companyId,
      customer: state.stripeCustomerId ?? undefined,
      customer_email: state.stripeCustomerId ? undefined : company.email,
      metadata: { companyId, plan: parsed.data.plan },
      subscription_data: {
        metadata: { companyId, plan: parsed.data.plan },
      },
    };
    const session = await stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey: `checkout:${companyId}:${parsed.data.plan}:${new Date().toISOString().slice(0, 16)}`,
    });
    if (!session.url) return Response.json({ error: "Stripe 没有返回 Checkout 地址。" }, { status: 502 });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error("Failed to create Stripe Checkout session", error);
    return Response.json({ error: "暂时无法创建支付页面，请稍后重试。" }, { status: 502 });
  }
}
