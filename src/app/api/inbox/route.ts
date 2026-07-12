import { NextResponse } from "next/server";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { updateBossInboxStatus } from "@/lib/supabase/database";
import { isConfigured } from "@/lib/supabase/client";

export async function POST(request: Request) {
  const companyId = await getCurrentCompanyId();
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || !["approved", "edited", "rejected"].includes(status)) {
      return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
    }

    await updateBossInboxStatus(id, status, companyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
