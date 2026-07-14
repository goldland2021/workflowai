"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || password !== confirmed || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setMessage("请确认链接有效、两次密码一致，并使用至少 8 位且包含字母和数字的密码。");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/password-reset/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      setMessage(response.ok ? "密码已更新，请重新登录。" : "重置链接已失效，请重新申请。");
    } catch {
      setMessage("操作失败，请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5ef] p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-stone-300 bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-stone-900">设置新密码</h1>
        <label className="grid gap-2 text-sm font-medium text-stone-700">
          新密码（至少 8 位，包含字母和数字）
          <input type="password" minLength={8} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,}" value={password} onChange={(event) => setPassword(event.target.value)} className="h-10 rounded-md border border-stone-300 px-3 text-sm" required />
        </label>
        <label className="mt-4 grid gap-2 text-sm font-medium text-stone-700">
          确认密码
          <input type="password" minLength={8} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,}" value={confirmed} onChange={(event) => setConfirmed(event.target.value)} className="h-10 rounded-md border border-stone-300 px-3 text-sm" required />
        </label>
        {message && <p className="mt-3 text-sm text-stone-600">{message}</p>}
        <button type="submit" disabled={submitting || !token} className="mt-4 h-10 w-full rounded-md bg-stone-900 text-sm font-semibold text-white disabled:opacity-50">
          {submitting ? "更新中…" : "更新密码"}
        </button>
        <p className="mt-4 text-center text-sm text-stone-500"><Link href="/login" className="font-medium text-emerald-700 hover:underline">返回登录</Link></p>
      </form>
    </main>
  );
}
