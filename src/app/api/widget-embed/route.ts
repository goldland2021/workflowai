// Returns a JavaScript snippet for embedding the WorkflowAI chat widget
// Usage: <script src="https://your-domain.com/api/widget-embed?company=<companyId>"></script>

export const runtime = "nodejs";

import { getCurrentCompanyId } from "@/lib/auth/admin";
import { createWidgetToken, verifyWidgetToken } from "@/lib/auth/widget";
import { getWidgetSettings } from "@/lib/supabase/saas";
import { buildWidgetEmbedScript } from "@/lib/widget/embed-script";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const baseUrl = url.origin;
  const companyId = url.searchParams.get("company");
  const requestedToken = url.searchParams.get("token") ?? undefined;

  if (!companyId) return new Response("Missing company", { status: 400 });

  let token = requestedToken;
  if (!verifyWidgetToken(companyId, token)) {
    const sessionCompanyId = await getCurrentCompanyId();
    if (sessionCompanyId !== companyId || requestedToken) {
      return new Response("Invalid widget token", { status: 403 });
    }
    const settings = await getWidgetSettings(companyId);
    token = createWidgetToken(companyId, settings.widgetTokenVersion);
  }

  if (!token) return new Response("Missing widget token", { status: 403 });

  const widgetSrc = `/widget?company=${encodeURIComponent(companyId)}&token=${encodeURIComponent(token)}`;

  return new Response(buildWidgetEmbedScript(baseUrl, widgetSrc), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, must-revalidate",
    },
  });
}
