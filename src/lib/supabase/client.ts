import "server-only";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function isConfigured(): boolean {
  return Boolean(supabaseUrl && serviceKey);
}

export async function supabaseFetch(
  pathname: string,
  init: RequestInit = {}
): Promise<Response> {
  if (!isConfigured()) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const headers = new Headers(init.headers);
  headers.set("apikey", serviceKey);
  if (!serviceKey.startsWith("sb_secret_")) {
    headers.set("Authorization", `Bearer ${serviceKey}`);
  }

  const url = `${normalizeUrl(supabaseUrl)}${pathname}`;
  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "Unknown error");
    throw new Error(`Supabase request failed: ${response.status} - ${detail.slice(0, 200)}`);
  }

  return response;
}

export { isConfigured, supabaseUrl };
