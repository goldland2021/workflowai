import "server-only";

export async function sendAuthLink(params: {
  to: string;
  subject: string;
  url: string;
}): Promise<boolean> {
  const webhookUrl = process.env.AUTH_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn(`Auth email delivery is not configured for ${params.to}.`);
    return false;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    cache: "no-store",
  });
  return response.ok;
}
