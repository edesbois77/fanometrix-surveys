"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordPage() {
  const router = useRouter();

  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [error,     setError]     = useState("");
  const [saving,    setSaving]    = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    const res  = await fetch("/api/auth/change-password", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ password }),
    });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(json.error ?? "Failed to update password. Please try again.");
      return;
    }

    router.push("/home");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: "#0B1929" }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">

        {/* Logo */}
        <div className="flex justify-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Fanometrix_Logo.png" alt="Fanometrix" className="h-7 object-contain" />
        </div>

        <h1 className="text-lg font-bold text-gray-900 mb-1 text-center">Create New Password</h1>
        <p className="text-sm text-gray-400 text-center mb-6">
          Your account requires a new password before you can continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-500 text-xs">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-opacity mt-2"
            style={{ background: "#D7B87A", color: "#0B1929" }}
          >
            {saving ? "Saving…" : "Set Password & Continue"}
          </button>
        </form>

        <p className="text-xs text-gray-300 text-center mt-5">
          Passwords are stored securely and cannot be viewed by anyone.
        </p>
      </div>
    </div>
  );
}
