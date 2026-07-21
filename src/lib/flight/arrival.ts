import type { PromptLang } from "@/lib/ai/prompts/templates";
import type { FlightArrivalDetails } from "@/lib/domain/types";

export type { FlightArrivalDetails } from "@/lib/domain/types";

export type FlightArrivalConfidence = "confirmed" | "estimated" | "scheduled" | "partial";

export type FlightLookupResult =
  | { status: "found"; details: FlightArrivalDetails }
  | { status: "needs_more_info"; missing: "airport" | "date" }
  | { status: "not_found"; reason: "no_matching_flight" | "unsupported_airport" }
  | { status: "unavailable"; reason: "not_configured" | "provider_error" };

type FlightRecord = {
  ident?: string;
  ident_iata?: string;
  ident_icao?: string;
  flight_number?: string;
  destination?: string;
  destination_iata?: string;
  destination_icao?: string;
  scheduled_in?: string;
  estimated_in?: string;
  actual_in?: string;
  terminal_destination?: string;
  gate_destination?: string;
  status?: string;
  fa_flight_id?: string;
};

type FlightProviderResponse = {
  flights?: FlightRecord[];
  scheduled?: FlightRecord[];
};

const airportCodes: Record<string, { code: string; name: string }> = {
  NRT: { code: "NRT", name: "Narita International Airport" },
  NARITA: { code: "NRT", name: "Narita International Airport" },
  NARITAAIRPORT: { code: "NRT", name: "Narita International Airport" },
  HND: { code: "HND", name: "Haneda Airport" },
  HANEDA: { code: "HND", name: "Haneda Airport" },
  HANEDAAIRPORT: { code: "HND", name: "Haneda Airport" },
  KIX: { code: "KIX", name: "Kansai International Airport" },
  KANSAI: { code: "KIX", name: "Kansai International Airport" },
  KANSAIINTERNATIONALAIRPORT: { code: "KIX", name: "Kansai International Airport" },
  ITM: { code: "ITM", name: "Osaka Itami Airport" },
  ITAMI: { code: "ITM", name: "Osaka Itami Airport" },
  ITAMIAIRPORT: { code: "ITM", name: "Osaka Itami Airport" },
  NGO: { code: "NGO", name: "Chubu Centrair International Airport" },
  FUK: { code: "FUK", name: "Fukuoka Airport" },
};

const airlineIataToIcao: Record<string, string> = {
  AA: "AAL",
  AC: "ACA",
  AF: "AFR",
  ANA: "ANA",
  BA: "BAW",
  BR: "EVA",
  CA: "CCA",
  CI: "CAL",
  CX: "CPA",
  DL: "DAL",
  EK: "UAE",
  JL: "JAL",
  JQ: "JST",
  KE: "KAL",
  LH: "DLH",
  MU: "CES",
  NH: "ANA",
  QR: "QTR",
  SQ: "SIA",
  TG: "THA",
  TK: "THY",
  UA: "UAL",
};

const arrivalLobbyRules: Record<string, Record<string, string>> = {
  NRT: {
    "TERMINAL 1": "International Arrivals Lobby, Terminal 1 (1F)",
    "TERMINAL 2": "International Arrivals Lobby, Terminal 2 (1F)",
    "TERMINAL 3": "International Arrivals Lobby, Terminal 3 (2F)",
  },
  HND: {
    "TERMINAL 1": "Arrival Lobby, Terminal 1 (1F)",
    "TERMINAL 2": "Arrival Lobby, Terminal 2 (1F)",
    "TERMINAL 3": "International Arrivals Lobby, Terminal 3 (2F)",
  },
  KIX: {
    "TERMINAL 1": "Arrivals Lobby, Terminal 1 (1F)",
    "TERMINAL 2": "Arrivals Lobby, Terminal 2",
  },
  ITM: {
    "TERMINAL 1": "Arrivals Lobby, Terminal 1 (1F)",
  },
  NGO: {
    "TERMINAL 1": "Arrivals Lobby, Terminal 1 (2F)",
  },
  FUK: {
    "TERMINAL 1": "Arrivals Lobby, Terminal 1",
  },
};

const airportIcaoCodes: Record<string, string> = {
  NRT: "RJAA",
  HND: "RJTT",
  KIX: "RJBB",
  ITM: "RJOO",
  NGO: "RJGG",
  FUK: "RJFF",
};

function normalizeAirport(airport?: string): { code: string; name: string } | undefined {
  if (!airport) return undefined;
  const normalized = airport.toUpperCase().replace(/[^A-Z0-9]/gu, "");
  return airportCodes[normalized];
}

function normalizeFlightNumber(flightNumber: string): string {
  return flightNumber.toUpperCase().replace(/\s+/gu, "").trim();
}

function providerIdent(flightNumber: string): string {
  const match = normalizeFlightNumber(flightNumber).match(/^([A-Z]{2,3})(\d{1,4})$/u);
  if (!match) return normalizeFlightNumber(flightNumber);
  return `${airlineIataToIcao[match[1]] ?? match[1]}${match[2]}`;
}

function normalizeTerminal(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase().trim();
  const match = normalized.match(/(?:TERMINAL|T)\s*([A-Z0-9]+)/u) ?? normalized.match(/^([A-Z0-9]+)$/u);
  return match?.[1] ? `Terminal ${match[1]}` : value.trim();
}

function lobbyFor(airportCode: string, terminal?: string): string | undefined {
  if (!terminal) return undefined;
  const normalized = terminal.toUpperCase().replace(/\s+/gu, " ").trim();
  return arrivalLobbyRules[airportCode]?.[normalized];
}

function parseDate(value?: string): string | undefined {
  if (!value) return undefined;
  const now = new Date();
  const currentYear = now.getFullYear();
  if (/^today$/iu.test(value.trim())) return tokyoDate(now.toISOString());
  if (/^tomorrow$/iu.test(value.trim())) return tokyoDate(new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString());
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/u);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const chinese = value.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]/u);
  if (chinese) {
    return `${chinese[1] ?? currentYear}-${chinese[2].padStart(2, "0")}-${chinese[3].padStart(2, "0")}`;
  }

  const slash = value.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/u);
  if (slash) {
    const year = slash[3] ? (slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : String(currentYear);
    return `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }

  const monthName = value.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/u);
  if (monthName) {
    const month = new Date(`${monthName[1]} 1, 2000`).getMonth() + 1;
    if (month >= 1 && month <= 12) {
      return `${monthName[3] ?? currentYear}-${String(month).padStart(2, "0")}-${monthName[2].padStart(2, "0")}`;
    }
  }

  return undefined;
}

function tokyoDate(isoDate: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoDate));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateWindow(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function destinationMatches(record: FlightRecord, airportCode: string): boolean {
  return [record.destination_iata, record.destination_icao, record.destination]
    .filter(Boolean)
    .some((value) => value?.toUpperCase() === airportCode || value?.toUpperCase() === airportIcaoCodes[airportCode]);
}

function flightMatches(record: FlightRecord, flightNumber: string): boolean {
  const normalized = normalizeFlightNumber(flightNumber);
  const providerNormalized = providerIdent(flightNumber);
  return [record.ident, record.ident_iata, record.ident_icao, record.flight_number]
    .filter(Boolean)
    .some((value) => {
      const candidate = normalizeFlightNumber(value as string);
      return candidate === normalized || candidate === providerNormalized;
    });
}

function flightRecords(payload: FlightProviderResponse): FlightRecord[] {
  return [...(payload.flights ?? []), ...(payload.scheduled ?? [])];
}

export async function lookupFlightArrival(params: {
  flightNumber?: string;
  airport?: string;
  date?: string;
}): Promise<FlightLookupResult> {
  if (!params.flightNumber) return { status: "not_found", reason: "no_matching_flight" };
  if (!params.airport) return { status: "needs_more_info", missing: "airport" };
  const airport = normalizeAirport(params.airport);
  if (!airport) return { status: "not_found", reason: "unsupported_airport" };
  const date = parseDate(params.date);
  if (!date) return { status: "needs_more_info", missing: "date" };

  const apiKey = process.env.FLIGHT_DATA_API_KEY;
  if (!apiKey) return { status: "unavailable", reason: "not_configured" };

  const baseUrl = (process.env.FLIGHT_DATA_BASE_URL || "https://aeroapi.flightaware.com/aeroapi").replace(/\/$/u, "");
  const window = dateWindow(date);
  const query = new URLSearchParams({ start: window.start, end: window.end });
  const ident = providerIdent(params.flightNumber);

  try {
    const response = await fetch(`${baseUrl}/flights/${encodeURIComponent(ident)}?${query.toString()}`, {
      headers: { "x-apikey": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return { status: "unavailable", reason: "provider_error" };

    const payload = (await response.json()) as FlightProviderResponse;
    const matching = flightRecords(payload).filter((record) => {
      const arrivalTimestamp = record.scheduled_in ?? record.estimated_in ?? record.actual_in;
      return destinationMatches(record, airport.code) &&
        flightMatches(record, params.flightNumber as string) &&
        Boolean(arrivalTimestamp && tokyoDate(arrivalTimestamp) === date);
    });
    const record = matching[0];
    if (!record) return { status: "not_found", reason: "no_matching_flight" };

    const terminal = normalizeTerminal(record.terminal_destination);
    const actualArrival = record.actual_in;
    const estimatedArrival = record.estimated_in;
    const confidence: FlightArrivalConfidence = actualArrival
      ? "confirmed"
      : estimatedArrival
        ? "estimated"
        : "scheduled";

    return {
      status: "found",
      details: {
        flightNumber: normalizeFlightNumber(params.flightNumber),
        airportCode: airport.code,
        airportName: airport.name,
        terminal,
        arrivalLobby: lobbyFor(airport.code, terminal),
        scheduledArrival: record.scheduled_in,
        estimatedArrival,
        actualArrival,
        status: record.status,
        source: "FlightAware AeroAPI",
        checkedAt: new Date().toISOString(),
        confidence: terminal ? confidence : "partial",
        flightId: record.fa_flight_id,
      },
    };
  } catch {
    return { status: "unavailable", reason: "provider_error" };
  }
}

function flightStatusText(status?: string): string {
  if (!status) return "";
  const labels: Record<string, string> = {
    S: "scheduled",
    A: "en route",
    Z: "arrived",
    X: "cancelled",
  };
  return labels[status.toUpperCase()] ?? status.toLowerCase();
}

function chineseArrivalLobby(details: FlightArrivalDetails): string | undefined {
  if (!details.arrivalLobby) return undefined;
  const terminalNumber = details.terminal?.match(/Terminal\s+(.+)/iu)?.[1];
  const floor = details.arrivalLobby.match(/\((\dF)\)/iu)?.[1];
  const lobbyName = /international/iu.test(details.arrivalLobby) ? "国际到达大厅" : "到达大厅";
  if (!terminalNumber) return lobbyName;
  return `${lobbyName}，${terminalNumber}号航站楼${floor ? `（${floor.replace(/F$/iu, "楼")}）` : ""}`;
}

export function formatFlightArrivalDetails(details: FlightArrivalDetails, lang: PromptLang): string {
  const status = flightStatusText(details.status);
  if (lang === "zh") {
    const lobby = chineseArrivalLobby(details);
    const terminal = details.terminal?.replace(/^Terminal\s+/iu, "")
      ? `${details.terminal.replace(/^Terminal\s+/iu, "")}号航站楼`
      : "";
    return `已查到航班 ${details.flightNumber}：${details.airportName}${terminal ? `，${terminal}` : ""}。${lobby ? `过海关后请到${lobby}。` : ""}${status ? `当前状态：${status}。` : ""}`;
  }
  if (lang === "ar") {
    return `تم العثور على الرحلة ${details.flightNumber}: ${details.airportName}${details.terminal ? `، ${details.terminal}` : ""}. ${details.arrivalLobby ? `بعد الجمارك، يرجى التوجه إلى ${details.arrivalLobby}.` : ""}${status ? ` الحالة الحالية: ${status}.` : ""}`;
  }
  return `Flight ${details.flightNumber} arrives at ${details.airportName}${details.terminal ? `, ${details.terminal}` : ""}. ${details.arrivalLobby ? `After customs, please go to the ${details.arrivalLobby}.` : ""}${status ? ` Current status: ${status}.` : ""}`;
}

export function appendFlightArrivalToReply(
  reply: string,
  details: FlightArrivalDetails,
  lang: PromptLang,
): string {
  if (!details.terminal && !details.arrivalLobby) return reply;
  if (reply.includes(details.arrivalLobby ?? details.terminal ?? "__missing__")) return reply;
  return `${reply}\n\n${formatFlightArrivalDetails(details, lang)}`;
}
