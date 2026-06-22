"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { useSession } from "@/app/components/SessionProvider";
import { getHomeSections, type NavItemConfig } from "@/lib/nav-config";
import type { UserRole } from "@/lib/auth";

// ─── Feature flag ─────────────────────────────────────────────────────────────
// Set to false to instantly revert all card branding to plain white cards.
const ENABLE_CARD_BRANDING = true;

// ─── KPI data (admin only) ────────────────────────────────────────────────────
type Kpis = {
  activeCampaigns: number;
  totalResponses:  number;
  activeSurveys:   number;
  liveGroups:      number;
  activeSessions:  number;
};

function useAdminKpis(isAdmin: boolean) {
  const [kpis,    setKpis]    = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchKpis = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [camRes, surRes, grpRes, sesRes] = await Promise.all([
        fetch("/api/campaigns"),
        fetch("/api/surveys"),
        fetch("/api/campaign-groups"),
        fetch("/api/admin/active-sessions"),
      ]);
      const campaigns: Record<string, unknown>[] = (await camRes.json()).data ?? [];
      const surveys:   Record<string, unknown>[] = (await surRes.json()).data ?? [];
      const groups:    Record<string, unknown>[] = (await grpRes.json()).data ?? [];
      const sessions:  { count: number }         = await sesRes.json();

      setKpis({
        activeCampaigns: campaigns.filter(c => {
          const s = (c.effective_status ?? c.status) as string;
          return s === "live" || s === "scheduled";
        }).length,
        totalResponses: campaigns.reduce((sum, c) => sum + ((c.response_count as number) ?? 0), 0),
        activeSurveys:  surveys.filter(s => s.status === "ready").length,
        liveGroups:     groups.filter(g => g.status === "live").length,
        activeSessions: sessions.count ?? 0,
      });
    } catch {
      setKpis({ activeCampaigns: 0, totalResponses: 0, activeSurveys: 0, liveGroups: 0, activeSessions: 0 });
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);
  return { kpis, loading };
}

// ─── Publisher KPI data ───────────────────────────────────────────────────────
type PublisherKpis = {
  totalResponses:    number;
  responsesThisWeek: number;
  activeCampaigns:   number;
  publisherCount:    number;
};

function usePublisherKpis(active: boolean) {
  const [kpis,    setKpis]    = useState<PublisherKpis | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const res  = await fetch("/api/publisher/stats");
      const json = await res.json();
      setKpis(json);
    } catch {
      setKpis({ totalResponses: 0, responsesThisWeek: 0, activeCampaigns: 0, publisherCount: 0 });
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => { fetch_(); }, [fetch_]);
  return { kpis, loading };
}

// ─── KPI accent colour rules ──────────────────────────────────────────────────
const GREY  = "#9CA3AF";
const GOLD  = "#D7B87A";
const GREEN = "#22C55E";
const BLUE  = "#3B82F6";

function kpiAccent(metric: "activeCampaigns" | "totalResponses" | "activeSurveys" | "liveGroups" | "activeSessions", value: number): string {
  switch (metric) {
    case "activeCampaigns":  return value === 0 ? GREY : GREEN;
    case "totalResponses":   return value === 0 ? GREY : value < 100 ? GOLD : GREEN;
    case "activeSurveys":    return value === 0 ? GREY : GOLD;
    case "liveGroups":       return value === 0 ? GREY : GREEN;
    case "activeSessions":   return value === 0 ? GREY : value < 5 ? BLUE : GREEN;
  }
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({
  value, label, href, linkLabel, accent,
}: {
  value:     number | string;
  label:     string;
  href:      string;
  linkLabel: string;
  accent:    string;
}) {
  return (
    <Link
      href={href}
      className="group relative bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col
                 overflow-hidden transition-all duration-200 hover:bg-[#0B1929] hover:border-[#0B1929]
                 hover:-translate-y-0.5 hover:shadow-md
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] focus-visible:ring-offset-2"
    >
      {/* 3px accent top border */}
      <div className="absolute top-0 left-0 right-0" style={{ height: 3, background: accent }} />

      {/* KPI number in accent colour */}
      <p className="text-2xl font-bold group-hover:text-white transition-colors duration-200 mt-1"
        style={{ color: accent }}>
        {value}
      </p>

      {/* Status dot + label */}
      <div className="flex items-center gap-1.5 mt-0.5 flex-1">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-opacity duration-200 group-hover:opacity-60"
          style={{ background: accent }} />
        <p className="text-xs text-gray-400 group-hover:text-white/60 transition-colors duration-200">
          {label}
        </p>
      </div>

      <p className="text-xs font-semibold text-[#D7B87A] mt-3">{linkLabel} →</p>
    </Link>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────
function SectionHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

// ─── Nav card ─────────────────────────────────────────────────────────────────
function NavCard({
  item, large, branded, devPattern,
}: {
  item: NavItemConfig;
  large?: boolean;
  /** Option A — ghost F watermark, bottom-right */
  branded?: boolean;
  /** Option B — subtle gold grid pattern (developer cards) */
  devPattern?: boolean;
}) {
  const linkProps = item.external
    ? { target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  return (
    <Link
      href={item.href}
      {...linkProps}
      className={[
        "group relative flex flex-col rounded-xl border cursor-pointer overflow-hidden",
        large ? "p-6" : "p-5",
        "bg-white border-gray-100 shadow-sm",
        "transition-all duration-200",
        "hover:bg-[#0B1929] hover:border-[#0B1929] hover:-translate-y-1 hover:shadow-lg",
        "active:scale-[0.98] active:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] focus-visible:ring-offset-2",
      ].join(" ")}
    >
      {/* ── Option A: Ghost F watermark ── */}
      {ENABLE_CARD_BRANDING && branded && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/FLogo.png"
          alt=""
          aria-hidden
          style={{
            position: "absolute",
            bottom: 4,
            right: 4,
            width: 20,
            height: 20,
            opacity: 1,
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
      )}

      {/* ── Option B: Subtle gold grid pattern (developer cards) ── */}
      {ENABLE_CARD_BRANDING && devPattern && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            backgroundImage: [
              "linear-gradient(rgba(215,184,122,0.07) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(215,184,122,0.07) 1px, transparent 1px)",
            ].join(","),
            backgroundSize: "32px 32px",
            pointerEvents: "none",
          }}
        />
      )}

      <div className={[
        "rounded-lg flex items-center justify-center flex-shrink-0",
        large ? "w-12 h-12 text-2xl mb-4" : "w-9 h-9 text-lg mb-3",
        "bg-[#F0F4F8] text-[#0B1929]",
        "group-hover:bg-white/10 group-hover:text-white",
        "transition-colors duration-200",
      ].join(" ")}>
        {item.icon}
      </div>
      <h2 className={[
        "font-semibold mb-2",
        large ? "text-base" : "text-sm mb-1.5",
        "text-[#0B1929] group-hover:text-white",
        "transition-colors duration-200",
      ].join(" ")}>
        {item.label}
        {item.external && (
          <span className="ml-1 text-[10px] opacity-40">↗</span>
        )}
      </h2>
      <p className={[
        "flex-1 leading-relaxed mb-4",
        large ? "text-sm" : "text-xs mb-3",
        "text-gray-400 group-hover:text-white/70",
        "transition-colors duration-200",
      ].join(" ")}>
        {item.description}
      </p>
      <span className={`font-semibold text-[#D7B87A] ${large ? "text-sm" : "text-xs"}`}>
        {item.cta} →
      </span>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { user, loading } = useSession();
  const role    = (user?.role ?? "brand") as UserRole;
  const isAdmin = role === "admin";

  const { kpis, loading: kpisLoading } = useAdminKpis(isAdmin);
  const isPublisher = role === "publisher" || role === "agency";
  const { kpis: pubKpis, loading: pubLoading } = usePublisherKpis(isPublisher);

  const sections = getHomeSections(role);

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">

        {/* ── Welcome header ── */}
        <div className="mb-6">
          {loading ? (
            <div className="h-8 w-48 bg-gray-100 rounded-lg animate-pulse mb-2" />
          ) : (
            <h1 className="text-2xl font-bold mb-0.5" style={{ color: "#0B1929" }}>
              Welcome back{user ? `, ${user.organisationName || user.username}` : ""}.
            </h1>
          )}
          {user && (
            <p className="text-sm text-gray-400 capitalize">{user.role}</p>
          )}
        </div>

        {/* ── Publisher / Agency: KPI summary ── */}
        {isPublisher && (
          <div className="mb-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {pubLoading || !pubKpis ? (
                Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm animate-pulse">
                    <div className="h-7 w-12 bg-gray-100 rounded mb-2" />
                    <div className="h-3 w-24 bg-gray-100 rounded" />
                  </div>
                ))
              ) : (
                <>
                  <KpiCard
                    value={pubKpis.totalResponses.toLocaleString()}
                    label="Total Responses"
                    href="/dashboard"
                    linkLabel="Open Dashboard"
                    accent={pubKpis.totalResponses === 0 ? GREY : pubKpis.totalResponses < 100 ? GOLD : GREEN}
                  />
                  <KpiCard
                    value={pubKpis.responsesThisWeek.toLocaleString()}
                    label="Responses This Week"
                    href="/dashboard"
                    linkLabel="View Trend"
                    accent={pubKpis.responsesThisWeek === 0 ? GREY : pubKpis.responsesThisWeek < 10 ? GOLD : GREEN}
                  />
                  <KpiCard
                    value={pubKpis.activeCampaigns}
                    label="Live Campaigns"
                    href="/dashboard"
                    linkLabel="View Campaigns"
                    accent={pubKpis.activeCampaigns === 0 ? GREY : GREEN}
                  />
                  <KpiCard
                    value={pubKpis.publisherCount}
                    label={pubKpis.publisherCount === 1 ? "Publisher" : "Publishers"}
                    href="/publisher-performance"
                    linkLabel="View Performance"
                    accent={pubKpis.publisherCount === 0 ? GREY : BLUE}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Admin: KPI summary ── */}
        {isAdmin && (
          <div className="mb-8">
            {/* KPI card row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
              {kpisLoading || !kpis ? (
                Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm animate-pulse">
                    <div className="h-7 w-12 bg-gray-100 rounded mb-2" />
                    <div className="h-3 w-24 bg-gray-100 rounded" />
                  </div>
                ))
              ) : (
                <>
                  <KpiCard
                    value={kpis.activeCampaigns}
                    label="Active Campaigns"
                    href="/campaigns"
                    linkLabel="View Campaigns"
                    accent={kpiAccent("activeCampaigns", kpis.activeCampaigns)}
                  />
                  <KpiCard
                    value={kpis.totalResponses.toLocaleString()}
                    label="Total Responses"
                    href="/dashboard"
                    linkLabel="Open Dashboard"
                    accent={kpiAccent("totalResponses", kpis.totalResponses)}
                  />
                  <KpiCard
                    value={kpis.activeSurveys}
                    label="Ready Surveys"
                    href="/survey-templates"
                    linkLabel="Manage Surveys"
                    accent={kpiAccent("activeSurveys", kpis.activeSurveys)}
                  />
                  <KpiCard
                    value={kpis.liveGroups}
                    label="Live Campaign Groups"
                    href="/campaign-groups"
                    linkLabel="View Groups"
                    accent={kpiAccent("liveGroups", kpis.liveGroups)}
                  />
                  <KpiCard
                    value={kpis.activeSessions}
                    label="Active Sessions (10 min)"
                    href="/user-management"
                    linkLabel="View Accounts"
                    accent={kpiAccent("activeSessions", kpis.activeSessions)}
                  />
                </>
              )}
            </div>

            {/* Dashboard CTA — navy + large F watermark when branded, clean white when not */}
            <div className={[
              "relative flex items-center justify-between rounded-xl px-5 py-3.5 shadow-sm overflow-hidden",
              ENABLE_CARD_BRANDING
                ? "bg-[#0B1929] border border-[#0B1929]"
                : "bg-white border border-gray-100",
            ].join(" ")}>
              {ENABLE_CARD_BRANDING && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/FLogo.png"
                  alt=""
                  aria-hidden
                  style={{
                    position: "absolute",
                    right: -30,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 130,
                    height: 130,
                    opacity: 0.12,
                    filter: "blur(1px)",
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                />
              )}
              <p className={`text-sm relative z-10 ${ENABLE_CARD_BRANDING ? "text-white/60" : "text-gray-500"}`}>
                View live response data, trend charts and audience breakdowns.
              </p>
              <Link
                href="/dashboard"
                className="flex-shrink-0 ml-4 text-sm font-semibold px-4 py-2 rounded-lg transition-colors relative z-10"
                style={{ background: "#D7B87A", color: "#0B1929" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#C9A766"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#D7B87A"; }}
              >
                Open Dashboard →
              </Link>
            </div>
          </div>
        )}

        {/* ── Navigation card sections ── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
                <div className="h-9 w-9 bg-gray-100 rounded-lg mb-3" />
                <div className="h-4 w-28 bg-gray-100 rounded mb-2" />
                <div className="h-3 w-full bg-gray-100 rounded mb-1" />
                <div className="h-3 w-3/4 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {sections.map(({ label, items }) => {
              const isPlatform = label === "Platform Management";
              const isDev      = label === "Development";

              // Platform: 2×2 large cards. Administration: compact 4-across.
              // Everything else: standard 3-column grid.
              const cols = isPlatform
                ? "grid-cols-2"
                : items.length === 4
                  ? "grid-cols-2 sm:grid-cols-4"
                  : items.length === 2
                    ? "grid-cols-1 sm:grid-cols-2"
                    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

              return (
                <div key={label || "cards"}>
                  {label && <SectionHeading label={label} />}
                  <div className={`grid gap-4 ${cols}`}>
                    {items.map(item => (
                      <NavCard
                        key={item.href}
                        item={item}
                        large={isPlatform}
                        branded={!isDev}     /* Option A: F watermark on all non-dev cards */
                        devPattern={isDev}   /* Option B: grid pattern on developer cards   */
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </AdminShell>
  );
}
