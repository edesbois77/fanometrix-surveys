"use client";

import { useState } from "react";
import Link from "next/link";

const NAVY = "#0B1929";
const GOLD = "#D7B87A";

const ROLES = [
  "Brand / Advertiser",
  "Rights Holder",
  "Media Partner / Publisher",
  "Agency",
  "Other",
];

export default function RequestAccessPage() {
  const [form, setForm] = useState({
    name: "", email: "", organisation: "", role: "", message: "",
  });
  const [status,  setStatus]  = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error,   setError]   = useState("");

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("submitting");

    const res  = await fetch("/api/access-requests", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(form),
    });
    const json = await res.json().catch(() => ({}));

    if (res.ok) {
      setStatus("success");
    } else {
      setError(json.error ?? "Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F7F8FA" }}>

      {/* Nav bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Fanometrix_Logo.png"
            alt="Fanometrix"
            style={{
              height: 20,
              objectFit: "contain",
              filter: "brightness(0) saturate(100%) invert(11%) sepia(33%) saturate(1200%) hue-rotate(192deg) brightness(95%)",
            }}
          />
        </Link>
        <Link
          href="/login"
          className="text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
        >
          Already have an account? Log in →
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-lg">

          {status === "success" ? (
            /* ── Success state ── */
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
              <div className="text-4xl mb-5">✓</div>
              <h1 className="text-xl font-bold mb-2" style={{ color: NAVY }}>
                Request received
              </h1>
              <p className="text-sm text-gray-500 leading-relaxed mb-8">
                Thanks for your interest in Fanometrix. We&apos;ll review your request
                and be in touch shortly.
              </p>
              <Link
                href="/"
                className="text-sm font-semibold"
                style={{ color: GOLD }}
              >
                ← Back to homepage
              </Link>
            </div>
          ) : (
            /* ── Form ── */
            <>
              <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold mb-2" style={{ color: NAVY }}>
                  Request Access
                </h1>
                <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
                  Tell us a little about yourself and how you&apos;d like to use Fanometrix.
                  We&apos;ll be in touch to get you set up.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-5"
              >

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => set("name", e.target.value)}
                      required
                      placeholder="Jane Smith"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                      Work Email *
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => set("email", e.target.value)}
                      required
                      placeholder="jane@company.com"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Organisation *
                  </label>
                  <input
                    type="text"
                    value={form.organisation}
                    onChange={e => set("organisation", e.target.value)}
                    required
                    placeholder="Company or organisation name"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    I am a…
                  </label>
                  <select
                    value={form.role}
                    onChange={e => set("role", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors text-gray-700"
                  >
                    <option value="">Select your role (optional)</option>
                    {ROLES.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Anything else?
                  </label>
                  <textarea
                    value={form.message}
                    onChange={e => set("message", e.target.value)}
                    rows={3}
                    placeholder="Tell us how you plan to use Fanometrix, or any questions you have…"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors resize-none"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60"
                  style={{ background: NAVY, color: GOLD }}
                >
                  {status === "submitting" ? "Sending…" : "Send Request"}
                </button>

                <p className="text-xs text-center text-gray-400">
                  We don&apos;t share your details with third parties.
                </p>
              </form>
            </>
          )}
        </div>
      </main>

    </div>
  );
}
