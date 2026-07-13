import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSession, sessionCookieName, sessionMaxAgeSeconds } from "@/lib/auth/admin";
import { UNUSABLE_PASSWORD_HASH, verifyPassword } from "@/lib/auth/password";
import { isConfigured } from "@/lib/supabase/client";
import { getCompanyByEmail } from "@/lib/supabase/database";
import { storeAuthSession } from "@/lib/supabase/saas";

const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
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

  const parsed = LoginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "请输入邮箱和密码" }, { status: 400 });
  }

  try {
    const company = await getCompanyByEmail(parsed.data.email);
    // Always run the hash comparison, even with no matching account, so a
    // response's timing doesn't reveal whether the email is registered.
    const validPassword = await verifyPassword(
      parsed.data.password,
      company?.password_hash ?? UNUSABLE_PASSWORD_HASH,
    );

    if (!company || !validPassword) {
      return NextResponse.json({ ok: false, error: "邮箱或密码错误" }, { status: 401 });
    }

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
