"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/app/components/SessionProvider";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: username.trim(), password }),
      });

      if (res.ok) {
        // Populate the session context before navigating so the nav renders
        // with the correct role immediately — without this, AdminShell sees
        // the stale user:null from before login and shows only Home.
        await refresh();
        const next = searchParams.get("next") || "/home";
        router.push(next);
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Invalid username or password");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: "#0B1929" }}>
          Username
        </label>
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors"
          placeholder="your_username"
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: "#0B1929" }}>
          Password
        </label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors"
          placeholder="••••••••"
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60"
        style={{ background: "#0B1929", color: "#D7B87A" }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "#F7F8FA" }}
    >
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-10">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "#0B1929" }}
          >
            Fanometrix
          </h1>
          <p className="text-sm text-gray-400 mt-1">Fan Insight Platform</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-lg font-semibold mb-6" style={{ color: "#0B1929" }}>
            Sign in to your account
          </h2>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

      </div>
    </div>
  );
}
