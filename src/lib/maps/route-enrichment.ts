import "server-only";

import { createHash } from "node:crypto";
import type { TripDetails } from "@/lib/domain/types";

interface LatLng {
  lat: number;
  lng: number;
}

interface AirportPoint {
  id: string;
  aliases: string[];
  point: LatLng;
}

interface TollZone {
  center: LatLng;
  radiusKm: number;
  tollByAirport: Record<string, number>;
}

interface GeocodedPoint {
  point: LatLng;
  formattedAddress: string;
}

type RouteEnrichment = Pick<TripDetails, "routeDistanceKm" | "estimatedDriveTimeMinutes" | "tollYen">;

interface CachedRoute {
  expiresAt: number;
  enrichment: RouteEnrichment | null;
}

const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const ROUTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILED_ROUTE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ROUTE_CACHE_ENTRIES = 500;

const AIRPORT_POINTS: AirportPoint[] = [
  { id: "narita", aliases: ["narita", "nrt", "成田", "成田空港"], point: { lat: 35.7647, lng: 140.3864 } },
  { id: "haneda", aliases: ["haneda", "hnd", "羽田", "羽田空港"], point: { lat: 35.5494, lng: 139.7798 } },
  { id: "yokohamaPort", aliases: ["yokohama port", "横浜港", "横滨港", "yokohama international passenger"], point: { lat: 35.4513, lng: 139.6473 } },
  { id: "kansai", aliases: ["kansai", "kix", "関西", "关西"], point: { lat: 34.4347, lng: 135.2441 } },
  { id: "itami", aliases: ["itami", "itm", "伊丹"], point: { lat: 34.7855, lng: 135.4382 } },
  { id: "newChitose", aliases: ["new chitose", "cts", "新千岁", "新千歳"], point: { lat: 42.7752, lng: 141.6923 } },
  { id: "fukuoka", aliases: ["fukuoka", "fuk", "福冈", "福岡"], point: { lat: 33.5859, lng: 130.4506 } },
  { id: "naha", aliases: ["naha", "oka", "那霸", "那覇"], point: { lat: 26.1958, lng: 127.6459 } },
];

const TOKYO_TOLL_ZONES: TollZone[] = [
  { center: { lat: 35.6896, lng: 139.7006 }, radiusKm: 3, tollByAirport: { narita: 3100, haneda: 1500 } },
  { center: { lat: 35.658, lng: 139.7016 }, radiusKm: 3, tollByAirport: { narita: 3100, haneda: 1500 } },
  { center: { lat: 35.6717, lng: 139.7652 }, radiusKm: 3, tollByAirport: { narita: 2800, haneda: 1300 } },
  { center: { lat: 35.6812, lng: 139.7671 }, radiusKm: 2, tollByAirport: { narita: 2800, haneda: 1300 } },
  { center: { lat: 35.6605, lng: 139.7292 }, radiusKm: 3, tollByAirport: { narita: 3000, haneda: 1400 } },
  { center: { lat: 35.7148, lng: 139.7967 }, radiusKm: 3, tollByAirport: { narita: 2700, haneda: 1400 } },
  { center: { lat: 35.7142, lng: 139.7737 }, radiusKm: 2, tollByAirport: { narita: 2700, haneda: 1400 } },
  { center: { lat: 35.7292, lng: 139.71 }, radiusKm: 3, tollByAirport: { narita: 3100, haneda: 1600 } },
  { center: { lat: 35.609, lng: 139.73 }, radiusKm: 3, tollByAirport: { narita: 2800, haneda: 1000 } },
  { center: { lat: 35.6313, lng: 139.7756 }, radiusKm: 3, tollByAirport: { narita: 3000, haneda: 1200 } },
  { center: { lat: 35.4437, lng: 139.638 }, radiusKm: 5, tollByAirport: { narita: 4500, haneda: 1800 } },
  { center: { lat: 35.6073, lng: 140.1063 }, radiusKm: 5, tollByAirport: { narita: 2000, haneda: 2500 } },
];

const routeCache = new Map<string, CachedRoute>();

function normalizeAddress(value: string): string {
  return value.toLowerCase().replace(/[\s,._-]+/g, "");
}

function haversineDistance(a: LatLng, b: LatLng): number {
  const radius = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const value = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function findAirport(trip: TripDetails): AirportPoint | undefined {
  const searchText = normalizeAddress(`${trip.airport ?? ""} ${trip.pickupLocation ?? ""} ${trip.dropoffLocation ?? ""}`);
  return AIRPORT_POINTS.find((airport) => airport.aliases.some((alias) => searchText.includes(normalizeAddress(alias))));
}

function findTollYen(airportId: string, cityPoint: LatLng): number | undefined {
  let nearest: { distanceKm: number; tollYen: number } | undefined;
  for (const zone of TOKYO_TOLL_ZONES) {
    const distanceKm = haversineDistance(cityPoint, zone.center);
    const tollYen = zone.tollByAirport[airportId];
    if (tollYen === undefined || distanceKm > zone.radiusKm) continue;
    if (!nearest || distanceKm < nearest.distanceKm) nearest = { distanceKm, tollYen };
  }
  return nearest?.tollYen;
}

function routeCacheKey(trip: TripDetails, airport: AirportPoint): string {
  const routeIdentity = [
    trip.serviceType,
    airport.id,
    normalizeAddress(trip.pickupLocation ?? ""),
    normalizeAddress(trip.dropoffLocation ?? ""),
  ].join("|");
  return createHash("sha256").update(routeIdentity).digest("hex");
}

function getCachedRoute(key: string): RouteEnrichment | null | undefined {
  const cached = routeCache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    routeCache.delete(key);
    return undefined;
  }
  return cached.enrichment;
}

function setCachedRoute(key: string, enrichment: RouteEnrichment | null, failed = false): void {
  if (routeCache.size >= MAX_ROUTE_CACHE_ENTRIES) {
    const firstKey = routeCache.keys().next().value;
    if (firstKey) routeCache.delete(firstKey);
  }
  routeCache.set(key, {
    expiresAt: Date.now() + (failed ? FAILED_ROUTE_CACHE_TTL_MS : ROUTE_CACHE_TTL_MS),
    enrichment,
  });
}

async function geocodeAddress(address: string, apiKey: string): Promise<GeocodedPoint | null> {
  const params = new URLSearchParams({ address, key: apiKey, language: "en", region: "jp" });
  const response = await fetch(`${GOOGLE_GEOCODING_URL}?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) return null;
  const payload = await response.json() as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };
  const location = payload.results?.[0]?.geometry?.location;
  if (payload.status !== "OK" || typeof location?.lat !== "number" || typeof location.lng !== "number") return null;
  return {
    point: { lat: location.lat, lng: location.lng },
    formattedAddress: payload.results?.[0]?.formatted_address ?? address,
  };
}

async function getDrivingRoute(origin: LatLng, destination: LatLng, apiKey: string): Promise<{ distanceKm: number; durationMin: number } | null> {
  const response = await fetch(GOOGLE_ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      languageCode: "en-US",
      units: "METRIC",
    }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = await response.json() as {
    routes?: Array<{ distanceMeters?: number; duration?: string }>;
  };
  const route = payload.routes?.[0];
  const durationSeconds = Number.parseInt(route?.duration?.replace(/s$/, "") ?? "", 10);
  if (!route || typeof route.distanceMeters !== "number" || !Number.isFinite(durationSeconds)) return null;
  return {
    distanceKm: Math.round(route.distanceMeters / 100) / 10,
    durationMin: Math.ceil(durationSeconds / 60),
  };
}

export function clearGoogleRouteCache(): void {
  routeCache.clear();
}

export async function enrichTripDetailsWithGoogleMaps(trip: TripDetails): Promise<TripDetails> {
  if (trip.routeDistanceKm && trip.routeDistanceKm > 0) return trip;
  if (trip.serviceType !== "airport_pickup" && trip.serviceType !== "airport_dropoff") return trip;
  if (!trip.pickupLocation || !trip.dropoffLocation) return trip;

  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  const airport = findAirport(trip);
  if (!apiKey || !airport) return trip;

  const cacheKey = routeCacheKey(trip, airport);
  const cached = getCachedRoute(cacheKey);
  if (cached !== undefined) return cached ? { ...trip, ...cached } : trip;

  try {
    const pickupIsAirport = trip.serviceType === "airport_pickup";
    const cityAddress = pickupIsAirport ? trip.dropoffLocation : trip.pickupLocation;
    const cityPoint = await geocodeAddress(cityAddress, apiKey);
    if (!cityPoint) {
      setCachedRoute(cacheKey, null, true);
      return trip;
    }

    const origin = pickupIsAirport ? airport.point : cityPoint.point;
    const destination = pickupIsAirport ? cityPoint.point : airport.point;
    const route = await getDrivingRoute(origin, destination, apiKey);
    if (!route) {
      setCachedRoute(cacheKey, null, true);
      return trip;
    }

    const enrichment: RouteEnrichment = {
      routeDistanceKm: route.distanceKm,
      estimatedDriveTimeMinutes: route.durationMin,
      tollYen: trip.tollYen ?? findTollYen(airport.id, cityPoint.point),
    };
    setCachedRoute(cacheKey, enrichment);
    return { ...trip, ...enrichment };
  } catch {
    setCachedRoute(cacheKey, null, true);
    return trip;
  }
}
