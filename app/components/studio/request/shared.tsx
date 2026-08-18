"use client";

// ── Survey Studio — Request shared UI primitives & types ─────────────────────
// The small field/chip/select building blocks (kept visually identical to the
// Create About stage) plus the row type, status→tone map and formatting helpers
// shared by the intake Form, the Manage list and the detail view. One import
// surface so the three request surfaces read as one.

import { COUNTRIES } from "@/lib/countries";
import { OTHER_ORG_VALUE, type RequestStatus } from "@/lib/research-request";
import type { PurposeValue } from "@/lib/survey-purpose";

export const INPUT_CLS =
  "w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]";
export const INPUT_STYLE = { background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" } as const;

export type OrgOption = { id: string; name: string };

export type RequestRow = {
  id: string;
  organisation_id: string | null;
  status: RequestStatus;
  name: string | null;
  objective: string | null;
  audience: string | null;
  markets: string[] | null;
  purpose: PurposeValue | null;
  brand_org_id: string | null;
  agency_org_id: string | null;
  desired_launch_date: string | null;
  desired_responses: number | null;
  additional_context: string | null;
  requester_email: string;
  requester_name: string | null;
  survey_id: string | null;
  created_at: string;
  clarification_message: string | null;
  clarification_requested_at: string | null;
  clarification_requested_by: string | null;
};

export const STATUS_TONE: Record<RequestStatus, "info" | "success" | "warning" | "danger"> = {
  submitted: "info",
  accepted: "success",
  needs_clarification: "warning",
  declined: "danger",
};

export const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;
export const marketNames = (codes: string[] | null | undefined) => (codes ?? []).map(countryName).join(", ");

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function Field({ label, hint, optional, prominent, children }: {
  label: string; hint?: string; optional?: boolean; prominent?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className={`block ${prominent ? "text-[15px] font-bold" : "text-sm font-semibold"}`} style={{ color: "var(--text-primary)" }}>
        {label}{optional && <span className="font-normal" style={{ color: "var(--text-tertiary)" }}> (optional)</span>}
      </label>
      {hint && <p className="text-sm mt-0.5 leading-snug" style={{ color: "var(--text-tertiary)" }}>{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="px-3 py-1.5 rounded-full text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
      style={active
        ? { background: "var(--accent-wash)", color: "var(--accent-ink)", borderColor: "var(--accent-gold)" }
        : { background: "var(--surface)", color: "var(--text-secondary)", borderColor: "var(--border-default)" }}
    >
      {children}
    </button>
  );
}

// Governed Brand/Agency selector with a terminal "Other / Not listed" option.
// Selecting Other stores the OTHER_ORG_VALUE sentinel in form state (which the
// server coerces to null — no fake org id); the caller shows an informational
// note pointing the requester to Additional context.
export function OrgSelect({ label, value, options, loading, placeholder, onChange }: {
  label: string; value: string; options: OrgOption[]; loading: boolean;
  placeholder: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {label} <span className="font-normal" style={{ color: "var(--text-tertiary)" }}>(optional)</span>
      </label>
      <div className="mt-1.5">
        {loading ? (
          <div className="text-xs py-2" style={{ color: "var(--text-tertiary)" }}>Loading…</div>
        ) : (
          <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLS} style={INPUT_STYLE}>
            <option value="">{placeholder}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            <option value={OTHER_ORG_VALUE}>Other / Not listed</option>
          </select>
        )}
      </div>
    </div>
  );
}
