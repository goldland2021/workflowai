import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const adminSessionCookieName = "ai_employee_admin_session";
const adminSessionMaxAgeMs = 1000 * 60 * 60 * 24;

function getAdminSessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "workflowai-dev-session-secret";
}

function signSessionPayload(payload: string): string {
  return createHmac("sha256", getAdminSessionSecret()).update(payload).digest("base64url");
}

export function createAdminSession(): string {
  const payload = `${Date.now()}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${signSessionPayload(payload)}`;
}

export function verifyAdminSession(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [createdAtText, nonce, signature] = parts;
  const createdAt = Number.parseInt(createdAtText, 10);
  if (!Number.isFinite(createdAt) || !nonce) return false;
  if (Date.now() - createdAt > adminSessionMaxAgeMs) return false;

  const expected = signSessionPayload(`${createdAtText}.${nonce}`);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function hasAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSession(cookieStore.get(adminSessionCookieName)?.value);
}
