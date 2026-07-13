import { NextResponse } from "next/server";
import { z } from "zod";
import { sendAuthLink } from "@/lib/auth/email";
import { isConfigured } from "@/lib/supabase/client";
import { createAuthToken } from "@/lib/supabase/saas";
import { getCompanyByEmail } from "@/lib/supabase/database";

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
