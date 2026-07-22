import type { ServiceType, TripDetails } from "./types";

const MONTH_DATE_PATTERN = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?\b|\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+\d{4})?\b/i;
const ISO_DATE_PATTERN = /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/;

function labeledValue(message: string, labels: string[]): string | undefined {
  const label = labels.join("|");
  const match = message.match(new RegExp(`(?:${label})\\s*[：:]\\s*([^\\n\\r]+)`, "iu"));
  return match?.[1]?.trim();
}

function firstInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/\b\d+\b/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function dateFromText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.match(MONTH_DATE_PATTERN)?.[0]
    ?? value.match(ISO_DATE_PATTERN)?.[0]
    ?? value.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]/u)?.[0];
}

function timeFromText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.match(/\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b/i)?.[0];
}

function normalizeTimeText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return value.trim();
  const hour = Number(match[1]);
  const minute = match[2] ?? "00";
  const meridiem = match[3]?.toUpperCase();
  return meridiem ? `${hour}:${minute} ${meridiem}` : `${hour}:${minute}`;
}

function serviceTypeFromRouteType(value: string | undefined): ServiceType | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (/(?:hotel|address|city).*(?:airport|nrt|hnd|kix|itm)|(?:airport|nrt|hnd|kix|itm).*(?:drop|departure)/i.test(normalized)) {
    return "airport_dropoff";
  }
  if (/(?:airport|nrt|hnd|kix|itm).*(?:hotel|address|city|pickup|arrival)|(?:pickup|arrival).*(?:airport|nrt|hnd|kix|itm)/i.test(normalized)) {
    return "airport_pickup";
  }
  if (/round|return/i.test(normalized)) return "round_trip";
  if (/charter|day tour|hourly|private driver/i.test(normalized)) return "day_tour";
  return undefined;
}

function airportName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/haneda|hnd|羽田/iu.test(value)) return "Haneda";
  if (/narita|nrt|成田/iu.test(value)) return "Narita";
  if (/kansai|kix|関西/iu.test(value)) return "Kansai";
  if (/itami|itm|伊丹/iu.test(value)) return "Itami";
  return value.trim() || undefined;
}

function canonicalVehicle(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/alphard|阿尔法|阿爾法|アルファード/iu.test(value)) return "Toyota Alphard";
  if (/hiace|海狮|海獅/iu.test(value)) return "Toyota HiAce";
  return value.trim() || undefined;
}

/**
 * Parse the labelled form submitted by the widget before the LLM sees it.
 * Customer-supplied labels are higher-confidence than a model guess.
 */
export function extractLabeledTripFields(message: string): Partial<TripDetails> {
  const routeType = labeledValue(message, ["route type", "service type", "服务类型"]);
  const airportValue = labeledValue(message, ["airport", "机场"]);
  const flightValue = labeledValue(message, ["flight number", "flight", "航班号"]);
  const landingValue = labeledValue(message, ["landing time", "arrival time", "arrival date", "到达时间", "抵达时间"]);
  const pickupValue = labeledValue(message, ["pickup date & time", "pickup date/time", "pickup time", "接送日期", "接送时间"]);
  const hotelValue = labeledValue(message, ["hotel or address", "hotel", "address", "酒店或地址", "酒店地址", "地址"]);
  const passengersValue = labeledValue(message, ["passengers", "passenger count", "number of passengers", "乘客人数", "乘客"]);
  const luggageValue = labeledValue(message, ["luggage", "number of luggage", "luggage count", "行李数量", "行李"]);
  const vehicleValue = labeledValue(message, ["vehicle", "vehicle preference", "车型"]);

  const serviceType = serviceTypeFromRouteType(routeType);
  const airport = airportName(airportValue);
  const dateSource = landingValue ?? pickupValue;
  const date = dateFromText(dateSource);
  const time = timeFromText(dateSource);
  const airportLocation = airportValue?.trim() || airport;
  const resolvedServiceType = serviceType ?? (airport && hotelValue ? "airport_pickup" : undefined);
  const result: Partial<TripDetails> = {
    serviceType: resolvedServiceType,
    airport,
    date,
    time: normalizeTimeText(time),
    flightNumber: flightValue?.trim().toUpperCase().replace(/\s+/g, " "),
    passengerCount: firstInteger(passengersValue),
    luggageCount: firstInteger(luggageValue),
    vehiclePreference: canonicalVehicle(vehicleValue),
  };

  if (hotelValue) {
    if (resolvedServiceType === "airport_dropoff") result.pickupLocation = hotelValue.trim();
    else result.dropoffLocation = hotelValue.trim();
  }
  if (airportLocation) {
    if (resolvedServiceType === "airport_dropoff") result.dropoffLocation = airportLocation;
    else result.pickupLocation = airportLocation;
  }

  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined && value !== ""),
  ) as Partial<TripDetails>;
}

/** Prefer month-name or explicitly labelled dates so address numbers cannot become dates. */
export function extractDateText(message: string): string | undefined {
  return dateFromText(message)
    ?? message.match(/(?:date|on|arrival|landing|pickup)[^\n\r]{0,24}?((?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?))/iu)?.[1];
}

export function normalizeTripDetails(tripDetails: TripDetails): TripDetails {
  const next = { ...tripDetails };
  if (next.passengerCount !== undefined && (!Number.isFinite(next.passengerCount) || next.passengerCount < 0)) {
    delete next.passengerCount;
  }
  if (next.luggageCount !== undefined && (!Number.isFinite(next.luggageCount) || next.luggageCount < 0)) {
    delete next.luggageCount;
  }
  return next;
}
