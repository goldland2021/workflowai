import type React from "react";

export function LoadingSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse space-y-2">
          <div className="h-3 w-1/3 rounded-full bg-stone-200" />
          <div className="h-3 w-2/3 rounded-full bg-stone-100" />
          <div className="h-3 w-1/2 rounded-full bg-stone-100" />
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-stone-500">{title}</h3>
      <LoadingSkeleton count={3} />
    </div>
  );
}
