import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSession, sessionCookieName, sessionMaxAgeSeconds } from "@/lib/auth/admin";
import { sendAuthLink } from "@/lib/auth/email";
import { hashPassword } from "@/lib/auth/password";
import { isConfigured } from "@/lib/supabase/client";
import { createCompany, getCompanyByEmail } from "@/lib/supabase/database";
import { createAuthToken, storeAuthSession } from "@/lib/supabase/saas";

const RegisterRequestSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RegisterRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "请填写完整的注册信息（密码至少8位）" }, { status: 400 });
  }

  const { companyName, email, password } = parsed.data;

  try {
    const existing = await getCompanyByEmail(email);
    if (existing) {
      return NextResponse.json({ ok: false, error: "该邮箱已注册" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const company = await createCompany({ name: companyName, email, passwordHash });

    const token = createSession(company.id);
    try {
      await storeAuthSession(
        company.id,
        token,
        new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString(),
      );
    } catch {
      // Existing installations can continue until migration 003 is applied.
    }

    try {
      const verificationToken = await createAuthToken(company.id, "email_verification", 1000 * 60 * 60 * 24 * 3);
      await sendAuthLink({
        to: company.email,
        subject: "Verify your WorkflowAI email",
        url: `${new URL(request.url).origin}/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`,
      });
    } catch {
      // Email delivery is optional until AUTH_EMAIL_WEBHOOK_URL is configured.
    }

    const cookieStore = await cookies();
    cookieStore.set(sessionCookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
