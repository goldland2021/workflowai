import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { consumeAuthToken, updateCompanyPassword } from "@/lib/supabase/saas";
import { isConfigured } from "@/lib/supabase/client";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";

const CompleteSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(200).regex(/[A-Za-z]/).regex(/[0-9]/),
});

export async function POST(request: Request) {
  if (!isConfigured()) return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "密码至少8位并包含字母和数字" },
      { status: 400 },
    );
  }

  if (!(await checkAuthRateLimit(request, {
    action: "password-reset-complete",
    ip: { windowMs: 15 * 60_000, maxRequests: 8 },
    identifier: parsed.data.token,
    identifierLimit: { windowMs: 15 * 60_000, maxRequests: 5 },
  }))) {
    return NextResponse.json({ ok: false, error: "Too many reset attempts" }, { status: 429 });
  }

  const companyId = await consumeAuthToken(parsed.data.token, "password_reset");
  if (!companyId) return NextResponse.json({ ok: false, error: "Reset link expired" }, { status: 400 });

  await updateCompanyPassword(companyId, await hashPassword(parsed.data.password));
  return NextResponse.json({ ok: true });
}
