"use client";

// ── Manage → Requests — submitted research-request review ────────────────────
// The operational home for submitted Requests (Submitted / Needs clarification /
// Accepted / Declined), moved out of the Request intake page. It reads the SAME
// research_requests source of truth via the existing Request API (GET list, GET
// detail, PATCH review transition, POST create-survey hand-off) — no second
// Request model, no copied table. Current-Organisation scoping and admin review
// semantics are enforced server-side.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/components/SessionProvider";
import { StudioIcon } from "../studio-icons";
import { Card, Button, StatusBadge, Skeleton } from "@/app/components/workspace-ui";
import { PURPOSE_OPTIONS } from "@/lib/survey-purpose";
import { REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/research-request";
import { STATUS_TONE, marketNames, formatDate, type RequestRow } from "../request/shared";

type View = { kind: "list" } | { kind: "detail"; id: string };

export function ManageRequests() {
  const [view, setView] = useState<View>({ kind: "list" });
  return view.kind === "list"
    ? <RequestList onOpen={(id) => setView({ kind: "detail", id })} />
    : <RequestDetail id={view.id} onBack={() => setView({ kind: "list" })} />;
}

// A status filter row over the org's requests.
const FILTERS: Array<{ key: "all" | RequestStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "needs_clarification", label: "Needs clarification" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
];

function RequestList({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | RequestStatus>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [reqRes, orgRes] = await Promise.all([
        fetch("/api/survey-studio/requests").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
        fetch("/api/organisations").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
      ]);
      if (cancelled) return;
      const names: Record<string, string> = {};
      for (const o of (orgRes?.data ?? []) as { id: string; name: string }[]) names[o.id] = o.name;
      setOrgNames(names);
      setRows((reqRes?.data ?? []) as RequestRow[]);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = (rows ?? []).filter((r) => filter === "all" || r.status === filter);

  return (
    <div>
      {rows == null ? (
        <div className="space-y-3"><Skeleton className="h-[76px]" /><Skeleton className="h-[76px]" /></div>
      ) : rows.length === 0 ? (
        <Card>
          <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>No requests yet</h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Submitted research requests appear here. Start one from <a href="/survey-studio/request" style={{ color: "var(--accent-ink)" }} className="font-semibold">Request</a>.
          </p>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-1.5 flex-wrap mb-4">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              const count = f.key === "all" ? rows.length : rows.filter((r) => r.status === f.key).length;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
                  style={active
                    ? { background: "var(--accent-wash)", color: "var(--accent-ink)", borderColor: "var(--accent-gold)" }
                    : { background: "var(--surface)", color: "var(--text-secondary)", borderColor: "var(--border-default)" }}
                >
                  {f.label} · {count}
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm py-3" style={{ color: "var(--text-tertiary)" }}>No requests with this status.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((r) => {
                const brandName = r.brand_org_id ? orgNames[r.brand_org_id] : null;
                return (
                  <button key={r.id} type="button" onClick={() => onOpen(r.id)}
                    className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] rounded-[var(--radius-panel)]">
                    <Card interactive>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-[15px] font-bold tracking-[-0.01em] truncate" style={{ color: "var(--text-primary)" }}>{r.name || "Untitled request"}</h3>
                            <StatusBadge label={REQUEST_STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} dot />
                          </div>
                          <p className="text-xs mt-1 truncate" style={{ color: "var(--text-tertiary)" }}>
                            {[
                              brandName ? `For ${brandName}` : null,
                              marketNames(r.markets) || null,
                              r.requester_name || r.requester_email,
                              `Submitted ${formatDate(r.created_at)}`,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <span className="pt-1" style={{ color: "var(--text-tertiary)" }} aria-hidden><StudioIcon.arrowRight size={16} /></span>
                      </div>
                    </Card>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RequestDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const [row, setRow] = useState<RequestRow | null | "error">(null);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Clarification modal state.
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [clarifyMsg, setClarifyMsg] = useState("");
  const [clarifyBusy, setClarifyBusy] = useState(false);
  const [clarifyError, setClarifyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [reqRes, orgRes] = await Promise.all([
      fetch(`/api/survey-studio/requests/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/organisations").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ]);
    const names: Record<string, string> = {};
    for (const o of (orgRes?.data ?? []) as { id: string; name: string }[]) names[o.id] = o.name;
    setOrgNames(names);
    setRow(reqRes?.data ? (reqRes.data as RequestRow) : "error");
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);

  const transition = async (status: RequestStatus) => {
    if (busy) return;
    setBusy(true); setNote(null);
    try {
      const res = await fetch(`/api/survey-studio/requests/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setNote(j?.error || "Could not update the request."); }
      else await load();
    } finally { setBusy(false); }
  };

  const createSurvey = async () => {
    if (busy) return;
    setBusy(true); setNote(null);
    try {
      const res = await fetch(`/api/survey-studio/requests/${id}/create-survey`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      const surveyId = json?.data?.survey_id;
      if (res.ok && surveyId) { router.push(`/survey-studio/create/${surveyId}?stage=about`); return; }
      setNote(json?.error || "Could not create the survey.");
    } finally { setBusy(false); }
  };

  // Send a clarification: emails the requester and (only on success) transitions
  // the request to needs_clarification. The modal stays open on failure so the
  // admin can retry — a failed send never claims the requester was contacted.
  const sendClarification = async () => {
    if (clarifyBusy) return;
    if (!clarifyMsg.trim()) { setClarifyError("A clarification message is required."); return; }
    setClarifyBusy(true); setClarifyError(null);
    try {
      const res = await fetch(`/api/survey-studio/requests/${id}/clarify`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: clarifyMsg }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setClarifyError(json?.error || "Could not send the clarification request."); return; }
      setClarifyOpen(false); setClarifyMsg("");
      await load();
    } catch {
      setClarifyError("Could not send the clarification request.");
    } finally { setClarifyBusy(false); }
  };

  if (row == null) return <div className="space-y-3"><Skeleton className="h-6 w-48" /><Skeleton className="h-40 w-full max-w-[42rem]" /></div>;
  if (row === "error") {
    return (
      <div className="max-w-md py-2">
        <h2 className="text-lg font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>Request not found</h2>
        <p className="text-sm mt-1.5" style={{ color: "var(--text-secondary)" }}>This request could not be opened, or it belongs to another organisation.</p>
        <button type="button" onClick={onBack} className="mt-4 text-sm font-semibold" style={{ color: "var(--accent-ink)" }}>← Back to requests</button>
      </div>
    );
  }

  const brandName = row.brand_org_id ? orgNames[row.brand_org_id] : null;
  const agencyName = row.agency_org_id ? orgNames[row.agency_org_id] : null;
  const purposeLabel = PURPOSE_OPTIONS.find((p) => p.value === row.purpose)?.label ?? null;
  const requesterOrg = row.organisation_id ? orgNames[row.organisation_id] ?? null : null;

  return (
    <div className="max-w-[46rem]">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold mb-3" style={{ color: "var(--text-tertiary)" }}>
        <span aria-hidden>←</span> All requests
      </button>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[20px] font-bold tracking-[-0.02em] leading-tight" style={{ color: "var(--text-primary)" }}>{row.name || "Untitled request"}</h2>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Submitted {formatDate(row.created_at)} · {row.requester_name || row.requester_email}
          </p>
          {/* Requester contact — visible so an admin can reach out manually if needed. */}
          <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            <a href={`mailto:${row.requester_email}`} style={{ color: "var(--accent-ink)" }} className="font-semibold">{row.requester_email}</a>
            {requesterOrg ? ` · ${requesterOrg}` : ""}
          </p>
        </div>
        <StatusBadge label={REQUEST_STATUS_LABEL[row.status]} tone={STATUS_TONE[row.status]} dot size="md" />
      </div>

      <Card className="mt-5 space-y-5">
        <DetailRow label="Objective" value={row.objective} />
        <DetailRow label="Ideal audience" value={row.audience} />
        <DetailRow label="Market(s)" value={marketNames(row.markets) || null} />
        <DetailRow label="Purpose" value={purposeLabel ? `${purposeLabel} (commissioned)` : "Commissioned"} />
        {(brandName || agencyName) && (
          <DetailRow label="Client attribution" value={[brandName ? `Brand: ${brandName}` : null, agencyName ? `Agency: ${agencyName}` : null].filter(Boolean).join(" · ")} />
        )}
        <DetailRow label="Desired launch" value={row.desired_launch_date ? formatDate(row.desired_launch_date) : null} />
        <DetailRow label="Desired responses" value={row.desired_responses != null ? String(row.desired_responses) : null} />
        <DetailRow label="Additional context" value={row.additional_context} />
      </Card>

      {/* Clarification audit trail — the latest clarification requested (V1: one). */}
      {row.clarification_message && (
        <Card className="mt-4" tone="warning">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Clarification requested</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            {[row.clarification_requested_at ? formatDate(row.clarification_requested_at) : null, row.clarification_requested_by].filter(Boolean).join(" · ")}
          </p>
          <p className="text-sm mt-2 leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>{row.clarification_message}</p>
        </Card>
      )}

      {row.survey_id && (
        <Card className="mt-4" tone="success">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>A survey has been created from this request.</p>
            <Button href={`/survey-studio/create/${row.survey_id}?stage=about`} variant="secondary" size="sm">Open in Create <StudioIcon.arrowRight size={14} /></Button>
          </div>
        </Card>
      )}

      {isAdmin && (
        <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-3" style={{ color: "var(--text-tertiary)" }}>Review</p>
          <div className="flex items-center gap-2 flex-wrap">
            {row.status !== "accepted" && <Button onClick={() => transition("accepted")} variant="brand" size="sm" disabled={busy}>Accept</Button>}
            <Button onClick={() => { setClarifyMsg(""); setClarifyError(null); setClarifyOpen(true); }} variant="secondary" size="sm" disabled={busy}>
              {row.status === "needs_clarification" ? "Request more clarification" : "Needs clarification"}
            </Button>
            {row.status !== "declined" && <Button onClick={() => transition("declined")} variant="secondary" size="sm" disabled={busy}>Decline</Button>}
            {row.status === "accepted" && !row.survey_id && (
              <Button onClick={createSurvey} variant="primary" size="sm" disabled={busy}><StudioIcon.create size={14} /> Create survey</Button>
            )}
          </div>
          {note && <p className="text-xs mt-3" style={{ color: "#B4694C" }}>{note}</p>}
        </div>
      )}

      {/* Request clarification modal. */}
      {clarifyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,25,41,0.5)" }} onClick={() => !clarifyBusy && setClarifyOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Request clarification" className="w-full max-w-md rounded-[var(--radius-panel)] p-5" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Request clarification</h3>

            {/* Requester context — from the stored request; the admin never picks an address. */}
            <div className="mt-3 rounded-[var(--radius-control)] border p-3" style={{ background: "var(--surface-sunken)", borderColor: "var(--border-default)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>To</p>
              <p className="text-sm mt-0.5 font-semibold" style={{ color: "var(--text-primary)" }}>{row.requester_name || row.requester_email}</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{row.requester_email}</p>
              {requesterOrg && <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{requesterOrg}</p>}
            </div>

            <div className="mt-4">
              <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>What do you need to clarify?</label>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>We&apos;ll email this message to the person who submitted the request.</p>
              <textarea
                value={clarifyMsg}
                onChange={(e) => setClarifyMsg(e.target.value)}
                rows={5}
                autoFocus
                placeholder="e.g. You mentioned Arsenal fans. Are you after UK-based Arsenal supporters, or Arsenal supporters across all selected markets?"
                className="mt-2 w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border resize-y leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
                style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}
              />
            </div>

            {clarifyError && <p className="text-xs mt-2" style={{ color: "#B4694C" }}>{clarifyError}</p>}

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button onClick={() => setClarifyOpen(false)} variant="ghost" size="sm" disabled={clarifyBusy}>Cancel</Button>
              <Button onClick={sendClarification} variant="primary" size="sm" disabled={clarifyBusy || !clarifyMsg.trim()}>
                {clarifyBusy ? "Sending…" : "Send clarification request"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap" style={{ color: value ? "var(--text-primary)" : "var(--text-tertiary)" }}>{value || "—"}</p>
    </div>
  );
}
