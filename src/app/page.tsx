import { OwnerWorkspace } from "@/components/owner-workspace";
import { getAIStatus } from "@/lib/ai/server-status";
import { getDemoSnapshot } from "@/lib/domain/airport-transfer";

export default function Home() {
  const snapshot = getDemoSnapshot();
  const aiStatus = getAIStatus();

  return <OwnerWorkspace snapshot={snapshot} aiStatus={aiStatus} />;
}
