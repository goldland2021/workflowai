import { NextResponse } from "next/server";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { getConversationById, saveMessage } from "@/lib/supabase/database";
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
    const { conversationId, message } = body;

    if (!conversationId || !message?.role || !message?.text) {
      return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
    }

    const conversation = await getConversationById(conversationId, companyId);
    if (!conversation) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    await saveMessage(conversationId, message);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to save message" },
      { status: 500 }
    );
  }
}
