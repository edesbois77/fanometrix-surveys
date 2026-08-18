"use client";

// ── CreateLanding — the Create entry point (does NOT create on load) ─────────
// The sidebar "Create" nav item is a DESTINATION, not an action: landing here
// must never mint a draft. A new `surveys` row is created ONLY when the user
// explicitly clicks "New survey" (the existing governed POST /api/surveys), and
// "Resume draft" routes back into the user's most recent in-progress draft.
//
// Below Resume, "Continue a draft" lists EVERY in-progress draft for the current
// organisation (newest first, searchable). This closes the gap where Create used
// to surface only the single most-recently-updated draft: with more than one
// draft, any older one had nowhere to appear in Survey Studio (Manage — the
// intended full library — is still a placeholder), so it looked "lost" even
// though it was safe in the database. The list is the org-scoped GET /api/surveys
// (no new endpoint); the fuller archived/ready/deleted library still belongs in
// Manage. Existing deep links to /survey-studio/create/[surveyId] are unchanged.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/app/components/SessionProvider";
import { StudioContainer } from "../StudioContainer";
import { StudioIcon } from "../studio-icons";
import { Eyebrow, Button, Card, Skeleton } from "@/app/components/workspace-ui";
import { DEFAULT_STAGE } from "./create-stages";

type Resumable = { id: string; name: string; whenLabel: string };

// A row in the "Continue a draft" list. Relative labels are precomputed at load
// (never during render) so this component stays render-pure.
type DraftRow = {
  id: string;
  name: string;
  whenLabel: string;
  questionCount: number;
  campaignCount: number;
  liveCampaignCount: number;
  createdBy: string | null;
  mine: boolean;
};

// Relative time — only ever called from an effect / loader (never during render),
// so it doesn't break the render-purity rule.
function relativeLabel(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

export function CreateLanding() {
  const router = useRouter();
  const { user } = useSession();
  const workEmail = user?.workEmail ?? null;
  const [resumable, setResumable] = useState<Resumable | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Per-row delete state: which row is confirming, which is mid-delete, and any
  // row-level error (e.g. a draft still linked to campaigns can't be deleted).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const creatingRef = useRef(false);

  // Load every in-progress draft for the org (the org-scoped GET /api/surveys),
  // newest first. "Resume" is the current user's most recent draft (so it is
  // unambiguous); the full list shows ALL drafts so none can be hidden behind it.
  const loadDrafts = useCallback(async () => {
    try {
      const res = await fetch("/api/surveys");
      if (!res.ok) { setDrafts([]); return; }
      const json = await res.json();
      const rows = (json.data ?? []) as Array<Record<string, unknown>>;
      const allDrafts = rows.filter((r) => r.status === "draft");
      allDrafts.sort((a, b) =>
        String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? "")),
      );

      const list: DraftRow[] = allDrafts.map((r) => {
        const createdBy = typeof r.created_by === "string" ? r.created_by : null;
        return {
          id: String(r.id),
          name: (typeof r.name === "string" && r.name.trim()) || "Untitled survey",
          whenLabel: relativeLabel((r.updated_at ?? r.created_at) as string | null),
          questionCount: Array.isArray(r.questions) ? r.questions.length : 0,
          campaignCount: typeof r.campaign_count === "number" ? r.campaign_count : 0,
          liveCampaignCount: typeof r.live_campaign_count === "number" ? r.live_campaign_count : 0,
          createdBy,
          mine: !workEmail || createdBy === workEmail,
        };
      });
      setDrafts(list);

      // Resume = the current user's most-recent draft (falls back to the most
      // recent overall if none of theirs — better than an empty slot).
      const top = list.find((d) => d.mine) ?? list[0];
      setResumable(top ? { id: top.id, name: top.name, whenLabel: top.whenLabel } : null);
    } catch {
      setDrafts([]);
    }
  }, [workEmail]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  const onNewSurvey = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled survey", status: "draft" }),
      });
      if (res.status === 401 || res.status === 403) { setError("denied"); creatingRef.current = false; setCreating(false); return; }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.data?.id) {
        setError(json?.error || "Could not start a new survey.");
        creatingRef.current = false; setCreating(false); return;
      }
      router.push(`/survey-studio/create/${json.data.id}?stage=${DEFAULT_STAGE}`);
    } catch {
      setError("Could not start a new survey.");
      creatingRef.current = false; setCreating(false);
    }
  };

  // Soft-delete a draft via the existing governed DELETE /api/surveys/[id] (sets
  // status='deleted'). The server refuses (409) if the survey is still linked to
  // campaigns — surfaced inline rather than silently failing. On success the row
  // is removed and the Resume shortcut recomputed from what's left.
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setRowError(null);
    try {
      const res = await fetch(`/api/surveys/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setRowError({ id, message: j?.error || "Couldn't delete this draft." });
        setDeletingId(null);
        setConfirmingId(null);
        return;
      }
      const next = (drafts ?? []).filter((d) => d.id !== id);
      setDrafts(next);
      const top = next.find((d) => d.mine) ?? next[0];
      setResumable(top ? { id: top.id, name: top.name, whenLabel: top.whenLabel } : null);
      setConfirmingId(null);
      setDeletingId(null);
    } catch {
      setRowError({ id, message: "Couldn't delete this draft." });
      setDeletingId(null);
    }
  };

  const loading = drafts == null;
  const q = query.trim().toLowerCase();
  const filtered = (drafts ?? []).filter((d) => !q || d.name.toLowerCase().includes(q));

  return (
    <StudioContainer>
      <div className="max-w-2xl">
        <Eyebrow className="mb-1.5">Survey Studio</Eyebrow>
        <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight" style={{ color: "var(--text-primary)" }}>Create</h1>
        <p className="text-sm mt-1.5" style={{ color: "var(--text-secondary)" }}>
          Start a new fan survey, or pick up where you left off.
        </p>

        {error === "denied" ? (
          <Card className="mt-6">
            <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>You can&apos;t create surveys here</h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Your account isn&apos;t set up to create surveys. If you need research, use Request instead.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Link href="/survey-studio/request" className="text-sm font-semibold" style={{ color: "var(--accent-ink)" }}>Request research →</Link>
              <Link href="/survey-studio" className="text-sm font-semibold" style={{ color: "var(--text-tertiary)" }}>Back to Home</Link>
            </div>
          </Card>
        ) : (
          <div className="mt-6 space-y-4">
            {/* New survey — the ONLY action that creates a draft */}
            <Card>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <h2 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Start a new survey</h2>
                  <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Set up a fresh survey from scratch. You can leave and come back any time.</p>
                </div>
                <Button onClick={onNewSurvey} variant="primary" size="md" disabled={creating}>
                  <StudioIcon.create size={15} /> {creating ? "Starting…" : "New survey"}
                </Button>
              </div>
              {error && error !== "denied" && (
                <p className="text-xs mt-3" style={{ color: "#B4694C" }}>{error}</p>
              )}
            </Card>

            {/* Resume the most recent in-progress draft, if one exists */}
            {loading ? (
              <Skeleton className="h-[92px]" />
            ) : resumable ? (
              <Link
                href={`/survey-studio/create/${resumable.id}?stage=${DEFAULT_STAGE}`}
                className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] rounded-[var(--radius-panel)]"
              >
                <Card interactive>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Eyebrow className="mb-1">Continue</Eyebrow>
                      <h3 className="text-[15px] font-bold tracking-[-0.01em] truncate" style={{ color: "var(--text-primary)" }}>{resumable.name}</h3>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                        In-progress draft{resumable.whenLabel ? ` · ${resumable.whenLabel}` : ""}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap" style={{ color: "var(--accent-ink)" }}>
                      Resume draft <StudioIcon.arrowRight size={14} />
                    </span>
                  </div>
                </Card>
              </Link>
            ) : null}

            {/* All in-progress drafts — nothing hidden behind the single Resume slot */}
            {!loading && (drafts?.length ?? 0) > 0 && (
              <div className="pt-2">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>
                    Continue a draft · {drafts!.length}
                  </h2>
                  {drafts!.length > 6 && (
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search drafts…"
                      className="text-xs px-2.5 py-1.5 rounded-[var(--radius-control)] border w-44 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
                      style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}
                    />
                  )}
                </div>

                {filtered.length === 0 ? (
                  <p className="text-sm py-3" style={{ color: "var(--text-tertiary)" }}>No drafts match “{query}”.</p>
                ) : (
                  <div className="space-y-2">
                    {filtered.map((d) => (
                      <Card key={d.id} padding="md">
                        {confirmingId === d.id ? (
                          <div className="flex items-center justify-between gap-4 flex-wrap">
                            <p className="text-sm min-w-0" style={{ color: "var(--text-primary)" }}>
                              Delete <span className="font-bold">{d.name}</span>? You can restore it later from the legacy Surveys list.
                            </p>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => setConfirmingId(null)}
                                className="text-xs font-semibold px-3 py-1.5 rounded-[var(--radius-control)] transition-colors text-[color:var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(d.id)}
                                disabled={deletingId === d.id}
                                className="text-xs font-semibold px-3 py-1.5 rounded-[var(--radius-control)] border transition-colors disabled:opacity-60"
                                style={{ background: "#F9EFEA", borderColor: "#E8D2C4", color: "#8A4B2F" }}
                              >
                                {deletingId === d.id ? "Deleting…" : "Delete draft"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <Link
                              href={`/survey-studio/create/${d.id}?stage=${DEFAULT_STAGE}`}
                              className="flex-1 min-w-0 flex items-center justify-between gap-4 rounded-[var(--radius-control)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
                            >
                              <div className="min-w-0">
                                <h3 className="text-sm font-bold tracking-[-0.01em] truncate" style={{ color: "var(--text-primary)" }}>{d.name}</h3>
                                <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>
                                  {[
                                    `${d.questionCount} question${d.questionCount === 1 ? "" : "s"}`,
                                    d.campaignCount > 0 ? `${d.campaignCount} campaign${d.campaignCount === 1 ? "" : "s"}${d.liveCampaignCount > 0 ? ` · ${d.liveCampaignCount} live` : ""}` : null,
                                    d.whenLabel ? `updated ${d.whenLabel}` : null,
                                    d.mine ? null : d.createdBy,
                                  ].filter(Boolean).join(" · ")}
                                </p>
                              </div>
                              <span className="text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1" style={{ color: "var(--accent-ink)" }}>
                                Open <StudioIcon.arrowRight size={14} />
                              </span>
                            </Link>
                            <button
                              type="button"
                              onClick={() => { setConfirmingId(d.id); setRowError(null); }}
                              aria-label={`Delete ${d.name}`}
                              title="Delete draft"
                              className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-[var(--radius-control)] border border-[color:var(--border-default)] text-[color:var(--text-tertiary)] transition-colors hover:text-[#B4694C] hover:border-[#E8D2C4] hover:bg-[#F9EFEA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
                            >
                              <StudioIcon.trash size={16} />
                            </button>
                          </div>
                        )}
                        {rowError?.id === d.id && (
                          <p className="text-xs mt-2" style={{ color: "#B4694C" }}>{rowError.message}</p>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </StudioContainer>
  );
}
