"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { useSession } from "@/app/components/SessionProvider";
import { getHomeSections, type NavItemConfig } from "@/lib/nav-config";
import type { UserRole } from "@/lib/auth";

// ─── KPI data (admin only) ────────────────────────────────────────────────────
type Kpis = {
  activeCampaigns: number;
  totalResponses:  number;
  activeSurveys:   number;
  liveGroups:      number;
};

function useAdminKpis(isAdmin: boolean) {
  const [kpis,    setKpis]    = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchKpis = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [camRes, surRes, grpRes] = await Promise.all([
        fetch("/api/campaigns"),
        fetch("/api/surveys"),
        fetch("/api/campaign-groups"),
      ]);
      const campaigns: Record<string, unknown>[] = (await camRes.json()).data ?? [];
      const surveys:   Record<string, unknown>[] = (await surRes.json()).data ?? [];
      const groups:    Record<string, unknown>[] = (await grpRes.json()).data ?? [];

      setKpis({
        activeCampaigns: campaigns.filter(c => {
          const s = (c.effective_status ?? c.status) as string;
          return s === "live" || s === "scheduled";
        }).length,
        totalResponses: campaigns.reduce((sum, c) => sum + ((c.response_count as number) ?? 0), 0),
        activeSurveys:  surveys.filter(s => s.status === "ready").length,
        liveGroups:     groups.filter(g => g.status === "live").length,
      });
    } catch {
      setKpis({ activeCampaigns: 0, totalResponses: 0, activeSurveys: 0, liveGroups: 0 });
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);
  return { kpis, loading };
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({
  value, label, href, linkLabel,
}: {
  value: number | string;
  label: string;
  href:  string;
  linkLabel: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col
                 transition-all duration-200 hover:bg-[#0B1929] hover:border-[#0B1929]
                 hover:-translate-y-0.5 hover:shadow-md
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] focus-visible:ring-offset-2"
    >
      <p className="text-2xl font-bold text-[#0B1929] group-hover:text-white transition-colors duration-200">
        {value}
      </p>
      <p className="text-xs text-gray-400 group-hover:text-white/60 mt-0.5 flex-1 transition-colors duration-200">
        {label}
      </p>
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
function NavCard({ item }: { item: NavItemConfig }) {
  const linkProps = item.external
    ? { target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  return (
    <Link
      href={item.href}
      {...linkProps}
      className={[
        "group flex flex-col p-5 rounded-xl border cursor-pointer",
        "bg-white border-gray-100 shadow-sm",
        "transition-all duration-200",
        "hover:bg-[#0B1929] hover:border-[#0B1929] hover:-translate-y-1 hover:shadow-lg",
        "active:scale-[0.98] active:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] focus-visible:ring-offset-2",
      ].join(" ")}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg mb-3 flex-shrink-0
        bg-[#F0F4F8] text-[#0B1929]
        group-hover:bg-white/10 group-hover:text-white
        transition-colors duration-200">
        {item.icon}
      </div>
      <h2 className="font-semibold text-sm mb-1.5
        text-[#0B1929] group-hover:text-white
        transition-colors duration-200">
        {item.label}
        {item.external && (
          <span className="ml-1 text-[10px] opacity-40">↗</span>
        )}
      </h2>
      <p className="text-xs flex-1 leading-relaxed mb-3
        text-gray-400 group-hover:text-white/70
        transition-colors duration-200">
        {item.description}
      </p>
      <span className="text-xs font-semibold text-[#D7B87A]">
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
            <p className="text-sm text-gray-400">
              {user.username} · <span className="capitalize">{user.role}</span>
            </p>
          )}
        </div>

        {/* ── Admin: KPI summary ── */}
        {isAdmin && (
          <div className="mb-8">
            {/* KPI card row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {kpisLoading || !kpis ? (
                Array.from({ length: 4 }, (_, i) => (
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
                  />
                  <KpiCard
                    value={kpis.totalResponses.toLocaleString()}
                    label="Total Responses"
                    href="/dashboard"
                    linkLabel="Open Dashboard"
                  />
                  <KpiCard
                    value={kpis.activeSurveys}
                    label="Ready Surveys"
                    href="/survey-templates"
                    linkLabel="Manage Surveys"
                  />
                  <KpiCard
                    value={kpis.liveGroups}
                    label="Live Campaign Groups"
                    href="/campaign-groups"
                    linkLabel="View Groups"
                  />
                </>
              )}
            </div>

            {/* Dashboard CTA */}
            <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-5 py-3.5 shadow-sm">
              <p className="text-sm text-gray-500">View live response data, trend charts and audience breakdowns.</p>
              <Link
                href="/dashboard"
                className="flex-shrink-0 ml-4 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
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
              // Pick the column count that keeps all items on the same row
              const cols =
                items.length === 4 ? "grid-cols-2 sm:grid-cols-4" :
                items.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
                                     "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
              return (
                <div key={label || "cards"}>
                  {label && <SectionHeading label={label} />}
                  <div className={`grid gap-4 ${cols}`}>
                    {items.map(item => (
                      <NavCard key={item.href} item={item} />
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
