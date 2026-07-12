import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/auth/admin";
import { isConfigured } from "@/lib/supabase/client";
import { saveBusinessConfig } from "@/lib/supabase/database";
import { BusinessConfigurationSchema } from "@/lib/domain/schemas";

export async function PUT(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BusinessConfigurationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid business configuration", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await saveBusinessConfig(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
