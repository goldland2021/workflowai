"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/");
    } else {
      setError("密码错误");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5ef] p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-stone-300 bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-stone-900">AI 员工后台</h1>
        <label className="grid gap-2 text-sm font-medium text-stone-700">
          管理员密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 rounded-md border border-stone-300 px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            autoFocus
          />
        </label>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          className="mt-4 h-10 w-full rounded-md bg-stone-900 text-sm font-semibold text-white transition hover:bg-stone-800"
        >
          登录
        </button>
      </form>
    </main>
  );
}
