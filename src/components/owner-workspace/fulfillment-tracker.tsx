import { Car, CreditCard, ReceiptText } from "lucide-react";
import type { DriverDetails, ReceiptRequest } from "@/lib/domain/types";

export function FulfillmentTracker({
  driverDetails,
  paymentMethod,
  receiptRequest,
  onDriverChange,
  onPaymentMethodChange,
  onReceiptChange,
}: {
  driverDetails: DriverDetails;
  paymentMethod: string;
  receiptRequest: ReceiptRequest;
  onDriverChange: (field: keyof DriverDetails, value: string) => void;
  onPaymentMethodChange: (value: string) => void;
  onReceiptChange: (changes: Partial<ReceiptRequest>) => void;
}) {
  const driverFields: Array<[keyof DriverDetails, string, string]> = [
    ["name", "司机姓名", "Assigned driver"],
    ["phone", "电话", "+81 ..."],
    ["vehicle", "车辆", "Toyota Alphard"],
    ["color", "颜色", "Black"],
    ["licensePlate", "车牌", "Tokyo ..."],
    ["whatsapp", "WhatsApp", "+81 ..."],
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase text-stone-500">
          <Car size={14} aria-hidden="true" />
          司机
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {driverFields.map(([field, label, placeholder]) => (
            <label className="flex min-w-0 flex-col gap-1" key={field}>
              <span className="text-[10px] font-medium text-stone-500">{label}</span>
              <input
                className="min-h-9 min-w-0 rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                onChange={(event) => onDriverChange(field, event.target.value)}
                placeholder={placeholder}
                value={driverDetails[field] ?? ""}
              />
            </label>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1 border-t border-stone-200 pt-3">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase text-stone-500">
          <CreditCard size={14} aria-hidden="true" />
          支付
        </span>
        <input
          className="min-h-9 rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          onChange={(event) => onPaymentMethodChange(event.target.value)}
          value={paymentMethod}
        />
      </label>

      <div className="space-y-2 border-t border-stone-200 pt-3">
        <label className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase text-stone-500">
            <ReceiptText size={14} aria-hidden="true" />
            收据
          </span>
          <input
            checked={receiptRequest.needed}
            className="size-4 accent-emerald-800"
            onChange={(event) => onReceiptChange({ needed: event.target.checked })}
            type="checkbox"
          />
        </label>

        {receiptRequest.needed && (
          <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[10px] font-medium text-stone-500">收据抬头</span>
              <input
                className="min-h-9 min-w-0 rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                onChange={(event) => onReceiptChange({ receiptName: event.target.value || undefined })}
                placeholder="Company Guest"
                value={receiptRequest.receiptName ?? ""}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[10px] font-medium text-stone-500">币种</span>
              <input
                className="min-h-9 min-w-0 rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                onChange={(event) => onReceiptChange({ currency: event.target.value || undefined })}
                value={receiptRequest.currency ?? ""}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

