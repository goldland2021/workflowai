import type { BookingSummary, DriverDetails, ServiceType, TripDetails } from "./types";

export function buildBookingConfirmationText(booking: BookingSummary): string {
  const trip = booking.tripDetails;
  const lines = [
    "Transfer Booking Confirmation",
    "",
    formatLine("Service", formatServiceType(booking.serviceType ?? trip.serviceType)),
    formatLine("Date", trip.date),
    formatLine("Pickup Time", trip.time),
    formatLine("Pickup Address", trip.pickupLocation),
    formatLine("Destination", trip.dropoffLocation),
    formatLine("Airport / Terminal", formatAirport(trip)),
    formatLine("Flight", formatFlight(trip)),
    formatLine("Passengers", formatCount(trip.passengerCount, "passenger(s)")),
    formatLine("Luggage", formatCount(trip.luggageCount, "piece(s)")),
    formatLine("Vehicle", booking.driverDetails?.vehicle ?? trip.vehiclePreference),
    formatLine("Price", formatPrice(booking)),
    formatLine("Payment", booking.paymentMethod),
    "",
    "Notes:",
    ...formatNotes(booking),
  ];

  const driverLines = formatDriverDetails(booking.driverDetails);
  if (driverLines.length > 0) {
    lines.push("", "Driver Details", "", ...driverLines);
  }

  return lines
    .filter((line, index, all) => line !== undefined && !(line === "" && all[index - 1] === ""))
    .join("\n");
}

export function formatServiceType(serviceType?: ServiceType): string | undefined {
  if (!serviceType) return undefined;

  const map: Record<string, string> = {
    airport_pickup: "Airport pickup",
    airport_dropoff: "Airport drop-off",
    city_transfer: "City transfer",
    round_trip: "Round trip",
    day_tour: "Private day tour",
    hourly_charter: "Hourly charter",
    multi_leg_itinerary: "Multi-leg itinerary",
  };

  return map[serviceType] || serviceType.replace(/_/g, " ");
}

function formatLine(label: string, value?: string | number): string {
  if (value === undefined || value === "") return `${label}: TBC`;
  return `${label}: ${value}`;
}

function formatAirport(trip: TripDetails): string | undefined {
  if (trip.airport && trip.terminal) return `${trip.airport} ${trip.terminal}`;
  return trip.airport ?? trip.terminal;
}

function formatFlight(trip: TripDetails): string | undefined {
  if (trip.flightNumber && trip.flightTime) return `${trip.flightNumber} (${trip.flightTime})`;
  return trip.flightNumber ?? trip.flightTime;
}

function formatCount(value: number | undefined, noun: string): string | undefined {
  if (!value) return undefined;
  return `${value} ${noun}`;
}

function formatPrice(booking: BookingSummary): string | undefined {
  if (!booking.approvedPrice || !booking.currency) return undefined;
  return `${booking.currency} ${booking.approvedPrice}`;
}

function formatNotes(booking: BookingSummary): string[] {
  const notes = [
    booking.includedFees?.length ? `Price includes ${formatList(booking.includedFees.map(formatFee))}.` : undefined,
    booking.receiptRequest?.needed
      ? `Receipt requested${booking.receiptRequest.receiptName ? ` for ${booking.receiptRequest.receiptName}` : ""}.`
      : undefined,
    ...booking.specialNotes,
  ];

  return notes.filter(isPresent);
}

function formatDriverDetails(driver?: DriverDetails): string[] {
  if (!driver) return [];
  const hasDriverDetails = Object.values(driver).some(Boolean);
  if (!hasDriverDetails) return [];

  return [
    formatLine("Driver Name", driver.name),
    formatLine("Phone", driver.phone),
    formatLine("Vehicle", driver.vehicle),
    formatLine("Color", driver.color),
    formatLine("License Plate", driver.licensePlate),
    formatLine("WhatsApp", driver.whatsapp),
  ];
}

function formatList(values: string[]): string {
  if (values.length <= 1) return values.join("");
  if (values.length === 2) return values.join(" and ");

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function formatFee(value: string): string {
  const map: Record<string, string> = {
    过路费: "tolls",
    停车费: "parking fees",
    税费: "taxes",
  };

  return map[value] ?? value;
}

function isPresent(value: string | undefined): value is string {
  return Boolean(value);
}
