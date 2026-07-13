import { redirect } from "next/navigation";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { OwnerWorkspace } from "@/components/owner-workspace";
import { getAIStatus } from "@/lib/ai/server-status";
import { getDemoSnapshot } from "@/lib/domain/airport-transfer";
import { createBookingSummary } from "@/lib/domain/booking-workflow";
import { isConfigured } from "@/lib/supabase/client";
import { getWorkspaceInboxRecords } from "@/lib/supabase/database";
import type { BossInboxItem, WorkspaceWorkflowRecord } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const companyId = await getCurrentCompanyId();
  if (!companyId) {
    redirect("/login");
  }

  const aiStatus = getAIStatus();
  const demo = getDemoSnapshot();
  let bossInbox: BossInboxItem[] = isConfigured() ? [] : demo.bossInbox;
  let workflowRecords: WorkspaceWorkflowRecord[] = [];

  if (isConfigured()) {
    try {
      workflowRecords = await getWorkspaceInboxRecords(companyId);
      bossInbox = workflowRecords.map((record) => record.inboxItem);
    } catch {
      console.warn("Failed to load real workspace records");
    }
  }

  const selectedRecord = workflowRecords[0];
  const emptyBookingSummary = createBookingSummary({ tripDetails: {} });

  return (
    <OwnerWorkspace
      bossInbox={bossInbox}
      tripDetails={selectedRecord?.tripDetails ?? (isConfigured() ? {} : demo.tripDetails)}
      contact={selectedRecord?.contact ?? (isConfigured() ? undefined : demo.contact)}
      bookingSummary={selectedRecord?.bookingSummary ?? (isConfigured() ? emptyBookingSummary : demo.bookingSummary)}
      workflowRecords={workflowRecords}
      aiStatus={aiStatus}
    />
  );
}
