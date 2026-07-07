import { z } from "zod";

const numberFromInput = (schema: z.ZodNumber) =>
  z.preprocess((value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    }

    return value;
  }, schema);

export const ChannelSchema = z.enum([
  "website_widget",
  "whatsapp",
  "telegram",
  "email",
  "phone",
]);

export const MessageRoleSchema = z.enum(["customer", "ai", "owner", "system"]);

export const EventTypeSchema = z.enum([
  "Discount Request",
  "Urgent Booking",
  "Route Change",
  "Flight Delay",
  "Complaint",
  "Cancellation Request",
  "Receipt Request",
  "Driver Assignment Needed",
  "Pickup Time Change",
  "Early Pickup Request",
  "Same Driver Request",
  "English-speaking Driver Request",
  "Multi-leg Itinerary Request",
  "Round Trip Discount",
  "Payment Coordination",
  "Driver Coordination Issue",
]);

export const BossInboxStatusSchema = z.enum(["pending", "approved", "edited", "rejected"]);

export const BossInboxTypeSchema = z.enum([
  "quote_approval",
  "event_review",
  "driver_assignment",
  "receipt_request",
  "change_request",
  "payment_coordination",
]);

export const ContactMethodSchema = z.enum(["WhatsApp", "Telegram", "Email"]);

export const TripFieldKeySchema = z.enum([
  "serviceType",
  "pickupLocation",
  "dropoffLocation",
  "airport",
  "terminal",
  "date",
  "time",
  "flightNumber",
  "flightTime",
  "passengerCount",
  "luggageCount",
  "vehiclePreference",
]);

export const CompanyProfileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    industry: z.literal("airport_transfer"),
    serviceArea: z.string().min(1),
    languages: z.array(z.string().min(1)),
    paymentMethods: z.array(z.string().min(1)),
  })
  .strict();

export const ServiceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    active: z.boolean(),
  })
  .strict();

export const PricingRuleSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string(),
    basePrice: numberFromInput(z.number().nonnegative()),
    currency: z.string().min(1),
  })
  .strict();

export const EscalationRuleSchema = z
  .object({
    id: z.string().min(1),
    eventType: EventTypeSchema,
    description: z.string(),
    requiresOwnerApproval: z.boolean(),
  })
  .strict();

export const ContactCaptureRuleSchema = z
  .object({
    id: z.string().min(1),
    trigger: z.string().min(1),
    preferredMethods: z.array(ContactMethodSchema),
  })
  .strict();

export const RequiredBookingFieldSchema = z
  .object({
    key: TripFieldKeySchema,
    label: z.string().min(1),
    requiredForQuote: z.boolean(),
  })
  .strict();

export const FAQSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1),
    answer: z.string().min(1),
  })
  .strict();

export const VehicleSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.string().min(1),
    capacity: z
      .object({
        passengers: numberFromInput(z.number().int().nonnegative()),
        luggage: numberFromInput(z.number().int().nonnegative()),
      })
      .strict(),
    description: z.string().optional(),
  })
  .strict();

export const BusinessConfigurationSchema = z
  .object({
    companyProfile: CompanyProfileSchema,
    services: z.array(ServiceSchema),
    businessHours: z.string().min(1),
    pricingRules: z.array(PricingRuleSchema),
    escalationRules: z.array(EscalationRuleSchema),
    contactCaptureRules: z.array(ContactCaptureRuleSchema),
    requiredBookingFields: z.array(RequiredBookingFieldSchema),
    faq: z.array(FAQSchema),
    aiBehaviorBoundaries: z.array(z.string().min(1)),
    vehicles: z.array(VehicleSchema).optional(),
  })
  .strict();
