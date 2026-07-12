import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/auth/admin";
import { saveMessage } from "@/lib/supabase/database";
import { isConfigured } from "@/lib/supabase/client";

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
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

    await saveMessage(conversationId, message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
