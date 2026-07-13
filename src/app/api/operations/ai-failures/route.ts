import { NextResponse } from "next/server";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { isConfigured } from "@/lib/supabase/client";
import { getAiFailures } from "@/lib/supabase/database";

export async function GET() {
  const companyId = await getCurrentCompanyId();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isConfigured()) return NextResponse.json({ failures: [] });

  try {
    return NextResponse.json({ failures: await getAiFailures(companyId, 50) });
  } catch {
    return NextResponse.json({ failures: [], migrationReady: false });
  }
}
