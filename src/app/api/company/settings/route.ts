import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { getWidgetSettings, updateWidgetSettings } from "@/lib/supabase/saas";
import { isConfigured } from "@/lib/supabase/client";
import { normalizeWidgetOrigin } from "@/lib/auth/widget";

const SettingsSchema = z.object({
  allowedWidgetOrigins: z.array(z.string().min(1).max(500)).max(20),
});

export async function GET() {
  const companyId = await getCurrentCompanyId();
  if (!companyId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isConfigured()) return NextResponse.json({ ok: true, allowedWidgetOrigins: [] });

  const settings = await getWidgetSettings(companyId);
  return NextResponse.json({ ok: true, allowedWidgetOrigins: settings.allowedWidgetOrigins });
}

export async function PUT(request: Request) {
  const companyId = await getCurrentCompanyId();
  if (!companyId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isConfigured()) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid settings" }, { status: 400 });

  const origins = parsed.data.allowedWidgetOrigins.map(normalizeWidgetOrigin);
  if (origins.some((origin) => !origin)) {
    return NextResponse.json({ ok: false, error: "请输入完整的网站来源，例如 https://example.com" }, { status: 400 });
  }

  await updateWidgetSettings(companyId, origins as string[]);
  return NextResponse.json({ ok: true, allowedWidgetOrigins: origins });
}
