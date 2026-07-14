import { generateStructured } from './client';
import { TripDetailsSchema, DetectedEventSchema, QuoteSuggestionSchema, ContactSchema } from './schemas';
import { z } from 'zod';
import type { BusinessConfiguration, TripDetails, DetectedEvent, QuoteSuggestion, CapturedContact, TripFieldKey } from '../domain/types';
import { getMissingQuoteFields } from '../domain/booking-workflow';
import { buildExtractTripPrompt, buildDetectEventPrompt, buildContactPrompt, buildQuotePrompt, detectCustomerLang, detectLang } from './prompts/templates';

const tripFieldKeys = new Set<TripFieldKey>([
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

// Merge LLM output with existing trip details (LLM provides delta)
export async function extractTripDetailsWithAI(
  message: string,
  current: TripDetails,
  config: BusinessConfiguration
): Promise<TripDetails> {
  try {
    const lang = detectCustomerLang(message, config);
    const servicesJson = JSON.stringify(config.services.map(s => s.name));
    const vehiclesJson = JSON.stringify((config.vehicles || []).map(v => ({
      name: v.name,
      maxPassengers: v.capacity.passengers,
      maxLuggage: v.capacity.luggage,
      description: v.description,
    })));

    const { system, prompt, temperature } = buildExtractTripPrompt({
      lang,
      message,
      currentTripJson: JSON.stringify(current, null, 2),
      servicesJson,
      vehiclesJson,
    });

    const extracted = await generateStructured(
      TripDetailsSchema,
      prompt,
      system,
      temperature
    );

    // Merge: LLM output overrides only when present
    return {
      ...current,
      ...extracted,
      // Keep numbers as numbers
      passengerCount: extracted.passengerCount ?? current.passengerCount,
      luggageCount: extracted.luggageCount ?? current.luggageCount,
      specialRequests: [
        ...(current.specialRequests || []),
        ...(extracted.specialRequests || []),
      ].filter((v, i, arr) => arr.indexOf(v) === i), // dedupe
    };
  } catch {
    console.warn('LLM trip extraction failed, returning current details');
    return current;
  }
}

export async function detectEventsWithAI(
  message: string,
  config: BusinessConfiguration
): Promise<DetectedEvent[]> {
  try {
    const lang = detectCustomerLang(message, config);

    const { system, prompt, temperature } = buildDetectEventPrompt({
      lang,
      message,
      eventTypesJson: JSON.stringify(config.escalationRules.map(e => e.eventType)),
      escalationRulesJson: JSON.stringify(config.escalationRules.map(e => ({
        eventType: e.eventType,
        description: e.description,
        requiresOwnerApproval: e.requiresOwnerApproval,
      }))),
      companyName: config.companyProfile.name,
    });

    const events = await generateStructured(
      z.array(DetectedEventSchema),
      prompt,
      system,
      temperature
    );

    return events.map((ev, i) => ({
      id: `event_ai_${Date.now()}_${i}`,
      eventType: ev.eventType,
      summary: ev.summary,
      suggestedOwnerAction: ev.suggestedOwnerAction,
      severity: ev.severity,
      status: 'pending' as const,
    }));
  } catch {
    console.warn('LLM event detection failed');
    return [];
  }
}

export async function extractContactWithAI(message: string): Promise<CapturedContact | undefined> {
  try {
    const { system, prompt, temperature } = buildContactPrompt({ message });

    const contact = await generateStructured(
      ContactSchema.nullable(),
      prompt,
      system,
      temperature
    );
    return contact || undefined;
  } catch {
    return undefined;
  }
}

export async function suggestQuoteWithAI(
  tripDetails: TripDetails,
  config: BusinessConfiguration
): Promise<QuoteSuggestion | undefined> {
  const missing = getMissingQuoteFields(tripDetails);

  if (missing.length > 2) return undefined; // Still too many missing

  try {
    const lang = detectLang(config);
    const vehiclesInfo = (config.vehicles || []).map(v =>
      `${v.name}（最大${v.capacity.passengers}人，${v.capacity.luggage}件行李）：${v.description || ''}`
    ).join('\n');

    const { system, prompt, temperature } = buildQuotePrompt({
      lang,
      tripDetailsJson: JSON.stringify(tripDetails),
      pricingRulesJson: JSON.stringify(config.pricingRules),
      vehiclesInfo: vehiclesInfo || '丰田阿尔法、丰田海狮',
    });

    const suggestion = await generateStructured(
      QuoteSuggestionSchema,
      prompt,
      system,
      temperature
    );

    return {
      id: `quote_ai_${Date.now()}`,
      serviceType: tripDetails.serviceType,
      suggestedPrice: suggestion.suggestedPrice,
      currency: suggestion.currency,
      vehicleType: suggestion.vehicleType,
      reason: suggestion.reason,
      confidence: suggestion.confidence <= 1 ? Math.round(suggestion.confidence * 100) : suggestion.confidence,
      missingFields: suggestion.missingFields.filter((field): field is TripFieldKey =>
        tripFieldKeys.has(field as TripFieldKey),
      ),
      includedFees: ['Tolls', 'Parking fees', 'Taxes'],
    };
  } catch {
    console.warn('LLM quote suggestion failed');
    return undefined;
  }
}
