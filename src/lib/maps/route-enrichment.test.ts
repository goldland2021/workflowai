import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearGoogleRouteCache,
  enrichTripDetailsWithGoogleMaps,
} from "./route-enrichment";

describe("Google route enrichment", () => {
  afterEach(() => {
    clearGoogleRouteCache();
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
  });

  it("adds distance, duration, and a Tokyo toll estimate for an airport pickup", async () => {
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-server-key";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("geocode")) {
        return new Response(JSON.stringify({
          status: "OK",
          results: [{
            formatted_address: "The Ritz-Carlton Tokyo",
            geometry: { location: { lat: 35.6605, lng: 139.7292 } },
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        routes: [{ distanceMeters: 72000, duration: "5100s" }],
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const trip = await enrichTripDetailsWithGoogleMaps({
      serviceType: "airport_pickup",
      pickupLocation: "Narita Airport",
      dropoffLocation: "The Ritz-Carlton Tokyo",
      passengerCount: 2,
    });

    expect(trip.routeDistanceKm).toBe(72);
    expect(trip.estimatedDriveTimeMinutes).toBe(85);
    expect(trip.tollYen).toBe(3000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the route cache and does not call Google twice for the same route", async () => {
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-server-key";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("geocode")) {
        return new Response(JSON.stringify({
          status: "OK",
          results: [{ geometry: { location: { lat: 35.6896, lng: 139.7006 } } }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        routes: [{ distanceMeters: 75000, duration: "5400s" }],
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = {
      serviceType: "airport_pickup" as const,
      pickupLocation: "NRT",
      dropoffLocation: "Shinjuku hotel",
      passengerCount: 2,
    };
    await enrichTripDetailsWithGoogleMaps(request);
    await enrichTripDetailsWithGoogleMaps(request);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails open when the server key is not configured", async () => {
    const trip = {
      serviceType: "airport_pickup" as const,
      pickupLocation: "Narita Airport",
      dropoffLocation: "The Ritz-Carlton Tokyo",
      passengerCount: 2,
    };

    await expect(enrichTripDetailsWithGoogleMaps(trip)).resolves.toEqual(trip);
  });
});
