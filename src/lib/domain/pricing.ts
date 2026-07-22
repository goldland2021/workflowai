import type {
  BusinessConfiguration,
  PricingAirportRule,
  PricingCityRoute,
  PricingPolicy,
  PricingSnapshot,
  PricingSource,
  TripDetails,
  Vehicle,
} from "./types";

const DEFAULT_VEHICLES: Vehicle[] = [
  {
    id: "vehicle_alphard",
    name: "Toyota Alphard",
    type: "Alphard",
    capacity: { passengers: 6, luggage: 6 },
  },
  {
    id: "vehicle_hiace",
    name: "Toyota HiAce",
    type: "HiAce",
    capacity: { passengers: 8, luggage: 12 },
  },
];

export const DEFAULT_PRICING_POLICY: PricingPolicy = {
  engineVersion: "workflowai-pricing-v2",
  currency: "JPY",
  cityRateYenPerKm: 200,
  cityTransferMinimumYen: 18000,
  priceBufferYen: 2000,
  hiaceSurchargeYen: 5000,
  standardTollAllowanceYen: 3000,
  autoQuoteEnabled: true,
  autoQuoteMinConfidence: 90,
  airports: {
    haneda: {
      aliases: ["haneda", "hnd", "羽田"],
      baseYen: 6500,
      minimumYen: 10000,
      standardTollYen: 1500,
    },
    narita: {
      aliases: ["narita", "nrt", "成田"],
      baseYen: 6500,
      minimumYen: 20000,
      standardTollYen: 3000,
    },
    yokohamaPort: {
      aliases: ["yokohamaport", "yokohamaport", "横浜港", "大さん橋", "osambashi"],
      baseYen: 8500,
      minimumYen: 18000,
      standardTollYen: 1800,
    },
    kansai: {
      aliases: ["kansai", "kix", "関西", "関西空港"],
      baseYen: 8000,
      minimumYen: 16000,
      standardTollYen: 2200,
    },
    itami: {
      aliases: ["itami", "itm", "伊丹", "大阪空港"],
      baseYen: 7000,
      minimumYen: 10000,
      standardTollYen: 1500,
    },
  },
  fixedRoutes: [
    {
      id: "fuji",
      label: "Fuji area fixed route",
      keywords: ["fuji", "富士", "河口湖", "kawaguchiko", "山中湖", "yamanakako", "gotemba", "御殿場"],
      pricesByAirport: { haneda: 45000, narita: 59000, yokohamaPort: 53000 },
    },
    {
      id: "hakone",
      label: "Hakone area fixed route",
      keywords: ["hakone", "箱根", "gora", "強羅", "仙石原", "ashinoko", "芦ノ湖"],
      pricesByAirport: { haneda: 40000, narita: 60000, yokohamaPort: 45000 },
    },
  ],
  cityRoutes: [
    {
      id: "kyoto-usj",
      label: "Kyoto to Universal Studios Japan",
      pickupKeywords: ["ritz-carlton kyoto", "kyoto"],
      dropoffKeywords: ["universal studios japan", "usj"],
      oneWayYen: 22000,
      roundTripYen: 40000,
    },
    {
      id: "tokinoyu-hyatt-regency-tokyo",
      label: "Tokinoyu Setsugetsuka to Hyatt Regency Tokyo",
      pickupKeywords: ["tokinoyu", "setsugetsuka", "kyoritsu resort"],
      dropoffKeywords: ["hyatt regency tokyo"],
      oneWayYen: 40000,
    },
  ],
  charter: {
    standardHours: 10,
    standardDistanceKm: 300,
    alphardBaseYen: 60000,
    hiaceBaseYen: 66000,
    fujiAlphardBaseYen: 70000,
    fujiHiaceBaseYen: 75000,
    fujiKeywords: ["fuji", "mount fuji", "kawaguchiko", "gotemba", "yamanakako"],
  },
  interAirportFares: {
    "haneda:narita": 25000,
    "narita:haneda": 25000,
    "haneda:yokohamaPort": 18000,
    "yokohamaPort:haneda": 18000,
    "narita:yokohamaPort": 37000,
    "yokohamaPort:narita": 37000,
  },
};

export interface WorkflowQuoteResult {
  priceYen: number;
  vehicleType: string;
  reason: string;
  pricing: PricingSnapshot;
}

function normalize(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[\s\-_,.()]/g, "");
}

function roundTo1000(amount: number): number {
  return Math.round(amount / 1000) * 1000;
}

function resolvePolicy(configuration: BusinessConfiguration): PricingPolicy {
  if (!configuration.pricingPolicy) return DEFAULT_PRICING_POLICY;
  return {
    ...DEFAULT_PRICING_POLICY,
    ...configuration.pricingPolicy,
    airports: configuration.pricingPolicy.airports ?? DEFAULT_PRICING_POLICY.airports,
    fixedRoutes: configuration.pricingPolicy.fixedRoutes ?? DEFAULT_PRICING_POLICY.fixedRoutes,
    cityRoutes: configuration.pricingPolicy.cityRoutes ?? DEFAULT_PRICING_POLICY.cityRoutes,
    charter: configuration.pricingPolicy.charter ?? DEFAULT_PRICING_POLICY.charter,
    interAirportFares: configuration.pricingPolicy.interAirportFares ?? DEFAULT_PRICING_POLICY.interAirportFares,
  };
}

function findAirportId(value: string | undefined, policy: PricingPolicy): string | undefined {
  const normalized = normalize(value);
  if (!normalized) return undefined;

  return Object.entries(policy.airports).find(([, airport]) =>
    airport.aliases.some((alias) => normalized.includes(normalize(alias))),
  )?.[0];
}

function airportRule(policy: PricingPolicy, airportId: string): PricingAirportRule | undefined {
  return policy.airports[airportId];
}

function resolveAirportContext(trip: TripDetails, policy: PricingPolicy): {
  airportId: string;
  direction: "pickup" | "dropoff";
  targetText: string;
} | undefined {
  const pickup = trip.pickupLocation ?? "";
  const dropoff = trip.dropoffLocation ?? "";
  const pickupAirport = findAirportId(pickup, policy);
  const dropoffAirport = findAirportId(dropoff, policy);
  const configuredAirport = findAirportId(trip.airport, policy);

  if (trip.serviceType === "airport_dropoff" || dropoffAirport) {
    const airportId = dropoffAirport ?? configuredAirport;
    if (airportId) return { airportId, direction: "dropoff", targetText: pickup };
  }

  if (trip.serviceType === "airport_pickup" || pickupAirport) {
    const airportId = pickupAirport ?? configuredAirport;
    if (airportId) return { airportId, direction: "pickup", targetText: dropoff };
  }

  if (configuredAirport) {
    const direction = trip.serviceType === "airport_dropoff" ? "dropoff" : "pickup";
    return {
      airportId: configuredAirport,
      direction,
      targetText: direction === "pickup" ? dropoff : pickup,
    };
  }

  return undefined;
}

function findTargetAirportId(targetText: string, policy: PricingPolicy): string | undefined {
  return findAirportId(targetText, policy);
}

function findCityRoute(trip: TripDetails, policy: PricingPolicy): PricingCityRoute | undefined {
  const pickup = normalize(trip.pickupLocation);
  const dropoff = normalize(trip.dropoffLocation);
  if (!pickup || !dropoff) return undefined;

  return (policy.cityRoutes ?? []).find((route) =>
    route.pickupKeywords.some((keyword) => pickup.includes(normalize(keyword))) &&
    route.dropoffKeywords.some((keyword) => dropoff.includes(normalize(keyword))),
  );
}

function chooseVehicle(trip: TripDetails, configuration: BusinessConfiguration): {
  vehicle: Vehicle;
  count: number;
  capacityExceeded: boolean;
} {
  const vehicles = configuration.vehicles?.length ? configuration.vehicles : DEFAULT_VEHICLES;
  const passengerCount = trip.passengerCount ?? 0;
  const checkedLuggageCount = trip.luggageBreakdown
    ? (trip.luggageBreakdown.large ?? 0) +
      (trip.luggageBreakdown.medium ?? 0) +
      (trip.luggageBreakdown.small ?? 0)
    : 0;
  const luggageCount = trip.luggageBreakdown
    ? checkedLuggageCount || trip.luggageBreakdown.total
    : trip.luggageCount ?? 0;
  const preference = normalize(trip.vehiclePreference);
  const requestedHiace = /hiace|海狮|海獅|van|大型|面包|麵包/.test(preference);
  const requestedAlphard = /alphard|阿尔法|阿爾法|アルファード/.test(preference);
  const alphard = vehicles.find((vehicle) => /alphard|阿尔法|阿爾法|アルファード/i.test(`${vehicle.type}${vehicle.name}`));
  const hiace = vehicles.find((vehicle) => /hiace|海狮|海獅|van/i.test(`${vehicle.type}${vehicle.name}`));
  const preferred = requestedHiace ? hiace : requestedAlphard ? alphard : undefined;
  const sorted = [...vehicles].sort((a, b) => a.capacity.passengers - b.capacity.passengers);
  const luggageCapacity = (vehicle: Vehicle): number =>
    /alphard/i.test(`${vehicle.type}${vehicle.name}`) && passengerCount > 3
      ? Math.min(vehicle.capacity.luggage, 4)
      : vehicle.capacity.luggage;
  const fitting = sorted.find((vehicle) =>
    vehicle.capacity.passengers >= passengerCount && luggageCapacity(vehicle) >= luggageCount,
  );
  const vehicle = preferred ?? fitting ?? hiace ?? sorted[sorted.length - 1] ?? DEFAULT_VEHICLES[0];
  const count = Math.max(
    1,
    Math.ceil(passengerCount / Math.max(vehicle.capacity.passengers, 1)),
    Math.ceil(luggageCount / Math.max(luggageCapacity(vehicle), 1)),
  );
  const effectiveLuggageCapacity = luggageCapacity(vehicle);

  return {
    vehicle,
    count,
    capacityExceeded: passengerCount > vehicle.capacity.passengers * count || luggageCount > effectiveLuggageCapacity * count,
  };
}

function specialPricingRequest(trip: TripDetails): boolean {
  const text = `${trip.serviceType ?? ""} ${(trip.specialRequests ?? []).join(" ")}`.toLowerCase();
  if (/[\u6298\u6263\u4fbf\u5b9c\u7279\u4ef7\u5f80\u8fd4\u591a\u6bb5\u5305\u8f66\u5305\u8eca\u52a0\u7ad9]/u.test(text)) return true;
  return /discount|cheaper|special price|round trip|return|multi|itinerary|day tour|hourly|extra stop|折扣|便宜|特价|往返|多段|包车|加站/.test(text) ||
    /\b(today|tonight|same[- ]day|asap|urgent)\b/.test(text);
}

function confidenceBand(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 90) return "high";
  if (confidence >= 70) return "medium";
  return "low";
}

function approvalReason(params: {
  policy: PricingPolicy;
  confidence: number;
  routeDistanceKnown: boolean;
  vehicleCount: number;
  capacityExceeded: boolean;
  specialRequest: boolean;
  source: PricingSource;
}): string | undefined {
  if (!params.policy.autoQuoteEnabled) return "Automatic policy quotes are disabled.";
  if (params.capacityExceeded) return "Vehicle capacity is not sufficient for the requested passengers or luggage.";
  if (params.vehicleCount > 1) return "Multiple vehicles require owner confirmation.";
  if (params.specialRequest) return "A special route, discount, or urgent request requires owner review.";
  if (!params.routeDistanceKnown && params.source === "distance_formula") return "Route distance is missing.";
  if (params.confidence < params.policy.autoQuoteMinConfidence) return "Pricing confidence is below the automatic quote threshold.";
  return undefined;
}

export function calculateWorkflowQuote(
  trip: TripDetails,
  configuration: BusinessConfiguration,
): WorkflowQuoteResult | undefined {
  if (trip.serviceType === "day_tour" || trip.serviceType === "hourly_charter" || trip.serviceType === "multi_leg_itinerary") {
    return calculateCharterQuote(trip, configuration);
  }
  if (trip.serviceType === "city_transfer" || trip.serviceType === "round_trip") {
    return calculateCityTransferQuote(trip, configuration);
  }
  if (trip.serviceType !== "airport_pickup" && trip.serviceType !== "airport_dropoff") return undefined;

  const policy = resolvePolicy(configuration);
  const context = resolveAirportContext(trip, policy);
  if (!context) return undefined;
  const airport = airportRule(policy, context.airportId);
  if (!airport) return undefined;

  const { vehicle, count, capacityExceeded } = chooseVehicle(trip, configuration);
  const targetText = context.targetText;
  const targetAirportId = findTargetAirportId(targetText, policy);
  const normalizedTarget = normalize(targetText);
  const tollYen = trip.tollYen;
  let source: PricingSource = "distance_formula";
  let matchedRuleId: string | undefined;
  let unitBasePrice: number;
  let confidence = 90;

  const interAirportFare = targetAirportId && targetAirportId !== context.airportId
    ? policy.interAirportFares[`${context.airportId}:${targetAirportId}`]
    : undefined;
  if (interAirportFare) {
    source = "fixed_route";
    matchedRuleId = `${context.airportId}-${targetAirportId}`;
    unitBasePrice = interAirportFare;
    confidence = 97;
  } else {
    const fixedRoute = policy.fixedRoutes.find((route) =>
      route.keywords.some((keyword) => normalizedTarget.includes(normalize(keyword))),
    );
    if (fixedRoute && fixedRoute.pricesByAirport[context.airportId]) {
      source = "fixed_route";
      matchedRuleId = fixedRoute.id;
      unitBasePrice = fixedRoute.pricesByAirport[context.airportId];
      confidence = 96;
    } else if (typeof trip.routeDistanceKm === "number" && trip.routeDistanceKm > 0) {
      const tollAdjustment = trip.routeDistanceKm > 0 && tollYen
        ? tollYen - airport.standardTollYen
        : 0;
      unitBasePrice = roundTo1000(Math.max(
        airport.minimumYen,
        airport.baseYen + trip.routeDistanceKm * policy.cityRateYenPerKm + tollAdjustment,
      ));
      if (trip.routeDistanceKm > 150) confidence = 82;
    } else {
      unitBasePrice = airport.minimumYen;
      confidence = 55;
    }
  }

  const vehicleSurcharge = /hiace|海狮|海獅|van/i.test(`${vehicle.type}${vehicle.name}`)
    ? policy.hiaceSurchargeYen
    : 0;
  const unitPriceYen = unitBasePrice + vehicleSurcharge;
  const totalPriceYen = unitPriceYen * count;
  const routeDistanceKnown = typeof trip.routeDistanceKm === "number" && trip.routeDistanceKm > 0;
  const specialRequest = specialPricingRequest(trip);
  const reason = approvalReason({
    policy,
    confidence,
    routeDistanceKnown,
    vehicleCount: count,
    capacityExceeded,
    specialRequest,
    source,
  });
  const pricing: PricingSnapshot = {
    engineVersion: policy.engineVersion,
    source,
    confidence,
    confidenceBand: confidenceBand(confidence),
    approvalRequired: Boolean(reason),
    approvalReason: reason,
    airportId: context.airportId,
    direction: context.direction,
    routeDistanceKm: trip.routeDistanceKm,
    tollYen,
    waitingMinutes: context.direction === "pickup" ? 90 : 30,
    matchedRuleId,
    vehicleType: vehicle.name,
    vehicleCount: count,
    unitPriceYen,
    totalPriceYen,
    priceLowYen: totalPriceYen,
    priceHighYen: totalPriceYen + policy.priceBufferYen * count,
  };

  return {
    priceYen: totalPriceYen,
    vehicleType: count > 1 ? `${count} × ${vehicle.name}` : vehicle.name,
    reason: [
      `WorkflowAI pricing ${policy.engineVersion}`,
      source === "fixed_route" ? `matched ${matchedRuleId}` : "distance-based airport rule",
      `${vehicle.name}${count > 1 ? ` × ${count}` : ""}`,
      reason ? `owner review: ${reason}` : "eligible for standard policy quote",
    ].join("; "),
    pricing,
  };
}

function calculateCharterQuote(
  trip: TripDetails,
  configuration: BusinessConfiguration,
): WorkflowQuoteResult | undefined {
  const policy = resolvePolicy(configuration);
  const charter = policy.charter ?? DEFAULT_PRICING_POLICY.charter!;
  const { vehicle, count, capacityExceeded } = chooseVehicle(trip, configuration);
  const routeText = [
    trip.pickupLocation,
    trip.dropoffLocation,
    ...(trip.routeStops ?? []),
    ...(trip.specialRequests ?? []),
  ].filter(Boolean).join(" ");
  const isFujiRoute = charter.fujiKeywords.some((keyword) => normalize(routeText).includes(normalize(keyword)));
  const isHiace = /hiace|娴风嫯|娴风崊|van/i.test(`${vehicle.type}${vehicle.name}`);
  const unitBasePrice = isFujiRoute
    ? (isHiace ? charter.fujiHiaceBaseYen : charter.fujiAlphardBaseYen)
    : (isHiace ? charter.hiaceBaseYen : charter.alphardBaseYen);
  const hotelAdjustment = trip.hotelCharterAdjustmentYen ?? 0;
  const unitPriceYen = roundTo1000(unitBasePrice + hotelAdjustment);
  const totalPriceYen = unitPriceYen * count;
  const hoursKnown = typeof trip.charterHours === "number" && trip.charterHours > 0;
  const routeDistanceKnown = typeof trip.routeDistanceKm === "number" && trip.routeDistanceKm > 0;
  const exceedsStandardHours = hoursKnown && trip.charterHours! > charter.standardHours;
  const exceedsStandardDistance = routeDistanceKnown && trip.routeDistanceKm! > charter.standardDistanceKm;
  const confidence = exceedsStandardHours || exceedsStandardDistance ? 78 : isFujiRoute ? 95 : 94;
  const approvalReasonText = capacityExceeded
    ? "Vehicle capacity is not sufficient for the requested passengers or luggage."
    : count > 1
      ? "Multiple vehicles require owner confirmation."
      : exceedsStandardHours
        ? `Charter time exceeds the standard ${charter.standardHours} hours.`
        : exceedsStandardDistance
          ? `Route distance exceeds the standard ${charter.standardDistanceKm} km.`
          : confidence < policy.autoQuoteMinConfidence
            ? "Pricing confidence is below the automatic quote threshold."
            : undefined;
  const matchedRuleId = isFujiRoute
    ? (isHiace ? "charter-fuji-hiace" : "charter-fuji-alphard")
    : (isHiace ? "charter-standard-hiace" : "charter-standard-alphard");
  const pricing: PricingSnapshot = {
    engineVersion: policy.engineVersion,
    source: "charter_rule",
    confidence,
    confidenceBand: confidenceBand(confidence),
    approvalRequired: Boolean(approvalReasonText),
    approvalReason: approvalReasonText,
    routeDistanceKm: trip.routeDistanceKm,
    tollYen: trip.tollYen,
    waitingMinutes: 0,
    matchedRuleId,
    vehicleType: vehicle.name,
    vehicleCount: count,
    unitPriceYen,
    totalPriceYen,
    priceLowYen: totalPriceYen,
    priceHighYen: totalPriceYen + policy.priceBufferYen * count,
  };

  return {
    priceYen: totalPriceYen,
    vehicleType: count > 1 ? `${count} × ${vehicle.name}` : vehicle.name,
    reason: [
      `Charter rule: ${charter.standardHours} hours / ${charter.standardDistanceKm} km standard`,
      isFujiRoute ? "Fuji-area route" : "standard charter route",
      `${vehicle.name}${count > 1 ? ` × ${count}` : ""}`,
      hotelAdjustment > 0 ? `hotel reference adjustment +JPY ${hotelAdjustment.toLocaleString()}` : undefined,
      approvalReasonText ? `owner review: ${approvalReasonText}` : "eligible for standard policy quote",
    ].filter(Boolean).join("; "),
    pricing,
  };
}

function calculateCityTransferQuote(
  trip: TripDetails,
  configuration: BusinessConfiguration,
): WorkflowQuoteResult | undefined {
  const policy = resolvePolicy(configuration);
  const { vehicle, count, capacityExceeded } = chooseVehicle(trip, configuration);
  const cityRoute = findCityRoute(trip, policy);
  const routeDistanceKnown = typeof trip.routeDistanceKm === "number" && trip.routeDistanceKm > 0;
  const specialRequest = specialPricingRequest(trip);
  const routePrice = trip.serviceType === "round_trip" && cityRoute?.roundTripYen
    ? cityRoute.roundTripYen
    : cityRoute?.oneWayYen;
  const source: PricingSource = cityRoute ? "fixed_route" : routeDistanceKnown ? "distance_formula" : "business_rule";
  const confidence = cityRoute ? 96 : routeDistanceKnown ? 84 : 55;
  const unitBasePrice = routePrice ?? roundTo1000(Math.max(
    policy.cityTransferMinimumYen ?? 18000,
    (trip.routeDistanceKm ?? 0) * policy.cityRateYenPerKm,
  ));
  const vehicleSurcharge = !cityRoute && /hiace|海狮|海獅|van/i.test(`${vehicle.type}${vehicle.name}`)
    ? policy.hiaceSurchargeYen
    : 0;
  const unitPriceYen = unitBasePrice + vehicleSurcharge;
  const totalPriceYen = unitPriceYen * count;
  const reason = approvalReason({
    policy,
    confidence,
    routeDistanceKnown,
    vehicleCount: count,
    capacityExceeded,
    specialRequest,
    source,
  });
  const pricing: PricingSnapshot = {
    engineVersion: policy.engineVersion,
    source,
    confidence,
    confidenceBand: confidenceBand(confidence),
    approvalRequired: Boolean(reason),
    approvalReason: reason,
    routeDistanceKm: trip.routeDistanceKm,
    tollYen: trip.tollYen,
    waitingMinutes: 30,
    matchedRuleId: cityRoute?.id,
    vehicleType: vehicle.name,
    vehicleCount: count,
    unitPriceYen,
    totalPriceYen,
    priceLowYen: totalPriceYen,
    priceHighYen: totalPriceYen + policy.priceBufferYen * count,
  };

  return {
    priceYen: totalPriceYen,
    vehicleType: count > 1 ? `${count} × ${vehicle.name}` : vehicle.name,
    reason: [
      `WorkflowAI pricing ${policy.engineVersion}`,
      cityRoute ? `matched ${cityRoute.id}` : routeDistanceKnown ? "distance-based city rule" : "city transfer minimum",
      `${vehicle.name}${count > 1 ? ` × ${count}` : ""}`,
      reason ? `owner review: ${reason}` : "eligible for standard policy quote",
    ].join("; "),
    pricing,
  };
}
