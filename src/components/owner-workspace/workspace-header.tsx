"use client";

import { Bot } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { AIStatus } from "@/lib/ai/status-types";

const NAV_ITEMS = [
  { href: "/", label: "老板收件箱" },
  { href: "/train", label: "训练员工" },
  { href: "/test-lab", label: "对话测试实验室" },
];

export function WorkspaceHeader({
  title,
  aiStatus,
  metrics,
}: {
  title: string;
  aiStatus: AIStatus;
  metrics?: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <header className="flex flex-col gap-4 border-b border-stone-300 pb-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-lg bg-emerald-800 text-white">
            <Bot size={22} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-stone-600">AI 员工 V1</p>
            <h1 className="text-2xl font-semibold tracking-normal text-stone-950 sm:text-3xl">{title}</h1>
            <p className="text-[11px] text-emerald-700">
              {aiStatus.configured
                ? `已启用真实 AI（${aiStatus.providerLabel}）`
                : "规则模拟模式（请设置 DEEPSEEK_API_KEY）"}
            </p>
          </div>
        </div>
        {metrics}
      </div>
      <nav className="flex gap-2 text-sm font-medium">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 transition ${
                active
                  ? "bg-emerald-800 text-white"
                  : "border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
