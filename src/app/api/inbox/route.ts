import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { updateBossInboxStatus } from "@/lib/supabase/database";
import { isConfigured } from "@/lib/supabase/client";
import type { QuoteSuggestion } from "@/lib/domain/types";

const InboxUpdateSchema = z.object({
  id: z.string().min(1).max(200),
  status: z.enum(["approved", "edited", "rejected"]),
  quote: z.object({
    id: z.string().optional(),
    serviceType: z.string().optional(),
    suggestedPrice: z.number().nonnegative(),
    currency: z.string().min(1).max(20),
    vehicleType: z.string().optional(),
    includedFees: z.array(z.string().max(200)).optional(),
    routeDistanceKm: z.number().optional(),
    estimatedDriveTimeMinutes: z.number().optional(),
    reason: z.string().max(2000),
    confidence: z.number().min(0).max(100),
    missingFields: z.array(z.string()).optional(),
  }).optional(),
});

export async function POST(request: Request) {
  const companyId = await getCurrentCompanyId();
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = InboxUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
    }

    await updateBossInboxStatus(
      parsed.data.id,
      parsed.data.status,
      companyId,
      parsed.data.quote as QuoteSuggestion | undefined,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
