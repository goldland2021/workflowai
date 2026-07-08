import { cookies } from "next/headers";

export const adminSessionCookieName = "ai_employee_admin_session";

function createAdminSessionToken(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${timestamp}-${random}`;
}

export function createAdminSession(): string {
  return createAdminSessionToken();
}

export function verifyAdminSession(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split("-");
  if (parts.length < 2) return false;
  // Basic format check (validates it looks like our generated tokens)
  return parts[0].length >= 5 && parts[1].length >= 6;
}
