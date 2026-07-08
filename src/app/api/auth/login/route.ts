import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminSession, adminSessionCookieName } from "@/lib/auth/admin";

export async function POST(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  
  try {
    const body = await request.json();
    const { password } = body;

    if (password !== adminPassword) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const token = createAdminSession();
    const cookieStore = await cookies();
    cookieStore.set(adminSessionCookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
