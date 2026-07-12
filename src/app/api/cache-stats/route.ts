import { NextResponse } from "next/server";
import { getCacheStats, clearCache } from "@/lib/ai/reply-cache";
import { hasAdminSession } from "@/lib/auth/admin";

export async function GET() {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const stats = getCacheStats();
  return NextResponse.json(stats);
}

export async function DELETE() {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  clearCache();
  return NextResponse.json({ ok: true, message: "Cache cleared" });
}
