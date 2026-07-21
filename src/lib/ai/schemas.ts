import { z } from 'zod';

function numberFromModelText(schema: z.ZodNumber, fallback?: number) {
  return z.preprocess((value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : fallback ?? value;
    }
    return value;
  }, schema);
}

export const TripDetailsSchema = z.object({
  serviceType: z.enum([
    'airport_pickup',
    'airport_dropoff',
    'city_transfer',
    'round_trip',
    'day_tour',
    'hourly_charter',
    'multi_leg_itinerary',
  ]).optional(),
  pickupLocation: z.string().optional(),
  dropoffLocation: z.string().optional(),
  airport: z.string().optional(),
  terminal: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  flightNumber: z.string().optional(),
  flightTime: z.string().optional(),
  passengerCount: numberFromModelText(z.number()).optional(),
  luggageCount: numberFromModelText(z.number()).optional(),
  luggageBreakdown: z.object({
    large: numberFromModelText(z.number().nonnegative()).optional(),
    medium: numberFromModelText(z.number().nonnegative()).optional(),
    small: numberFromModelText(z.number().nonnegative()).optional(),
    carryOn: numberFromModelText(z.number().nonnegative()).optional(),
    backpack: numberFromModelText(z.number().nonnegative()).optional(),
    total: numberFromModelText(z.number().nonnegative()),
  }).optional(),
  vehiclePreference: z.string().optional(),
  returnPickupLocation: z.string().optional(),
  returnDropoffLocation: z.string().optional(),
  returnTime: z.string().optional(),
  tollYen: numberFromModelText(z.number().nonnegative()).optional(),
  specialRequests: z.union([z.array(z.string()), z.string().transform((value) => [value])]).optional(),
  flightArrival: z.object({
    flightNumber: z.string(),
    airportCode: z.string(),
    airportName: z.string(),
    terminal: z.string().optional(),
    arrivalLobby: z.string().optional(),
    scheduledArrival: z.string().optional(),
    estimatedArrival: z.string().optional(),
    actualArrival: z.string().optional(),
    status: z.string().optional(),
    source: z.string(),
    checkedAt: z.string(),
    confidence: z.enum(['confirmed', 'estimated', 'scheduled', 'partial']),
    flightId: z.string().optional(),
  }).optional(),
});

export const DetectedEventSchema = z.object({
  eventType: z.enum([
    'Discount Request',
    'Urgent Booking',
    'Route Change',
    'Flight Delay',
    'Complaint',
    'Cancellation Request',
    'Receipt Request',
    'Driver Assignment Needed',
    'Pickup Time Change',
    'Early Pickup Request',
    'Same Driver Request',
    'English-speaking Driver Request',
    'Multi-leg Itinerary Request',
    'Round Trip Discount',
    'Payment Coordination',
    'Driver Coordination Issue',
  ]),
  summary: z.string(),
  suggestedOwnerAction: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
});

export const QuoteSuggestionSchema = z.object({
  suggestedPrice: numberFromModelText(z.number()),
  currency: z.string().default('USD'),
  vehicleType: z.string().optional(),
  reason: z.string(),
  confidence: numberFromModelText(z.number().min(0).max(100), 75),
  missingFields: z.array(z.string()),
});

export const ContactSchema = z.object({
  method: z.enum(['WhatsApp', 'Telegram', 'Email']),
  value: z.string(),
});

export type ExtractedTripDetails = z.infer<typeof TripDetailsSchema>;
export type ExtractedEvent = z.infer<typeof DetectedEventSchema>;
export type ExtractedQuote = z.infer<typeof QuoteSuggestionSchema>;
export type ExtractedContact = z.infer<typeof ContactSchema>;
