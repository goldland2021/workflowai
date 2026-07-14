import { NextResponse } from "next/server";
import { z } from "zod";
import { sendAuthLink } from "@/lib/auth/email";
import { isConfigured } from "@/lib/supabase/client";
import { createAuthToken } from "@/lib/supabase/saas";
import { getCompanyByEmail } from "@/lib/supabase/database";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";

const RequestSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

export async function POST(request: Request) {
  const genericResponse = NextResponse.json({ ok: true });
  if (!isConfigured()) return genericResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return genericResponse;
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return genericResponse;

  if (!(await checkAuthRateLimit(request, {
    action: "password-reset-request",
    ip: { windowMs: 60 * 60_000, maxRequests: 8 },
    identifier: parsed.data.email,
    identifierLimit: { windowMs: 60 * 60_000, maxRequests: 3 },
  }))) {
    return NextResponse.json({ ok: false, error: "Too many reset requests" }, { status: 429 });
  }

  try {
    const company = await getCompanyByEmail(parsed.data.email);
    if (!company) return genericResponse;

    const token = await createAuthToken(company.id, "password_reset", 1000 * 60 * 60);
    await sendAuthLink({
      to: company.email,
      subject: "WorkflowAI password reset",
      url: `${new URL(request.url).origin}/reset-password?token=${encodeURIComponent(token)}`,
    });
  } catch {
    // Do not reveal account existence or email delivery state.
  }

  return genericResponse;
}
