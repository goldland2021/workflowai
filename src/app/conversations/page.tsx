import { MessageCircle, Search, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAIStatus } from "@/lib/ai/server-status";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { isConfigured } from "@/lib/supabase/client";
import { getBookingByConversationId, getConversations, type ConversationRow } from "@/lib/supabase/database";
import { Panel } from "@/components/owner-workspace/panel";
import { WorkspaceHeader } from "@/components/owner-workspace/workspace-header";

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function matchesQuery(conversation: ConversationRow, query: string): boolean {
  if (!query) return true;
  return [
    conversation.customer_name,
    conversation.contact_method,
    conversation.contact_value,
    conversation.session_id,
    conversation.id,
  ]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(query.toLowerCase()));
}

function bookingSummary(booking: Awaited<ReturnType<typeof getBookingByConversationId>>): string {
  if (!booking) return "暂无预订草稿";
  const route = [booking.pickup_location, booking.dropoff_location].filter(Boolean).join(" → ");
  return [route || "路线待定", booking.date, booking.time, booking.approved_price ? `${booking.currency ?? "USD"} ${booking.approved_price}` : "价格待定"]
    .filter(Boolean)
    .join(" · ");
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const companyId = await getCurrentCompanyId();
  if (!companyId) redirect("/login");

  const query = ((await searchParams)?.q ?? "").trim();
  let conversations: ConversationRow[] = [];

  if (isConfigured()) {
    try {
      conversations = await getConversations(companyId, 100);
    } catch {
      console.warn("Unable to load customer conversations");
    }
  }

  const filteredConversations = conversations.filter((conversation) => matchesQuery(conversation, query));
  const rows = await Promise.all(
    filteredConversations.map(async (conversation) => ({
      conversation,
      booking: isConfigured() ? await getBookingByConversationId(conversation.id, companyId).catch(() => null) : null,
    })),
  );

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-stone-950">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <WorkspaceHeader title="客户对话" aiStatus={getAIStatus()} />

        <Panel title="客户会话" icon={<MessageCircle size={18} aria-hidden="true" />}>
          <form className="flex flex-col gap-2 sm:flex-row" method="get">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} aria-hidden="true" />
              <input
                className="min-h-10 w-full rounded-md border border-stone-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                defaultValue={query}
                name="q"
                placeholder="搜索客户姓名、联系方式或会话 ID"
              />
            </label>
            <button className="min-h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900" type="submit">
              搜索
            </button>
            {query && (
              <Link className="inline-flex min-h-10 items-center justify-center rounded-md border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50" href="/conversations">
                清除
              </Link>
            )}
          </form>

          <div className="mt-4 flex items-center justify-between text-xs text-stone-500">
            <span>{query ? `“${query}”的搜索结果` : "最近 100 个客户会话"}</span>
            <span>{filteredConversations.length} 个会话</span>
          </div>

          {rows.length > 0 ? (
            <div className="mt-3 divide-y divide-stone-200 border-y border-stone-200">
              {rows.map(({ conversation, booking }) => (
                <Link
                  className="block px-1 py-4 transition hover:bg-stone-50 sm:px-2"
                  href={`/conversations/${conversation.id}`}
                  key={conversation.id}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Users className="shrink-0 text-emerald-800" size={16} aria-hidden="true" />
                        <p className="truncate text-sm font-semibold text-stone-950">
                          {conversation.customer_name || "未命名客户"}
                        </p>
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">
                          {conversation.status}
                        </span>
                      </div>
                      <p className="mt-1 truncate pl-6 text-xs text-stone-500">
                        {conversation.contact_method && conversation.contact_value
                          ? `${conversation.contact_method}: ${conversation.contact_value}`
                          : "尚未留下联系方式"}
                      </p>
                      <p className="mt-1 truncate pl-6 text-xs text-stone-600">{bookingSummary(booking)}</p>
                    </div>
                    <span className="shrink-0 text-xs text-stone-500">{formatDate(conversation.updated_at || conversation.created_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-4 border-y border-stone-200 py-10 text-center">
              <MessageCircle className="mx-auto text-stone-400" size={24} aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-stone-700">{query ? "没有匹配的客户会话" : "还没有客户会话"}</p>
              <p className="mt-1 text-xs text-stone-500">客户通过网站 Widget 发起对话后，会出现在这里。</p>
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}
