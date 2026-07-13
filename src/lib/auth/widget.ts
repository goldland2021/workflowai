import { createHmac, timingSafeEqual } from "crypto";

function getWidgetSigningSecret(): string {
  if (process.env.WIDGET_TOKEN_SECRET) return process.env.WIDGET_TOKEN_SECRET;
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("WIDGET_TOKEN_SECRET or SESSION_SECRET must be configured in production.");
  }
  return "workflowai-dev-widget-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", getWidgetSigningSecret()).update(payload).digest("base64url");
}

export function createWidgetToken(companyId: string, version = 1): string {
  const payload = `${companyId}.${version}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyWidgetToken(companyId: string, token: string | undefined, expectedVersion = 1): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== companyId || parts[1] !== String(expectedVersion)) return false;

  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
  const actual = Buffer.from(parts[2]);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizeWidgetOrigin(value: string): string | null {
  try {
    const origin = new URL(value).origin;
    if (!origin.startsWith("http://") && !origin.startsWith("https://")) return null;
    return origin;
  } catch {
    return null;
  }
}

export function isWidgetOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  const normalized = origin ? normalizeWidgetOrigin(origin) : null;
  if (!normalized) return false;
  return allowedOrigins.some((allowed) => allowed === normalized);
}
