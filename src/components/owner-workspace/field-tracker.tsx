import { CalendarCheck } from "lucide-react";
import type { TripDetails } from "@/lib/domain/types";
import { Panel } from "./panel";

export function FieldTracker({
  tripDetails,
  missingFields,
}: {
  tripDetails: TripDetails;
  missingFields: Array<keyof TripDetails>;
}) {
  const serviceMap: Record<string, string> = {
    airport_pickup: "机场接机",
    airport_dropoff: "机场送机",
    city_transfer: "城市接送",
    round_trip: "往返",
    day_tour: "一日游",
  };

  const rows: Array<[keyof TripDetails, string, string | number | undefined]> = [
    ["serviceType", "服务类型", serviceMap[tripDetails.serviceType || ""] || tripDetails.serviceType],
    ["pickupLocation", "上车地点", tripDetails.pickupLocation],
    ["dropoffLocation", "下车地点", tripDetails.dropoffLocation],
    ["airport", "机场", tripDetails.airport],
    ["terminal", "航站楼", tripDetails.terminal],
    ["date", "日期", tripDetails.date],
    ["time", "时间", tripDetails.time],
    ["flightNumber", "航班", tripDetails.flightNumber],
    ["passengerCount", "乘客", tripDetails.passengerCount],
    ["luggageCount", "行李", tripDetails.luggageCount],
    ["vehiclePreference", "车型", tripDetails.vehiclePreference],
  ];

  return (
    <Panel title="行程字段" compact icon={<CalendarCheck size={17} aria-hidden="true" />}>
      <div className="space-y-2">
        {rows.map(([key, label, value]) => {
          const missing = missingFields.includes(key);
          return (
            <div className="flex items-start justify-between gap-3 text-sm" key={key as string}>
              <span className="text-stone-500">{label}</span>
              <span className={`max-w-[150px] text-right font-medium ${missing ? "text-amber-700" : "text-stone-950"}`}>
                {value ?? "缺失"}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
