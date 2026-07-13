import { NextResponse } from "next/server";
import { consumeAuthToken, markCompanyEmailVerified } from "@/lib/supabase/saas";
import { isConfigured } from "@/lib/supabase/client";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!isConfigured() || !token) {
    return NextResponse.redirect(new URL("/login?verified=0", request.url));
  }

  const companyId = await consumeAuthToken(token, "email_verification");
  if (companyId) await markCompanyEmailVerified(companyId);
  return NextResponse.redirect(new URL(`/login?verified=${companyId ? "1" : "0"}`, request.url));
}
