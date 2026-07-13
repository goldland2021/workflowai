import { ArrowLeft, CalendarDays, Contact, MessageCircle, ReceiptText } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAIStatus } from "@/lib/ai/server-status";
import { getCurrentCompanyId } from "@/lib/auth/admin";
import { isConfigured } from "@/lib/supabase/client";
import { getBookingByConversationId, getConversationById, getMessages, type BookingRow, type ConversationRow, type MessageRow } from "@/lib/supabase/database";
import { Panel } from "@/components/owner-workspace/panel";
import { WorkspaceHeader } from "@/components/owner-workspace/workspace-header";

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function messageLabel(role: string): string {
  if (role === "customer") return "客户";
  if (role === "owner") return "老板";
  if (role === "system") return "系统";
  return "AI员工";
}

function bookingRoute(booking: BookingRow): string {
  return [booking.pickup_location, booking.dropoff_location].filter(Boolean).join(" → ") || "路线待定";
}

function timelineItems(conversation: ConversationRow, booking: BookingRow | null, messages: MessageRow[]) {
  const items = [
    { label: "客户会话创建", detail: formatDate(conversation.created_at), icon: MessageCircle },
  ];

  if (conversation.contact_value) {
    items.push({
      label: "已捕获联系方式",
      detail: `${conversation.contact_method ?? "联系方式"}: ${conversation.contact_value}`,
      icon: Contact,
    });
  }

  if (booking) {
    items.push({
      label: booking.status === "ready" ? "预订已准备" : "已生成预订草稿",
      detail: `${bookingRoute(booking)} · ${booking.date ?? "日期待定"} ${booking.time ?? "时间待定"}`,
      icon: CalendarDays,
    });
    if (booking.receipt_needed) {
      items.push({
        label: "客户需要收据",
        detail: booking.receipt_name || "已标记收据需求",
        icon: ReceiptText,
      });
    }
  }

  if (messages.length > 0) {
    items.push({
      label: "最近一次消息",
      detail: formatDate(messages[messages.length - 1].created_at),
      icon: MessageCircle,
    });
  }

  return items;
}

export default async function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const companyId = await getCurrentCompanyId();
  if (!companyId) redirect("/login");
  if (!isConfigured()) notFound();

  const { id } = await params;
  const conversation = await getConversationById(id, companyId);
  if (!conversation) notFound();

  const [messages, booking] = await Promise.all([
    getMessages(conversation.id),
    getBookingByConversationId(conversation.id, companyId),
  ]);
  const timeline = timelineItems(conversation, booking, messages);

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-stone-950">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <WorkspaceHeader title="客户对话详情" aiStatus={getAIStatus()} />

        <Link className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline" href="/conversations">
          <ArrowLeft size={16} aria-hidden="true" /> 返回客户对话
        </Link>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.8fr)]">
          <Panel title={conversation.customer_name || "未命名客户"} icon={<MessageCircle size={18} aria-hidden="true" />}>
            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 border-b border-stone-200 pb-3 text-xs text-stone-500">
              <span>状态：{conversation.status}</span>
              <span>开始：{formatDate(conversation.created_at)}</span>
              <span className="max-w-full truncate">会话：{conversation.id}</span>
            </div>
            {conversation.contact_value && (
              <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                联系方式：{conversation.contact_method ?? "未知"} · {conversation.contact_value}
              </p>
            )}

            {messages.length > 0 ? (
              <div className="space-y-3">
                {messages.map((message) => {
                  const isCustomer = message.role === "customer";
                  return (
                    <div className={`flex ${isCustomer ? "justify-start" : "justify-end"}`} key={message.id}>
                      <div className={`max-w-[92%] rounded-md border px-3 py-2 sm:max-w-[78%] ${
                        isCustomer ? "border-stone-200 bg-white" : "border-emerald-200 bg-emerald-50"
                      }`}>
                        <div className="flex items-center justify-between gap-3 text-[10px] font-semibold text-stone-500">
                          <span>{messageLabel(message.role)}</span>
                          <time dateTime={message.created_at}>{formatDate(message.created_at)}</time>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-800">{message.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-stone-500">这个会话还没有消息。</p>
            )}
          </Panel>

          <div className="flex flex-col gap-5">
            <Panel title="客户时间线" icon={<CalendarDays size={18} aria-hidden="true" />}>
              <div className="space-y-4">
                {timeline.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div className="flex gap-3" key={`${item.label}-${item.detail}`}>
                      <Icon className="mt-0.5 shrink-0 text-emerald-800" size={16} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-stone-800">{item.label}</p>
                        <p className="mt-0.5 break-words text-xs leading-5 text-stone-500">{item.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="预订信息" icon={<ReceiptText size={18} aria-hidden="true" />}>
              {booking ? (
                <div className="space-y-2 text-xs text-stone-700">
                  <p><span className="text-stone-500">路线：</span>{bookingRoute(booking)}</p>
                  <p><span className="text-stone-500">时间：</span>{booking.date ?? "待定"} {booking.time ?? "待定"}</p>
                  <p><span className="text-stone-500">乘客：</span>{booking.passenger_count ?? "待定"} · 行李 {booking.luggage_count ?? "待定"}</p>
                  <p><span className="text-stone-500">车型：</span>{booking.vehicle_preference ?? "待定"}</p>
                  <p><span className="text-stone-500">价格：</span>{booking.approved_price != null ? `${booking.currency ?? "USD"} ${booking.approved_price}` : "待老板审批"}</p>
                  <p><span className="text-stone-500">状态：</span>{booking.status ?? "draft"}</p>
                </div>
              ) : (
                <p className="text-sm leading-6 text-stone-600">该客户还没有预订草稿。</p>
              )}
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}
