import { Clock } from "lucide-react";
import { Check, Copy, Send } from "lucide-react";
import type { BookingSummary } from "@/lib/domain/types";

export function BookingSummaryView({
  bookingSummary,
  onCopyConfirmation,
  confirmationCopied = false,
  onSendConfirmation,
  confirmationSent = false,
}: {
  bookingSummary: BookingSummary;
  onCopyConfirmation?: () => void;
  confirmationCopied?: boolean;
  onSendConfirmation?: () => void;
  confirmationSent?: boolean;
}) {
  const serviceMap: Record<string, string> = {
    airport_pickup: "机场接机",
    airport_dropoff: "机场送机",
    city_transfer: "城市接送",
    round_trip: "往返",
    day_tour: "一日游",
  };

  const detailRows = [
    ["服务", serviceMap[bookingSummary.serviceType || ""] || bookingSummary.serviceType],
    ["上车", bookingSummary.tripDetails.pickupLocation],
    ["下车", bookingSummary.tripDetails.dropoffLocation],
    ["机场", bookingSummary.tripDetails.airport],
    ["航站楼", bookingSummary.tripDetails.terminal],
    ["日期", bookingSummary.tripDetails.date],
    ["时间", bookingSummary.tripDetails.time],
    ["航班", bookingSummary.tripDetails.flightNumber],
    ["乘客", bookingSummary.tripDetails.passengerCount],
    ["行李", bookingSummary.tripDetails.luggageCount],
    ["车型", bookingSummary.tripDetails.vehiclePreference],
    ["支付", bookingSummary.paymentMethod],
  ];
  const driverRows: Array<[string, string | undefined]> = [
    ["司机", bookingSummary.driverDetails?.name],
    ["电话", bookingSummary.driverDetails?.phone],
    ["车辆", bookingSummary.driverDetails?.vehicle],
    ["颜色", bookingSummary.driverDetails?.color],
    ["车牌", bookingSummary.driverDetails?.licensePlate],
    ["WhatsApp", bookingSummary.driverDetails?.whatsapp],
  ];
  const visibleDriverRows = driverRows.filter(([, value]) => Boolean(value));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-950">
          <Clock size={16} aria-hidden="true" />
          {bookingSummary.status === "ready" ? "已就绪" : "草稿"}
        </div>
        {bookingSummary.approvedPrice && (
          <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900">
            {bookingSummary.currency} {bookingSummary.approvedPrice}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {detailRows.map(([label, value]) => (
          <div className="flex items-start justify-between gap-3 text-sm" key={label}>
            <span className="text-stone-500">{label}</span>
            <span className="max-w-[220px] text-right font-medium text-stone-950">{value ?? "Missing"}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-stone-200 pt-3">
        <p className="text-xs font-semibold uppercase text-stone-500">包含项目</p>
        <p className="mt-2 text-sm leading-6 text-stone-700">
          {bookingSummary.includedFees?.join(", ") ?? "待确认"}
        </p>
      </div>

      <div className="border-t border-stone-200 pt-3">
        <p className="text-xs font-semibold uppercase text-stone-500">司机信息</p>
        {visibleDriverRows.length > 0 ? (
          <div className="mt-2 space-y-2">
            {visibleDriverRows.map(([label, value]) => (
              <div className="flex items-start justify-between gap-3 text-sm" key={label}>
                <span className="text-stone-500">{label}</span>
                <span className="max-w-[220px] text-right font-medium text-stone-950">{value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-stone-700">待分配司机</p>
        )}
      </div>

      <div className="border-t border-stone-200 pt-3">
        <p className="text-xs font-semibold uppercase text-stone-500">收据</p>
        <p className="mt-2 text-sm leading-6 text-stone-700">
          {bookingSummary.receiptRequest?.needed
            ? bookingSummary.receiptRequest.receiptName
              ? `需要，抬头：${bookingSummary.receiptRequest.receiptName}`
              : "需要，抬头待确认"
            : "不需要"}
        </p>
      </div>

      <div className="border-t border-stone-200 pt-3">
        <p className="text-xs font-semibold uppercase text-stone-500">备注</p>
        <ul className="mt-2 space-y-2">
          {bookingSummary.specialNotes.map((note) => (
            <li className="text-sm leading-6 text-stone-700" key={note}>
              {note}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-stone-200 pt-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase text-stone-500">客户消息</p>
          <div className="flex items-center gap-2">
            {onCopyConfirmation && (
              <button
                className="inline-flex items-center gap-1 rounded border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
                onClick={onCopyConfirmation}
                type="button"
              >
                {confirmationCopied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                {confirmationCopied ? "已复制" : "复制确认单"}
              </button>
            )}
            {onSendConfirmation && (
              <button
                className="inline-flex items-center gap-1 rounded bg-emerald-800 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-900"
                onClick={onSendConfirmation}
                type="button"
              >
                {confirmationSent ? <Check size={13} aria-hidden="true" /> : <Send size={13} aria-hidden="true" />}
                {confirmationSent ? "已记录" : "记录已发送"}
              </button>
            )}
          </div>
        </div>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-stone-200 bg-white p-3 text-xs leading-5 text-stone-800">
          {bookingSummary.confirmationText}
        </pre>
      </div>
    </div>
  );
}

