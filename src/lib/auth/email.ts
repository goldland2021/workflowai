import "server-only";

export async function sendAuthLink(params: {
  to: string;
  subject: string;
  url: string;
}): Promise<boolean> {
  const webhookUrl = process.env.AUTH_EMAIL_WEBHOOK_URL;
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      cache: "no-store",
    });
    return response.ok;
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!resendApiKey || !from) {
    console.warn("Auth email delivery is not configured.");
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: `<p><a href="${escapeHtml(params.url)}">Continue to WorkflowAI</a></p><p>${escapeHtml(params.url)}</p>`,
    }),
    cache: "no-store",
  });
  return response.ok;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
