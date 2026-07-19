import { NextResponse } from "next/server";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { isConfigured } from "@/lib/supabase/client";
import { getAuditEvents } from "@/lib/supabase/database";

export async function GET(request: Request) {
  const companyId = await getCurrentCompanyId();
  if (!companyId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isConfigured()) {
    return NextResponse.json({ ok: false, error: "Audit is not configured" }, { status: 503 });
  }

  const parsedLimit = Number(new URL(request.url).searchParams.get("limit") || "100");
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 100;
  try {
    return NextResponse.json({ ok: true, events: await getAuditEvents(companyId, limit) });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load audit events" }, { status: 500 });
  }
}
