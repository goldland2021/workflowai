import { afterEach, describe, expect, it, vi } from "vitest";
import { appendFlightArrivalToReply, lookupFlightArrival } from "./arrival";

const originalApiKey = process.env.FLIGHT_DATA_API_KEY;
const originalBaseUrl = process.env.FLIGHT_DATA_BASE_URL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalApiKey === undefined) delete process.env.FLIGHT_DATA_API_KEY;
  else process.env.FLIGHT_DATA_API_KEY = originalApiKey;
  if (originalBaseUrl === undefined) delete process.env.FLIGHT_DATA_BASE_URL;
  else process.env.FLIGHT_DATA_BASE_URL = originalBaseUrl;
});

describe("lookupFlightArrival", () => {
  it("requires an airport and date to identify the correct arrival", async () => {
    await expect(lookupFlightArrival({ flightNumber: "UA8011" })).resolves.toEqual({
      status: "needs_more_info",
      missing: "airport",
    });

    await expect(lookupFlightArrival({ flightNumber: "UA8011", airport: "NRT" })).resolves.toEqual({
      status: "needs_more_info",
      missing: "date",
    });
  });

  it("maps a provider flight record to the arrival terminal and lobby", async () => {
    process.env.FLIGHT_DATA_API_KEY = "test-key";
    process.env.FLIGHT_DATA_BASE_URL = "https://flight-provider.test/aeroapi";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      flights: [{
        ident: "UAL8011",
        ident_iata: "UA8011",
        ident_icao: "UAL8011",
        destination_iata: "NRT",
        destination_icao: "RJAA",
        scheduled_in: "2026-07-21T06:00:00Z",
        terminal_destination: "1",
        status: "S",
        fa_flight_id: "flightaware-ua8011",
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupFlightArrival({
      flightNumber: "UA 8011",
      airport: "Narita Airport",
      date: "July 21, 2026",
    });

    expect(result).toMatchObject({
      status: "found",
      details: {
        flightNumber: "UA8011",
        airportCode: "NRT",
        terminal: "Terminal 1",
        arrivalLobby: "International Arrivals Lobby, Terminal 1 (1F)",
        confidence: "scheduled",
        source: "FlightAware AeroAPI",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/flights/UAL8011?start="),
      expect.objectContaining({ headers: { "x-apikey": "test-key", Accept: "application/json" } }),
    );
  });

  it("does not claim a flight belongs to the requested airport", async () => {
    process.env.FLIGHT_DATA_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      flights: [{
        ident_iata: "UA8011",
        destination_iata: "HND",
        scheduled_in: "2026-07-21T06:00:00Z",
        terminal_destination: "3",
      }],
    }), { status: 200 })));

    await expect(lookupFlightArrival({
      flightNumber: "UA8011",
      airport: "NRT",
      date: "2026-07-21",
    })).resolves.toEqual({ status: "not_found", reason: "no_matching_flight" });
  });
});

describe("appendFlightArrivalToReply", () => {
  it("adds a concise customer-facing arrival instruction", () => {
    const reply = appendFlightArrivalToReply("Your booking is confirmed.", {
      flightNumber: "UA8011",
      airportCode: "NRT",
      airportName: "Narita International Airport",
      terminal: "Terminal 1",
      arrivalLobby: "International Arrivals Lobby, Terminal 1 (1F)",
      source: "FlightAware AeroAPI",
      checkedAt: "2026-07-21T00:00:00.000Z",
      confidence: "scheduled",
    }, "en");

    expect(reply).toContain("Terminal 1");
    expect(reply).toContain("After customs");
  });
});
