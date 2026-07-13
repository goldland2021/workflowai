import { NextResponse } from "next/server";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { getUsageSummary } from "@/lib/supabase/saas";

export async function GET() {
  const companyId = await getCurrentCompanyId();
  if (!companyId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json({ ok: true, ...(await getUsageSummary(companyId)) });
  } catch {
    return NextResponse.json({ ok: false, error: "Usage is not configured" }, { status: 503 });
  }
}
