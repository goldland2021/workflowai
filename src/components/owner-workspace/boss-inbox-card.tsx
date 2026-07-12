import { ArrowRight, Check, Edit3, X } from "lucide-react";
import type { BossInboxItem, QuoteSuggestion } from "@/lib/domain/types";

type QuoteEditField = "suggestedPrice" | "currency" | "vehicleType" | "reason" | "includedFees";
type QuoteEditValue = QuoteSuggestion[QuoteEditField];

export function BossInboxCard({
  item,
  onUpdate,
  editingId,
  editForm,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditFormChange,
}: {
  item: BossInboxItem;
  onUpdate: (id: string, status: BossInboxItem["status"]) => void;
  editingId?: string | null;
  editForm?: Partial<QuoteSuggestion>;
  onStartEdit?: (id: string) => void;
  onSaveEdit?: (id: string, andApprove?: boolean) => void;
  onCancelEdit?: () => void;
  onEditFormChange?: (field: QuoteEditField, value: QuoteEditValue) => void;
}) {
  const canAct = item.status === "pending" || item.status === "edited";
  const isCurrentlyEditing = editingId === item.id;

  return (
    <article className="rounded-lg border border-stone-300 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-stone-950">
            {item.type === "quote_approval" ? "报价建议" : item.event?.eventType}
          </p>
          <p className="mt-1 text-xs font-medium uppercase text-stone-500">{item.decisionType} · {item.createdAt}</p>
        </div>
        <span
          className={`rounded-md px-2 py-1 text-xs font-semibold ${
            canAct ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
          }`}
        >
          {item.status}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-700">{item.summary}</p>
      <div className="mt-3 rounded-md bg-stone-50 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-950">
          <ArrowRight size={15} aria-hidden="true" />
          {item.recommendation}
        </div>
        <p className="mt-2 text-xs leading-5 text-stone-600">{item.reason}</p>
      </div>
      {canAct && !isCurrentlyEditing && (
        <div className="mt-3 flex gap-2">
          <button
            className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md bg-emerald-800 px-2 text-xs font-semibold text-white hover:bg-emerald-900"
            onClick={() => onUpdate(item.id, "approved")}
            title="Approve"
            type="button"
          >
            <Check size={14} aria-hidden="true" />
            批准
          </button>
          {item.quote && (
            <button
              className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-stone-300 bg-white px-2 text-xs font-semibold text-stone-800 hover:bg-stone-50"
              onClick={() => onStartEdit?.(item.id)}
              title="Edit"
              type="button"
            >
              <Edit3 size={14} aria-hidden="true" />
              编辑
            </button>
          )}
          <button
            className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-rose-300 bg-white px-2 text-xs font-semibold text-rose-800 hover:bg-rose-50"
            onClick={() => onUpdate(item.id, "rejected")}
            title="Reject"
            type="button"
          >
            <X size={14} aria-hidden="true" />
            拒绝
          </button>
        </div>
      )}

      {/* Edit form for this item */}
      {isCurrentlyEditing && item.quote && (
        <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">
          <div className="text-xs font-semibold text-amber-700">正在编辑报价</div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-stone-500">价格</span>
              <input
                type="number"
                className="rounded border border-stone-300 px-2 py-1 text-sm"
                value={editForm?.suggestedPrice ?? item.quote.suggestedPrice}
                onChange={(e) => onEditFormChange?.("suggestedPrice", parseFloat(e.target.value) || 0)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-stone-500">币种</span>
              <input
                type="text"
                className="rounded border border-stone-300 px-2 py-1 text-sm"
                value={editForm?.currency ?? item.quote.currency}
                onChange={(e) => onEditFormChange?.("currency", e.target.value)}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[10px] text-stone-500">车型</span>
            <input
              type="text"
              className="rounded border border-stone-300 px-2 py-1 text-sm"
              value={editForm?.vehicleType ?? item.quote.vehicleType ?? ""}
              onChange={(e) => onEditFormChange?.("vehicleType", e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[10px] text-stone-500">理由 / 说明</span>
            <textarea
              className="rounded border border-stone-300 px-2 py-1 text-sm min-h-[60px]"
              value={editForm?.reason ?? item.quote.reason ?? ""}
              onChange={(e) => onEditFormChange?.("reason", e.target.value)}
            />
          </label>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onSaveEdit?.(item.id, false)}
              className="flex-1 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-stone-50"
              type="button"
            >
              保存编辑
            </button>
            <button
              onClick={() => onSaveEdit?.(item.id, true)}
              className="flex-1 rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900"
              type="button"
            >
              保存并批准
            </button>
            <button
              onClick={() => onCancelEdit?.()}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50"
              type="button"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

