"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { APP_URL } from "@/lib/env";
import { MultiSelect } from "@/app/components/MultiSelect";

const NAVY = "#0B1929";
const GOLD = "#D7B87A";

const ROLES = [
  "Brand / Advertiser",
  "Rights Holder",
  "Media Partner / Publisher",
  "Agency",
  "Other",
];

const PUBLISHER_ROLE = "Media Partner / Publisher";

const AUDIENCE_SIZES = ["Under 1M", "1M-5M", "5M-10M", "10M-50M", "50M+"];
const AD_SERVERS = ["Google Ad Manager", "Equativ", "Xandr", "Kevel", "Other"];
const MARKET_OPTIONS = [
  "UK", "US", "Germany", "France", "Spain", "Italy", "LATAM", "MENA", "APAC", "Global",
].map(m => ({ value: m, label: m }));

const SELECT_CLASS = "w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors text-gray-700 bg-white";

function RequestAccessForm() {
  const searchParams = useSearchParams();
  const fromPublisher = searchParams.get("from") === "publisher";

  const [form, setForm] = useState({
    name: "", email: "", organisation: "",
    role: fromPublisher ? PUBLISHER_ROLE : "",
    message: "",
    audience_size: "", ad_server: "",
  });
  const [markets, setMarkets] = useState<string[]>([]);
  const [status,  setStatus]  = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error,   setError]   = useState("");

  const isPublisher = form.role === PUBLISHER_ROLE;

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
      body:    JSON.stringify({ ...form, primary_markets: markets }),
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

      {/* Header — same as the public homepage */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b border-gray-100 px-4 sm:px-10">
        <div className="max-w-[1340px] mx-auto flex items-center justify-between py-4 sm:py-5">
          <Link href="/" className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Fanometrix_Logo.png"
              alt="Fanometrix"
              className="h-4 sm:h-[21px] w-auto shrink-0"
              style={{
                objectFit: "contain",
                filter: "brightness(0) saturate(100%) invert(11%) sepia(33%) saturate(1200%) hue-rotate(192deg) brightness(95%)",
              }}
            />
            <span
              className="shrink-0 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.08em] px-1.5 sm:px-2 py-0.5 rounded-full"
              style={{ background: GOLD, color: NAVY }}
            >
              Beta
            </span>
          </Link>
          <Link
            href={`${APP_URL}/login`}
            className="shrink-0 whitespace-nowrap text-sm font-semibold transition-opacity duration-150 hover:opacity-70"
            style={{ color: NAVY }}
          >
            Sign In
          </Link>
        </div>
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
                  {fromPublisher ? "Run Your First Survey" : "Book A Demo"}
                </h1>
                <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
                  {fromPublisher
                    ? "Tell us about your audience and inventory and we'll help you launch your first Fanometrix campaign."
                    : "Tell us a little about yourself and how you'd like to use Fanometrix. We'll be in touch to get you set up."}
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
                    className={SELECT_CLASS}
                  >
                    <option value="">Select your role (optional)</option>
                    {ROLES.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* Publisher qualification — only shown once Media Partner / Publisher is selected */}
                {isPublisher && (
                  <div className="space-y-5 border-t border-gray-100 pt-5">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Monthly Audience Size
                      </label>
                      <select
                        value={form.audience_size}
                        onChange={e => set("audience_size", e.target.value)}
                        className={SELECT_CLASS}
                      >
                        <option value="">Select a range (optional)</option>
                        {AUDIENCE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Primary Markets
                      </label>
                      <MultiSelect
                        options={MARKET_OPTIONS}
                        selected={markets}
                        onChange={setMarkets}
                        placeholder="Search markets…"
                        strict
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Ad Server
                      </label>
                      <select
                        value={form.ad_server}
                        onChange={e => set("ad_server", e.target.value)}
                        className={SELECT_CLASS}
                      >
                        <option value="">Select your ad server (optional)</option>
                        {AD_SERVERS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                )}

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

export default function RequestAccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: "#F7F8FA" }} />}>
      <RequestAccessForm />
    </Suspense>
  );
}
