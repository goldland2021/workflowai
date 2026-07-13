import { NextResponse } from "next/server";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { createWidgetToken } from "@/lib/auth/widget";
import { getWidgetSettings } from "@/lib/supabase/saas";

export async function GET(request: Request) {
  const companyId = await getCurrentCompanyId();
  if (!companyId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const settings = await getWidgetSettings(companyId);
  if (settings.allowedWidgetOrigins.length === 0) {
    return NextResponse.json({ ok: false, error: "请先配置允许的业务网站域名" }, { status: 400 });
  }

  const token = createWidgetToken(companyId, settings.widgetTokenVersion);
  const baseUrl = new URL(request.url).origin;
  return NextResponse.json({
    ok: true,
    token,
    embedCode: `<script src="${baseUrl}/api/widget-embed?company=${encodeURIComponent(companyId)}&token=${encodeURIComponent(token)}"></script>`,
  });
}
