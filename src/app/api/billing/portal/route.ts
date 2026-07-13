import { getCurrentCompanyId } from "@/lib/auth/admin";
import { getBillingBaseUrl, getStripe, isStripeConfigured } from "@/lib/billing/stripe";
import { getCompanySaasState } from "@/lib/supabase/saas";

export async function POST(request: Request) {
  const companyId = await getCurrentCompanyId();
  if (!companyId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStripeConfigured()) return Response.json({ error: "Stripe 尚未配置。" }, { status: 503 });

  try {
    const state = await getCompanySaasState(companyId);
    if (!state.stripeCustomerId) {
      return Response.json({ error: "当前账号还没有 Stripe 客户记录。" }, { status: 409 });
    }

    const portal = await getStripe().billingPortal.sessions.create({
      customer: state.stripeCustomerId,
      return_url: `${getBillingBaseUrl(request)}/billing`,
    });
    return Response.json({ url: portal.url });
  } catch (error) {
    console.error("Failed to create Stripe billing portal session", error);
    return Response.json({ error: "暂时无法打开账单管理，请稍后重试。" }, { status: 502 });
  }
}
