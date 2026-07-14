import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { isConfigured } from "@/lib/supabase/client";
import { isAuthSessionActive } from "@/lib/supabase/saas";

export const sessionCookieName = "ai_employee_session";
const sessionMaxAgeMs = 1000 * 60 * 60 * 24;
export const sessionMaxAgeSeconds = 60 * 60 * 24;

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be configured in production.");
  }
  return "workflowai-dev-session-secret";
}

function signSessionPayload(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export function createSession(companyId: string): string {
  const payload = `${companyId}.${Date.now()}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${signSessionPayload(payload)}`;
}

// Returns the company ID the token was issued for, or null if the token is
// missing, malformed, tampered with, or expired.
export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;

  const [companyId, createdAtText, nonce, signature] = parts;
  const createdAt = Number.parseInt(createdAtText, 10);
  if (!companyId || !Number.isFinite(createdAt) || !nonce) return null;
  if (Date.now() - createdAt > sessionMaxAgeMs) return null;

  const expected = signSessionPayload(`${companyId}.${createdAtText}.${nonce}`);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  return companyId;
}

export async function getCurrentCompanyId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  const companyId = verifySession(token);
  if (!companyId || !isConfigured()) return companyId;

  try {
    return await isAuthSessionActive(companyId, token as string) ? companyId : null;
  } catch {
    // Session revocation is a security boundary in production. Development
    // keeps the compatibility fallback for databases that have not migrated.
    return process.env.NODE_ENV === "production" ? null : companyId;
  }
}

export async function getCurrentSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(sessionCookieName)?.value ?? null;
}
