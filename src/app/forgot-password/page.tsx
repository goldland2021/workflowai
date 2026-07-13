"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setSent(true);
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5ef] p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-stone-300 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-stone-900">找回密码</h1>
        <p className="mb-6 text-sm leading-6 text-stone-600">输入注册邮箱后，如果账号存在，我们会发送重置链接。</p>
        <label className="grid gap-2 text-sm font-medium text-stone-700">
          邮箱
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 rounded-md border border-stone-300 px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            required
          />
        </label>
        {sent && <p className="mt-3 text-sm text-emerald-700">请求已提交，请检查邮箱。</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-4 h-10 w-full rounded-md bg-stone-900 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
        >
          {submitting ? "提交中…" : "发送重置链接"}
        </button>
        <p className="mt-4 text-center text-sm text-stone-500">
          <Link href="/login" className="font-medium text-emerald-700 hover:underline">返回登录</Link>
        </p>
      </form>
    </main>
  );
}
