import { NextResponse } from "next/server";
import { getCacheStats, clearCache } from "@/lib/ai/reply-cache";
import { getCurrentCompanyId } from "@/lib/auth/admin";

export async function GET() {
  const companyId = await getCurrentCompanyId();
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const stats = getCacheStats(companyId);
  return NextResponse.json(stats);
}

export async function DELETE() {
  const companyId = await getCurrentCompanyId();
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  clearCache(companyId);
  return NextResponse.json({ ok: true, message: "Cache cleared" });
}
