"use client";

// ── About stage — the first, deliberately approachable Create form (Phase 1) ─
// One short form for a non-research user, not a methodology/settings page:
// Survey name, Objective (prominent), Ideal audience, Market(s), Purpose (the
// governed commercial guardrail) and required Language(s). It is purely
// presentational — CreateWorkspace owns all state, autosave and persistence and
// passes values + change handlers in. Survey name uses the existing
// `surveys.name`; the rest lives in the single `surveys.about` jsonb; languages
// use the existing `surveys.enabled_languages`.

import { useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/app/components/workspace-ui";
import { StudioIcon } from "../studio-icons";
import { COUNTRIES } from "@/lib/countries";
import { SUPPORTED_LANGUAGES } from "@/lib/survey-locale";
import { PURPOSE_OPTIONS, isThirdPartyPurpose, showsCommissionedAttribution, type PurposeValue } from "@/lib/survey-purpose";

/** A governed Brand/Agency organisation option (organisations of type brand/agency). */
export type OrgOption = { id: string; name: string };

const INPUT_CLS =
  "w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]";
const INPUT_STYLE = { background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" } as const;

// The most common languages are shown first for a lightweight default; the full
// existing 33-language catalogue is one click away via "Show all" (no new
// language model — this is purely which of SUPPORTED_LANGUAGES are shown first).

function Field({ label, hint, prominent, children }: {
  label: string; hint?: string; prominent?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className={`block ${prominent ? "text-[15px] font-bold" : "text-sm font-semibold"}`} style={{ color: "var(--text-primary)" }}>
        {label}
      </label>
      {hint && <p className="text-sm mt-0.5 leading-snug" style={{ color: "var(--text-tertiary)" }}>{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className="px-3 py-1.5 rounded-full text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
      style={active
        ? { background: "var(--accent-wash)", color: "var(--accent-ink)", borderColor: "var(--accent-gold)" }
        : { background: "var(--surface)", color: "var(--text-secondary)", borderColor: "var(--border-default)" }}
    >
      {children}
    </button>
  );
}

export interface AboutValues {
  name: string;
  objective: string;
  audience: string;
  markets: string[];
  purpose: PurposeValue | "";
  languages: string[];
  /** Governed Brand/Agency ATTRIBUTION (organisation ids). Only meaningful for a
   *  commissioned Purpose; "" = none. Never affects access/ownership. */
  brandOrgId: string;
  agencyOrgId: string;
}

// Native select styled to match the Studio inputs — reuses the existing
// filter-orgs-by-type pattern rather than a competing selector component.
function OrgSelect({ label, value, options, loading, placeholder, emptyText, onChange }: {
  label: string; value: string; options: OrgOption[]; loading: boolean;
  placeholder: string; emptyText: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {label} <span className="font-normal" style={{ color: "var(--text-tertiary)" }}>(optional)</span>
      </label>
      <div className="mt-1.5">
        {loading ? (
          <div className="text-xs py-2" style={{ color: "var(--text-tertiary)" }}>Loading…</div>
        ) : options.length === 0 ? (
          <div className="text-xs py-2" style={{ color: "var(--text-tertiary)" }}>{emptyText}</div>
        ) : (
          <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLS} style={INPUT_STYLE}>
            <option value="">{placeholder}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

export function AboutStage({
  canUseCommissionedPurposes, values, onChange, onChooseCreative, requiredLanguages = [],
  brandOptions = [], agencyOptions = [], orgsLoading = false,
}: {
  /** Resolved governed Q-10 capability (UX projection). Not a role. */
  canUseCommissionedPurposes: boolean;
  values: AboutValues;
  onChange: (patch: Partial<AboutValues>) => void;
  onChooseCreative: () => void;
  /** Languages required by the selected markets — shown ticked and locked. */
  requiredLanguages?: string[];
  /** Governed brand/agency organisations (type=brand/agency), loaded once. */
  brandOptions?: OrgOption[];
  agencyOptions?: OrgOption[];
  orgsLoading?: boolean;
}) {
  const { name, objective, audience, markets, purpose, languages } = values;
  const blocked = !canUseCommissionedPurposes && isThirdPartyPurpose(purpose);
  // Brand/Agency attribution applies only to a persisted commissioned survey.
  const commissionedAttribution = showsCommissionedAttribution(purpose, canUseCommissionedPurposes);
  const hasAttribution = !!(values.brandOrgId || values.agencyOrgId);
  // Pending purpose awaiting confirmation when switching AWAY from commissioned
  // with attribution already set (the change would clear Brand/Agency).
  const [pendingPurpose, setPendingPurpose] = useState<PurposeValue | null>(null);

  // Choose a purpose, guarding the destructive away-from-commissioned case.
  const selectPurpose = (next: PurposeValue) => {
    if (next === purpose) return;
    const leavingCommissioned = isThirdPartyPurpose(purpose) && !isThirdPartyPurpose(next);
    if (leavingCommissioned && hasAttribution) { setPendingPurpose(next); return; }
    // Any non-commissioned target carries no attribution (clear defensively).
    const clear = isThirdPartyPurpose(next) ? {} : { brandOrgId: "", agencyOrgId: "" };
    onChange({ purpose: next, ...clear });
  };

  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  // Common languages by default, plus any already-selected language that isn't in
  // the common set (so a selection never hides when collapsed); "Show all"
  // reveals the full existing supported catalogue.
  // All supported languages are exposed, alphabetically (no show-all/fewer toggle).
  const languageChoices = [...SUPPORTED_LANGUAGES].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="mt-6 space-y-8">
      {/* Survey name — the existing surveys.name field, edited here in Phase 1. */}
      <Field label="Survey name" hint="A short name so you can find this survey later.">
        <input
          type="text"
          value={name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Untitled survey"
          className={INPUT_CLS}
          style={INPUT_STYLE}
        />
      </Field>

      {/* Objective — the most prominent field. */}
      <Field label="Objective" hint="What are you trying to understand?" prominent>
        <textarea
          value={objective}
          onChange={(e) => onChange({ objective: e.target.value })}
          rows={3}
          placeholder="e.g. Understand how our readers feel about our matchday coverage and what they want more of."
          className={`${INPUT_CLS} resize-y leading-relaxed`}
          style={INPUT_STYLE}
        />
      </Field>

      {/* Ideal audience — a plain description, not an audience builder. */}
      <Field label="Ideal audience" hint="Who would you like to hear from? Describe them in your own words.">
        <textarea
          value={audience}
          onChange={(e) => onChange({ audience: e.target.value })}
          rows={2}
          placeholder="e.g. Regular readers who follow the Premier League, especially younger fans."
          className={`${INPUT_CLS} resize-y leading-relaxed`}
          style={INPUT_STYLE}
        />
      </Field>

      {/* Purpose — the governed commercial guardrail. */}
      <Field label="Purpose" hint="Who is this research for?">
        <div className="space-y-2">
          {PURPOSE_OPTIONS.map((o) => {
            const selected = purpose === o.value;
            return (
              <label
                key={o.value}
                className="flex items-start gap-3 p-3 rounded-[var(--radius-control)] border cursor-pointer transition-colors"
                style={selected
                  ? { background: "var(--accent-wash)", borderColor: "var(--accent-gold)" }
                  : { background: "var(--surface)", borderColor: "var(--border-default)" }}
              >
                <input
                  type="radio"
                  name="purpose"
                  checked={selected}
                  onChange={() => selectPurpose(o.value)}
                  className="mt-0.5 accent-[#8A6D2F]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{o.label}</span>
                  <span className="block text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{o.help}</span>
                </span>
              </label>
            );
          })}
        </div>

        {/* Calm redirect for third-party research — NOT an error state. */}
        {blocked && (
          <Card tone="info" className="mt-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5" style={{ color: "var(--accent-ink)" }} aria-hidden><StudioIcon.request size={18} /></span>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  This one goes through Request
                </p>
                <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Research run for an advertiser, sponsor, client or agency is handled by our Request flow, not self-service Create.
                  If this is really about your own editorial, product or business, pick one of those above to continue here.
                </p>
                <Link href="/survey-studio/request" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--accent-ink)" }}>
                  Request research <StudioIcon.arrowRight size={14} />
                </Link>
              </div>
            </div>
          </Card>
        )}

        {/* Client details — commissioned attribution, revealed beneath the selected
            commissioned Purpose. Governed Brand/Agency organisations, both optional.
            ATTRIBUTION, NOT ACCESS: selecting these never grants anyone access. */}
        {commissionedAttribution && (
          <div className="mt-3 rounded-[var(--radius-control)] border p-4 space-y-4" style={{ background: "var(--surface-sunken)", borderColor: "var(--border-default)" }}>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Client details</p>
              <p className="text-xs mt-1 leading-snug" style={{ color: "var(--text-tertiary)" }}>
                Who this research is for, so results can be attributed. This does not grant the Brand or Agency access to this survey.
              </p>
            </div>
            <OrgSelect
              label="Brand / Client" value={values.brandOrgId} options={brandOptions} loading={orgsLoading}
              placeholder="Select a brand…" emptyText="No brands available yet."
              onChange={(v) => onChange({ brandOrgId: v })}
            />
            <OrgSelect
              label="Agency" value={values.agencyOrgId} options={agencyOptions} loading={orgsLoading}
              placeholder="Select an agency…" emptyText="No agencies available yet."
              onChange={(v) => onChange({ agencyOrgId: v })}
            />
          </div>
        )}
      </Field>

      {/* Destructive-change confirmation: switching away from a commissioned Purpose
          clears the saved Brand/Agency, so confirm first. */}
      {pendingPurpose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,25,41,0.5)" }} onClick={() => setPendingPurpose(null)}>
          <div role="dialog" aria-modal="true" aria-label="Change purpose" className="w-full max-w-sm rounded-[var(--radius-panel)] p-5" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Change purpose?</p>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Changing the purpose will remove the Brand and Agency from this survey.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPendingPurpose(null)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={() => { onChange({ purpose: pendingPurpose, brandOrgId: "", agencyOrgId: "" }); setPendingPurpose(null); }}>
                Change purpose
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Market(s) — simple country toggles. */}
      <Field label="Market(s)" hint="Where are these fans? Choose the countries that matter for this survey.">
        <div className="flex flex-wrap gap-2">
          {COUNTRIES.map((c) => (
            <Chip key={c.code} active={markets.includes(c.code)} onClick={() => onChange({ markets: toggle(markets, c.code) })}>
              {c.name}
            </Chip>
          ))}
        </div>
      </Field>

      {/* Language(s) — required language context only; translations come later. */}
      <Field label="Survey language(s)" hint="Which language(s) will fans answer in? You'll add the actual translations later, in Survey.">
        <div className="flex flex-wrap gap-2">
          {languageChoices.map((l) => {
            const active = languages.includes(l.code);
            const isOnlyOne = active && languages.length === 1;
            // A market-required language stays ticked and locked — you remove it
            // by deselecting its market, not here.
            const required = active && requiredLanguages.includes(l.code);
            const locked = isOnlyOne || required;
            return (
              <Chip
                key={l.code}
                active={active}
                title={required ? "Required by a selected market. Deselect the market to remove it." : undefined}
                onClick={() => { if (!locked) onChange({ languages: toggle(languages, l.code) }); }}
              >
                {l.label}
              </Chip>
            );
          })}
        </div>
        <div className="mt-2">
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            At least one language is required. If you only need one, you&apos;re done here.
          </span>
        </div>
      </Field>

      {/* Primary action — obvious next step without locking the tabs. */}
      <div className="pt-2 flex items-center gap-3 flex-wrap" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        {blocked ? (
          <>
            <Button href="/survey-studio/request" variant="primary" size="md">
              <StudioIcon.request size={15} /> Request research
            </Button>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Choose a first-party purpose to continue in Create.</span>
          </>
        ) : (
          <Button onClick={onChooseCreative} variant="primary" size="md">
            Choose creative <StudioIcon.arrowRight size={15} />
          </Button>
        )}
      </div>
    </div>
  );
}
