"use client";

import { Sparkles, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { AIStatus } from "@/lib/ai/status-types";
import { BusinessConfigurationSchema } from "@/lib/domain/schemas";
import type { BusinessConfiguration, FAQ, Vehicle } from "@/lib/domain/types";
import { Panel, ProgressRows, StatusPill } from "./panel";
import { WorkspaceHeader } from "./workspace-header";

export const TRAIN_STORAGE_KEY = "ai-employee-train-config-v1";

interface TrainEmployeeViewProps {
  businessConfig: BusinessConfiguration;
  companyId: string;
  aiStatus: AIStatus;
}

export function TrainEmployeeView({ businessConfig: initialConfig, companyId, aiStatus }: TrainEmployeeViewProps) {
  const [businessConfig, setBusinessConfig] = useState<BusinessConfiguration>(initialConfig);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveConfigResult, setSaveConfigResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showEmbedSnippet, setShowEmbedSnippet] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(TRAIN_STORAGE_KEY);
        if (!saved) return;
        const parsed = BusinessConfigurationSchema.safeParse(JSON.parse(saved));
        if (parsed.success) setBusinessConfig(parsed.data);
      } catch {
        // Ignore malformed local drafts.
      }
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TRAIN_STORAGE_KEY, JSON.stringify(businessConfig));
    } catch (e) {
      console.warn("Failed to persist Train Employee draft", e);
    }
  }, [businessConfig]);

  const embedSnippet =
    typeof window !== "undefined"
      ? `<script src="${window.location.origin}/api/widget-embed?company=${companyId}"></script>`
      : "";

  async function copyEmbedSnippet() {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 2000);
    } catch {
      // Clipboard API unavailable; the snippet is still visible to copy manually.
    }
  }

  function updateCompanyProfile(field: "name" | "serviceArea", value: string) {
    setBusinessConfig((current) => ({
      ...current,
      companyProfile: { ...current.companyProfile, [field]: value },
    }));
  }

  function addVehicle() {
    const newVehicle: Vehicle = {
      id: `vehicle_${Date.now()}`,
      name: "新车型",
      type: "New",
      capacity: { passengers: 4, luggage: 3 },
      description: "请编辑描述",
    };
    setBusinessConfig((current) => ({ ...current, vehicles: [...(current.vehicles ?? []), newVehicle] }));
  }

  function updateVehicle(index: number, updater: (vehicle: Vehicle) => Vehicle) {
    setBusinessConfig((current) => {
      const vehicles = [...(current.vehicles ?? [])];
      const vehicle = vehicles[index];
      if (!vehicle) return current;
      vehicles[index] = updater(vehicle);
      return { ...current, vehicles };
    });
  }

  function removeVehicle(index: number) {
    setBusinessConfig((current) => ({
      ...current,
      vehicles: (current.vehicles ?? []).filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function updateFaq(index: number, changes: Partial<FAQ>) {
    setBusinessConfig((current) => {
      const faq = [...current.faq];
      const item = faq[index];
      if (!item) return current;
      faq[index] = { ...item, ...changes };
      return { ...current, faq };
    });
  }

  function removeFaq(index: number) {
    setBusinessConfig((current) => ({
      ...current,
      faq: current.faq.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function addFaq() {
    setBusinessConfig((current) => ({
      ...current,
      faq: [...current.faq, { id: `faq_${Date.now()}`, question: "新问题", answer: "新答案" }],
    }));
  }

  async function publishBusinessConfig() {
    setIsSavingConfig(true);
    setSaveConfigResult(null);

    try {
      const res = await fetch("/api/business-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(businessConfig),
      });
      const data = await res.json().catch(() => null);

      if (res.ok) {
        setSaveConfigResult({ ok: true, message: "已保存，客服机器人将立即使用新配置。" });
      } else {
        setSaveConfigResult({ ok: false, message: data?.error ?? `保存失败（${res.status}）` });
      }
    } catch {
      setSaveConfigResult({ ok: false, message: "保存失败，请检查网络后重试。" });
    } finally {
      setIsSavingConfig(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-stone-950">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <WorkspaceHeader title="训练员工" aiStatus={aiStatus} />

        <section className="grid gap-5 lg:grid-cols-2">
          <Panel title="训练员工（编辑此处可教AI知识）" icon={<Sparkles size={18} aria-hidden="true" />}>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-stone-500">公司名称</label>
                <input
                  className="w-full text-sm font-semibold text-stone-950 border border-stone-300 rounded px-2 py-1"
                  value={businessConfig.companyProfile.name}
                  onChange={(e) => updateCompanyProfile("name", e.target.value)}
                />
                <label className="text-xs font-medium text-stone-500 mt-2 block">服务区域</label>
                <input
                  className="w-full text-sm leading-6 text-stone-600 border border-stone-300 rounded px-2 py-1"
                  value={businessConfig.companyProfile.serviceArea}
                  onChange={(e) => updateCompanyProfile("serviceArea", e.target.value)}
                />
              </div>
              <ProgressRows
                rows={[
                  ["公司档案", true],
                  ["定价规则", true],
                  ["升级规则", true],
                  ["联系方式捕获", true],
                  ["预订字段", true],
                ]}
              />
              <div>
                <div className="text-xs font-medium text-stone-500 mb-1">支持语言</div>
                <div className="flex flex-wrap gap-2">
                  {businessConfig.companyProfile.languages.map((language, idx) => (
                    <span
                      className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700"
                      key={idx}
                    >
                      {language}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-stone-500 mt-2">
                  提示：修改上方公司信息、车型、知识库后，可前往「对话测试实验室」先测试效果；点击“保存并发布”后，网站客服机器人才会使用新配置。
                </p>
              </div>

              <div>
                <button
                  onClick={publishBusinessConfig}
                  disabled={isSavingConfig}
                  className="w-full rounded border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingConfig ? "保存中…" : "保存并发布到线上客服"}
                </button>
                {saveConfigResult && (
                  <p className={`mt-1 text-[10px] ${saveConfigResult.ok ? "text-emerald-700" : "text-rose-600"}`}>
                    {saveConfigResult.message}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-stone-500">可用车型（教AI用）</p>
                  <button
                    onClick={addVehicle}
                    className="text-[10px] px-2 py-0.5 rounded border border-emerald-700 text-emerald-700 hover:bg-emerald-50"
                  >
                    + 添加车型
                  </button>
                </div>
                <div className="space-y-2">
                  {(businessConfig.vehicles ?? []).map((v, idx) => (
                    <div key={idx} className="text-xs bg-white border border-stone-200 rounded px-2 py-1 space-y-1">
                      <input
                        className="w-full font-medium text-stone-800 border-b pb-0.5"
                        value={v.name}
                        onChange={(e) => updateVehicle(idx, (vehicle) => ({ ...vehicle, name: e.target.value }))}
                      />
                      <div className="flex gap-2 text-[10px]">
                        <input
                          className="flex-1 border rounded px-1"
                          placeholder="乘客"
                          type="number"
                          value={v.capacity.passengers}
                          onChange={(e) =>
                            updateVehicle(idx, (vehicle) => ({
                              ...vehicle,
                              capacity: { ...vehicle.capacity, passengers: Number.parseInt(e.target.value, 10) || 0 },
                            }))
                          }
                        />
                        <input
                          className="flex-1 border rounded px-1"
                          placeholder="行李"
                          type="number"
                          value={v.capacity.luggage}
                          onChange={(e) =>
                            updateVehicle(idx, (vehicle) => ({
                              ...vehicle,
                              capacity: { ...vehicle.capacity, luggage: Number.parseInt(e.target.value, 10) || 0 },
                            }))
                          }
                        />
                      </div>
                      <textarea
                        className="w-full text-[10px] text-stone-600 border rounded p-1"
                        value={v.description || ""}
                        onChange={(e) => updateVehicle(idx, (vehicle) => ({ ...vehicle, description: e.target.value }))}
                        rows={2}
                      />
                      <button onClick={() => removeVehicle(idx)} className="text-[9px] text-red-600 hover:underline">
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <div className="flex flex-col gap-5">
            <Panel
              title="安装到你的网站"
              icon={<ShieldCheck size={18} aria-hidden="true" />}
              action={
                <button onClick={() => setShowEmbedSnippet((v) => !v)} type="button">
                  <StatusPill label="网站挂件" />
                </button>
              }
            >
              {showEmbedSnippet ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-stone-600">
                    把下面这段代码粘贴到你的网站 HTML 中，客服机器人就会出现在你的网站上：
                  </p>
                  <code className="block overflow-x-auto whitespace-pre rounded bg-stone-900 px-3 py-2 text-[11px] text-emerald-300">
                    {embedSnippet}
                  </code>
                  <button
                    onClick={copyEmbedSnippet}
                    type="button"
                    className="mt-2 rounded border border-stone-300 px-2 py-1 text-[10px] font-medium hover:bg-stone-100"
                  >
                    {embedCopied ? "已复制！" : "复制代码"}
                  </button>
                </div>
              ) : (
                <p className="text-sm leading-6 text-stone-600">点击右上角“网站挂件”获取嵌入代码。</p>
              )}
            </Panel>

            <Panel title="公司知识库（保存后AI才会使用）" icon={<Sparkles size={18} aria-hidden="true" />}>
              <div className="space-y-3">
                {businessConfig.faq.map((item, idx) => (
                  <div key={idx} className="border-b border-stone-200 pb-3 last:border-0 last:pb-0 space-y-1">
                    <input
                      className="w-full text-sm font-medium text-stone-950 border border-stone-300 rounded px-2 py-0.5"
                      value={item.question}
                      onChange={(e) => updateFaq(idx, { question: e.target.value })}
                      placeholder="问题"
                    />
                    <textarea
                      className="w-full text-sm leading-6 text-stone-600 border border-stone-300 rounded px-2 py-1"
                      value={item.answer}
                      onChange={(e) => updateFaq(idx, { answer: e.target.value })}
                      rows={2}
                      placeholder="答案"
                    />
                    <button onClick={() => removeFaq(idx)} className="text-[10px] text-red-600 hover:underline">
                      删除此条
                    </button>
                  </div>
                ))}
                <button
                  onClick={addFaq}
                  className="text-xs px-3 py-1 rounded border border-emerald-700 text-emerald-700 hover:bg-emerald-50"
                >
                  + 添加知识条目
                </button>
              </div>
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}
