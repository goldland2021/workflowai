import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getCurrentCompanyId,
  getCurrentSessionToken,
  sessionCookieName,
} from "@/lib/auth/admin";
import { revokeAuthSession } from "@/lib/supabase/saas";
import { isConfigured } from "@/lib/supabase/client";

export async function POST() {
  const companyId = await getCurrentCompanyId();
  const token = await getCurrentSessionToken();

  if (companyId && token && isConfigured()) {
    try {
      await revokeAuthSession(companyId, token);
    } catch {
      // Cookie removal still logs the user out if the migration is pending.
    }
  }

  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
  return NextResponse.json({ ok: true });
}
