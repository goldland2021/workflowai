import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const sessionCookieName = "ai_employee_session";
const sessionMaxAgeMs = 1000 * 60 * 60 * 24;

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || "workflowai-dev-session-secret";
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
  return verifySession(cookieStore.get(sessionCookieName)?.value);
}
