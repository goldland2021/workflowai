import { NextResponse } from "next/server";
import { getCacheStats, clearCache } from "@/lib/ai/reply-cache";

export async function GET() {
  const stats = getCacheStats();
  return NextResponse.json(stats);
}

export async function DELETE() {
  clearCache();
  return NextResponse.json({ ok: true, message: "Cache cleared" });
}
