import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { isConfigured } from "@/lib/supabase/client";
import {
  getLearningCases,
  updateLearningCaseReviewStatus,
} from "@/lib/supabase/database";

const ReviewSchema = z.object({
  id: z.string().min(1).max(200),
  reviewStatus: z.enum(["candidate", "accepted", "dismissed"]),
});

export async function GET(request: Request) {
  const companyId = await getCurrentCompanyId();
  if (!companyId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isConfigured()) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const limitText = new URL(request.url).searchParams.get("limit");
  const limit = limitText ? Number.parseInt(limitText, 10) : 50;
  if (!Number.isFinite(limit)) return NextResponse.json({ ok: false, error: "Invalid limit" }, { status: 400 });

  try {
    return NextResponse.json({ ok: true, cases: await getLearningCases(companyId, limit) });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load learning cases" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const companyId = await getCurrentCompanyId();
  if (!companyId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isConfigured()) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid review request" }, { status: 400 });

  try {
    await updateLearningCaseReviewStatus({
      id: parsed.data.id,
      companyId,
      reviewStatus: parsed.data.reviewStatus,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to update learning case" }, { status: 500 });
  }
}
