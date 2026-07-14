"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, email, password }),
      });

      if (res.ok) {
        router.push("/");
        return;
      }

      const data = await res.json().catch(() => null);
      setError(data?.error ?? "注册失败");
    } catch {
      setError("注册失败，请检查网络后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5ef] p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-stone-300 bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-stone-900">注册 AI 员工账号</h1>
        <label className="grid gap-2 text-sm font-medium text-stone-700">
          公司名称
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="h-10 rounded-md border border-stone-300 px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            autoFocus
            required
          />
        </label>
        <label className="mt-4 grid gap-2 text-sm font-medium text-stone-700">
          邮箱
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 rounded-md border border-stone-300 px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            required
          />
        </label>
        <label className="mt-4 grid gap-2 text-sm font-medium text-stone-700">
          密码（至少 8 位，包含字母和数字）
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,}"
            className="h-10 rounded-md border border-stone-300 px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            required
          />
        </label>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-4 h-10 w-full rounded-md bg-stone-900 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
        >
          {submitting ? "创建中…" : "创建账号"}
        </button>
        <p className="mt-4 text-center text-sm text-stone-500">
          已有账号？{" "}
          <Link href="/login" className="font-medium text-emerald-700 hover:underline">
            去登录
          </Link>
        </p>
      </form>
    </main>
  );
}
