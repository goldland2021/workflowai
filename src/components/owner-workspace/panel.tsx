import { Check } from "lucide-react";
import type { ReactNode } from "react";

export function Panel({
  title,
  children,
  icon,
  action,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-stone-300 bg-[#fffdf8] shadow-sm shadow-stone-200/60">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-emerald-800">{icon}</span>
          <h2 className="truncate text-sm font-semibold text-stone-950">{title}</h2>
        </div>
        {action}
      </div>
      <div className={compact ? "p-3" : "p-4"}>{children}</div>
    </section>
  );
}

export function Metric({ label, value, tone }: { label: string; value: string; tone: "emerald" | "amber" | "indigo" | "rose" }) {
  const toneClass = {
    emerald: "border-emerald-700/30 bg-emerald-50 text-emerald-900",
    amber: "border-amber-700/30 bg-amber-50 text-amber-900",
    indigo: "border-indigo-700/30 bg-indigo-50 text-indigo-900",
    rose: "border-rose-700/30 bg-rose-50 text-rose-900",
  };
  return (
    <span className={"rounded-md border px-2 py-1 text-xs font-semibold " + (toneClass[tone] ?? toneClass.emerald)}>
      {label}: {value}
    </span>
  );
}

export function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-semibold uppercase text-stone-600">
      {label}
    </span>
  );
}

export function ProgressRows({ rows }: { rows: Array<[string, boolean]> }) {
  return (
    <div className="space-y-2">
      {rows.map(([label, complete]) => (
        <div key={label} className="flex items-center justify-between gap-3 text-sm">
          <span className={complete ? "text-stone-700" : "text-stone-400"}>{label}</span>
          <span className={complete ? "text-emerald-700" : "text-stone-400"}>
            <Check size={16} aria-hidden="true" />
          </span>
        </div>
      ))}
    </div>
  );
}

