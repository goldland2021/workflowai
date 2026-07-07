import type { BookingSummary, ServiceType, TripDetails } from "./types";

export function buildBookingConfirmationText(booking: BookingSummary): string {
  const trip = booking.tripDetails;
  const lines = [
    "预订确认",
    "",
    formatLine("服务", formatServiceType(booking.serviceType ?? trip.serviceType)),
    formatLine("日期", trip.date),
    formatLine("接送时间", trip.time),
    formatLine("上车地址", trip.pickupLocation),
    formatLine("目的地", trip.dropoffLocation),
    formatLine("机场", formatAirport(trip)),
    formatLine("航班", formatFlight(trip)),
    formatLine("乘客数", formatCount(trip.passengerCount, "人")),
    formatLine("行李数", formatCount(trip.luggageCount, "件")),
    formatLine("车型", booking.driverDetails?.vehicle ?? trip.vehiclePreference),
    formatLine("价格", formatPrice(booking)),
    formatLine("支付方式", booking.paymentMethod),
    "",
    "备注：",
    ...formatNotes(booking),
  ];

  const driverLines = formatDriverDetails(booking);
  if (driverLines.length > 0) {
    lines.push("", "司机信息", "", ...driverLines);
  }

  return lines.filter((line, index, all) => line !== undefined && !(line === "" && all[index - 1] === "")).join("\n");
}

export function formatServiceType(serviceType?: ServiceType): string | undefined {
  if (!serviceType) return undefined;

  const map: Record<string, string> = {
    airport_pickup: "机场接机",
    airport_dropoff: "机场送机",
    city_transfer: "城市接送",
    round_trip: "往返接送",
    day_tour: "一日游",
    hourly_charter: "包车",
    multi_leg_itinerary: "多段行程",
  };

  return map[serviceType] || serviceType.replace(/_/g, " ");
}

function formatLine(label: string, value?: string | number): string | undefined {
  if (value === undefined || value === "") return undefined;
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
    booking.includedFees?.length
      ? `价格包含 ${booking.includedFees.join("、").toLowerCase()}。`
      : undefined,
    booking.receiptRequest?.needed ? "已要求发票，请在服务前确认收据姓名。" : undefined,
    ...booking.specialNotes,
  ];

  return notes.filter(isPresent).map((note) => `- ${note}`);
}

function formatDriverDetails(booking: BookingSummary): string[] {
  const driver = booking.driverDetails;
  if (!driver) return [];

  return [
    formatLine("司机姓名", driver.name),
    formatLine("电话", driver.phone),
    formatLine("车型", driver.vehicle),
    formatLine("颜色", driver.color),
    formatLine("车牌", driver.licensePlate),
    formatLine("WhatsApp", driver.whatsapp),
  ].filter(isPresent);
}

function isPresent(value: string | undefined): value is string {
  return Boolean(value);
}
