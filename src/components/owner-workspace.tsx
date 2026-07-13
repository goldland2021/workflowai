"use client";

import { Car, ClipboardCheck, Inbox } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getMissingQuoteFields, createBookingSummary } from "@/lib/domain/booking-workflow";
import type {
  BookingSummary,
  BossInboxItem,
  CapturedContact,
  DriverDetails,
  QuoteSuggestion,
  ReceiptRequest,
  TripDetails,
  WorkspaceWorkflowRecord,
} from "@/lib/domain/types";
import type { AIStatus } from "@/lib/ai/status-types";
import { BossInboxCard } from "./owner-workspace/boss-inbox-card";
import { BookingSummaryView } from "./owner-workspace/booking-summary-view";
import { ChatBubble } from "./owner-workspace/chat-bubble";
import { FulfillmentTracker } from "./owner-workspace/fulfillment-tracker";
import { Panel, Metric, StatusPill } from "./owner-workspace/panel";
import { WorkspaceHeader } from "./owner-workspace/workspace-header";
import { ErrorBoundary } from "./error-boundary";

const STORAGE_KEY = "ai-employee-dashboard-v1";

interface OwnerWorkspaceProps {
  bossInbox: BossInboxItem[];
  tripDetails: TripDetails;
  contact?: CapturedContact;
  bookingSummary: BookingSummary;
  workflowRecords?: WorkspaceWorkflowRecord[];
  aiStatus: AIStatus;
}

interface SavedDashboardState {
  tripDetails: TripDetails;
  contact?: CapturedContact;
  driverDetails: DriverDetails;
  paymentMethod: string;
  receiptRequest: ReceiptRequest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

function parseDriverDetails(value: unknown): DriverDetails | undefined {
  if (!isRecord(value)) return undefined;

  const details: DriverDetails = {
    name: readOptionalString(value, "name"),
    phone: readOptionalString(value, "phone"),
    vehicle: readOptionalString(value, "vehicle"),
    color: readOptionalString(value, "color"),
    licensePlate: readOptionalString(value, "licensePlate"),
    whatsapp: readOptionalString(value, "whatsapp"),
  };

  return Object.values(details).some(Boolean) ? details : undefined;
}

function parseReceiptRequest(value: unknown): ReceiptRequest | undefined {
  if (!isRecord(value) || typeof value.needed !== "boolean") return undefined;

  return {
    needed: value.needed,
    receiptName: readOptionalString(value, "receiptName"),
    amount: readOptionalNumber(value, "amount"),
    currency: readOptionalString(value, "currency"),
  };
}

function readSavedDashboard(): Partial<SavedDashboardState> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return {};

    const parsed = JSON.parse(saved) as unknown;
    if (!isRecord(parsed)) return {};

    const state: Partial<SavedDashboardState> = {};
    if (isRecord(parsed.tripDetails)) state.tripDetails = parsed.tripDetails as TripDetails;
    if ("contact" in parsed) state.contact = parsed.contact as CapturedContact | undefined;
    state.driverDetails = parseDriverDetails(parsed.driverDetails) ?? {};
    if (typeof parsed.paymentMethod === "string") state.paymentMethod = parsed.paymentMethod;
    state.receiptRequest = parseReceiptRequest(parsed.receiptRequest) ?? { needed: false };

    return state;
  } catch {
    return {};
  }
}

export function OwnerWorkspace({
  bossInbox: initialBossInbox,
  tripDetails: initialTripDetails,
  contact: initialContact,
  bookingSummary: initialBookingSummary,
  workflowRecords = [],
  aiStatus,
}: OwnerWorkspaceProps) {
  const [bossInbox, setBossInbox] = useState<BossInboxItem[]>(initialBossInbox);
  const [tripDetails, setTripDetails] = useState<TripDetails>(initialTripDetails);
  const [contact, setContact] = useState<CapturedContact | undefined>(initialContact);
  const [driverDetails, setDriverDetails] = useState<DriverDetails>(initialBookingSummary.driverDetails ?? {});
  const [paymentMethod, setPaymentMethod] = useState<string>(initialBookingSummary.paymentMethod ?? "Cash to driver after service");
  const [receiptRequest, setReceiptRequest] = useState<ReceiptRequest>(initialBookingSummary.receiptRequest ?? { needed: false });

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQuote, setEditQuote] = useState<Partial<QuoteSuggestion>>({});
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(
    workflowRecords[0]?.inboxItem.id ?? initialBossInbox[0]?.id ?? null,
  );
  const [isSavingFulfillment, setIsSavingFulfillment] = useState(false);
  const [confirmationCopied, setConfirmationCopied] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const selectedRecord = workflowRecords.find((record) => record.inboxItem.id === selectedRecordId);
  const selectedInboxItem = bossInbox.find((item) => item.id === selectedRecordId);
  const allowLocalDrafts = workflowRecords.length === 0 && initialBossInbox.length > 0;

  useEffect(() => {
    if (!selectedRecord) return;
    queueMicrotask(() => {
      setTripDetails(selectedRecord.tripDetails);
      setContact(selectedRecord.contact);
      setDriverDetails(selectedRecord.bookingSummary.driverDetails ?? {});
      setPaymentMethod(selectedRecord.bookingSummary.paymentMethod ?? "Cash to driver after service");
      setReceiptRequest(selectedRecord.bookingSummary.receiptRequest ?? { needed: false });
      setConfirmationSent(false);
    });
  }, [selectedRecord]);

  useEffect(() => {
    if (!allowLocalDrafts) return;
    queueMicrotask(() => {
      const saved = readSavedDashboard();
      if (saved.tripDetails) setTripDetails(saved.tripDetails);
      if ("contact" in saved) setContact(saved.contact);
      if (saved.driverDetails) setDriverDetails(saved.driverDetails);
      if (saved.paymentMethod) setPaymentMethod(saved.paymentMethod);
      if (saved.receiptRequest) setReceiptRequest(saved.receiptRequest);
    });
  }, [allowLocalDrafts]);

  useEffect(() => {
    if (!allowLocalDrafts) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ tripDetails, contact, driverDetails, paymentMethod, receiptRequest }),
      );
    } catch (e) {
      console.warn("Failed to persist dashboard state", e);
    }
  }, [allowLocalDrafts, tripDetails, contact, driverDetails, paymentMethod, receiptRequest]);

  async function persistBossInboxStatus(
    id: string,
    status: BossInboxItem["status"],
    quote?: QuoteSuggestion,
  ) {
    if (!["approved", "edited", "rejected"].includes(status)) return;

    try {
      await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, quote }),
      });
    } catch (e) {
      console.warn("Failed to persist Boss Inbox status", e);
    }
  }

  const approvedQuote = useMemo(
    () => selectedInboxItem?.status === "approved" ? selectedInboxItem.quote : undefined,
    [selectedInboxItem],
  );

  const bookingSummary: BookingSummary = useMemo(
    () => createBookingSummary({ tripDetails, contact, approvedQuote, driverDetails, paymentMethod, receiptRequest }),
    [approvedQuote, contact, driverDetails, paymentMethod, receiptRequest, tripDetails],
  );

  const missingFields = getMissingQuoteFields(tripDetails);
  const quoteFieldTotal = 5;
  const pendingCount = bossInbox.filter((item) => item.status === "pending" || item.status === "edited").length;
  const leadReady = Boolean(contact);

  function updateBossItem(id: string, status: BossInboxItem["status"]) {
    setBossInbox((current) => current.map((i) => (i.id === id ? { ...i, status } : i)));
    void persistBossInboxStatus(id, status, bossInbox.find((item) => item.id === id)?.quote);
  }

  function startEdit(id: string) {
    const item = bossInbox.find((i) => i.id === id);
    if (!item?.quote) return;

    setEditingItemId(id);
    setEditQuote({
      suggestedPrice: item.quote.suggestedPrice,
      currency: item.quote.currency,
      vehicleType: item.quote.vehicleType,
      reason: item.quote.reason,
      includedFees: item.quote.includedFees,
    });

    updateBossItem(id, "edited");
  }

  function cancelEdit() {
    setEditingItemId(null);
    setEditQuote({});
  }

  function saveEdit(id: string, andApprove: boolean = false) {
    const item = bossInbox.find((i) => i.id === id);
    if (!item?.quote) return;

    const updatedQuote: QuoteSuggestion = {
      ...item.quote,
      suggestedPrice: editQuote.suggestedPrice ?? item.quote.suggestedPrice,
      currency: editQuote.currency ?? item.quote.currency,
      vehicleType: editQuote.vehicleType ?? item.quote.vehicleType,
      reason: editQuote.reason ?? item.quote.reason,
      includedFees: editQuote.includedFees ?? item.quote.includedFees,
    };
    const nextStatus = andApprove ? "approved" : "edited";

    setBossInbox((current) =>
      current.map((i) => (i.id === id ? { ...i, quote: updatedQuote, status: nextStatus } : i)),
    );
    void persistBossInboxStatus(id, nextStatus, updatedQuote);

    setEditingItemId(null);
    setEditQuote({});
  }

  function updateDriverDetail(field: keyof DriverDetails, value: string) {
    setDriverDetails((current) => ({ ...current, [field]: value || undefined }));
  }

  function updateReceiptRequest(changes: Partial<ReceiptRequest>) {
    setReceiptRequest((current) => ({ ...current, ...changes }));
  }

  async function saveFulfillment() {
    const bookingId = selectedRecord?.bookingId;
    if (!bookingId) return;

    setIsSavingFulfillment(true);
    try {
      await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, driverDetails, paymentMethod, receiptRequest }),
      });
    } catch (e) {
      console.warn("Failed to persist booking fulfillment", e);
    } finally {
      setIsSavingFulfillment(false);
    }
  }

  async function copyConfirmation() {
    try {
      await navigator.clipboard.writeText(bookingSummary.confirmationText ?? "");
      setConfirmationCopied(true);
      window.setTimeout(() => setConfirmationCopied(false), 2000);
    } catch (e) {
      console.warn("Failed to copy booking confirmation", e);
    }
  }

  async function recordConfirmationSent() {
    const bookingId = selectedRecord?.bookingId;
    if (!bookingId) return;

    try {
      const response = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, sendConfirmation: true }),
      });
      if (response.ok) setConfirmationSent(true);
    } catch (e) {
      console.warn("Failed to record booking confirmation", e);
    }
  }

  return (
    <ErrorBoundary>
      <main className="min-h-screen bg-[#f7f5ef] text-stone-950">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
          <WorkspaceHeader
            title="机场接送指挥中心"
            aiStatus={aiStatus}
            metrics={
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Metric label="线索" value={leadReady ? "1" : "0"} tone="emerald" />
                <Metric label="待处理" value={String(pendingCount)} tone="amber" />
                <Metric label="报价字段" value={`${quoteFieldTotal - missingFields.length}/${quoteFieldTotal}`} tone="indigo" />
                <Metric label="预订" value={bookingSummary.status === "ready" ? "1" : "0"} tone="rose" />
              </div>
            }
          />

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Panel title="老板收件箱" icon={<Inbox size={18} aria-hidden="true" />} action={<StatusPill label={`${pendingCount} 待处理`} />}>
              <div className="space-y-3">
                {bossInbox.length > 0 ? (
                  bossInbox.map((item) => (
                    <BossInboxCard
                      key={item.id}
                      item={item}
                      selected={item.id === selectedRecordId}
                      onSelect={() => setSelectedRecordId(item.id)}
                      onUpdate={updateBossItem}
                      editingId={editingItemId}
                      editForm={editQuote}
                      onStartEdit={startEdit}
                      onSaveEdit={saveEdit}
                      onCancelEdit={cancelEdit}
                      onEditFormChange={(field, value) => setEditQuote((prev) => ({ ...prev, [field]: value }))}
                    />
                  ))
                ) : (
                  <p className="text-sm leading-6 text-stone-600">
                    暂无待处理事项。客户提交报价或特殊请求后，会出现在这里。
                  </p>
                )}
              </div>
            </Panel>

            <aside className="flex min-w-0 flex-col gap-4">
              {selectedRecord && (
                <Panel title="客户对话" icon={<Inbox size={18} aria-hidden="true" />}>
                  <div className="max-h-80 space-y-2 overflow-y-auto">
                    {selectedRecord.messages.length > 0 ? (
                      selectedRecord.messages.map((message) => <ChatBubble key={message.id} message={message} />)
                    ) : (
                      <p className="text-sm leading-6 text-stone-600">暂无对话内容。</p>
                    )}
                  </div>
                </Panel>
              )}

              <Panel title="预订确认" icon={<ClipboardCheck size={18} aria-hidden="true" />}>
                <BookingSummaryView
                  bookingSummary={bookingSummary}
                  onCopyConfirmation={copyConfirmation}
                  confirmationCopied={confirmationCopied}
                  onSendConfirmation={selectedRecord?.bookingId ? recordConfirmationSent : undefined}
                  confirmationSent={confirmationSent}
                />
              </Panel>

              <Panel title="履约跟踪" icon={<Car size={18} aria-hidden="true" />}>
                <FulfillmentTracker
                  driverDetails={driverDetails}
                  paymentMethod={paymentMethod}
                  receiptRequest={receiptRequest}
                  onDriverChange={updateDriverDetail}
                  onPaymentMethodChange={setPaymentMethod}
                  onReceiptChange={updateReceiptRequest}
                  onSave={saveFulfillment}
                  isSaving={isSavingFulfillment}
                />
              </Panel>
            </aside>
          </section>
        </div>
      </main>
    </ErrorBoundary>
  );
}
