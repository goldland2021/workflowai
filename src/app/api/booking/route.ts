import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { isConfigured } from "@/lib/supabase/client";
import { recordBookingConfirmationSent, updateBookingFulfillment } from "@/lib/supabase/database";

const BookingFulfillmentSchema = z.object({
  bookingId: z.string().min(1).max(200),
  driverDetails: z.object({
    name: z.string().max(200).optional(),
    phone: z.string().max(100).optional(),
    vehicle: z.string().max(200).optional(),
    color: z.string().max(100).optional(),
    licensePlate: z.string().max(100).optional(),
    whatsapp: z.string().max(100).optional(),
  }).optional(),
  paymentMethod: z.string().max(200).optional(),
  receiptRequest: z.object({
    needed: z.boolean(),
    receiptName: z.string().max(200).optional(),
    amount: z.number().nonnegative().optional(),
    currency: z.string().max(20).optional(),
  }).optional(),
  sendConfirmation: z.boolean().optional(),
});

export async function POST(request: Request) {
  const companyId = await getCurrentCompanyId();
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BookingFulfillmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid booking update" }, { status: 400 });
  }

  try {
    if (parsed.data.sendConfirmation) {
      await recordBookingConfirmationSent({ bookingId: parsed.data.bookingId, companyId });
    } else {
      await updateBookingFulfillment({
        bookingId: parsed.data.bookingId,
        companyId,
        driverDetails: parsed.data.driverDetails,
        paymentMethod: parsed.data.paymentMethod,
        receiptRequest: parsed.data.receiptRequest,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
