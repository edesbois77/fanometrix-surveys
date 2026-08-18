"use client";

// ── Survey Studio — Request intake form ──────────────────────────────────────
// The Request page IS this form: a clean commissioned-research intake, not a
// second Create workflow and not a history screen. There is NO Purpose selector —
// Request implicitly means "for an advertiser, sponsor, client or agency", and
// the server stores/derives the commissioned purpose the hand-off needs. Brand /
// Client and Agency are always shown (governed selectors + an "Other / Not listed"
// escape hatch). Submitting persists an intake record ONLY — never a Survey,
// Campaign or Deploy. Submitted-request history lives in Manage.

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/app/components/SessionProvider";
import { StudioContainer } from "../StudioContainer";
import { StudioIcon } from "../studio-icons";
import { Eyebrow, Button } from "@/app/components/workspace-ui";
import { COUNTRIES } from "@/lib/countries";
import { OTHER_ORG_VALUE } from "@/lib/research-request";
import { Field, Chip, OrgSelect, INPUT_CLS, INPUT_STYLE, type OrgOption, type RequestRow } from "./shared";

const MANAGE_REQUESTS_HREF = "/survey-studio/manage?view=requests";

type FormValues = {
  name: string;
  objective: string;
  audience: string;
  markets: string[];
  otherMarketsActive: boolean;
  otherMarkets: string;
  brandOrgId: string;
  agencyOrgId: string;
  desiredLaunchDate: string;
  desiredResponses: string;
  additionalContext: string;
};

const EMPTY_FORM: FormValues = {
  name: "", objective: "", audience: "", markets: [], otherMarketsActive: false, otherMarkets: "",
  brandOrgId: "", agencyOrgId: "", desiredLaunchDate: "", desiredResponses: "", additionalContext: "",
};

export function RequestForm() {
  const { user } = useSession();
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [brandOptions, setBrandOptions] = useState<OrgOption[]>([]);
  const [agencyOptions, setAgencyOptions] = useState<OrgOption[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<RequestRow | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/organisations")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        const orgRows = (json?.data ?? []) as { id: string; name: string; type: string }[];
        setBrandOptions(orgRows.filter((o) => o.type === "brand").map((o) => ({ id: o.id, name: o.name })));
        setAgencyOptions(orgRows.filter((o) => o.type === "agency").map((o) => ({ id: o.id, name: o.name })));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setOrgsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const patch = (p: Partial<FormValues>) => setValues((v) => ({ ...v, ...p }));

  const toggleMarket = (code: string) =>
    patch({ markets: values.markets.includes(code) ? values.markets.filter((m) => m !== code) : [...values.markets, code] });

  const brandOther = values.brandOrgId === OTHER_ORG_VALUE;
  const agencyOther = values.agencyOrgId === OTHER_ORG_VALUE;
  const canSubmit = values.name.trim().length > 0 && values.objective.trim().length > 0;
  const requesterName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

  const submit = async () => {
    if (submittingRef.current || !canSubmit) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/survey-studio/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          objective: values.objective,
          audience: values.audience,
          markets: values.markets,
          otherMarkets: values.otherMarketsActive ? values.otherMarkets : undefined,
          brandOrgId: values.brandOrgId || undefined,
          agencyOrgId: values.agencyOrgId || undefined,
          desiredLaunchDate: values.desiredLaunchDate || undefined,
          desiredResponses: values.desiredResponses || undefined,
          additionalContext: values.additionalContext,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.data?.id) {
        setError(json?.error || "Could not submit this request.");
        submittingRef.current = false; setSubmitting(false); return;
      }
      setSubmitted(json.data as RequestRow);
    } catch {
      setError("Could not submit this request.");
      submittingRef.current = false; setSubmitting(false);
    }
  };

  const resetForm = () => {
    submittingRef.current = false;
    setSubmitting(false);
    setError(null);
    setValues(EMPTY_FORM);
    setSubmitted(null);
  };

  if (submitted) return <SubmittedConfirmation name={submitted.name} onAnother={resetForm} />;

  return (
    <StudioContainer>
      <div className="max-w-4xl">
        {/* Intro — commissioned-research value proposition. */}
        <Eyebrow>Survey Studio · Request</Eyebrow>
        <h1 className="mt-1 text-[26px] font-bold tracking-[-0.02em] leading-tight" style={{ color: "var(--text-primary)" }}>
          Hear what football fans think, while it matters.
        </h1>
        <div className="mt-3 space-y-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <p>
            Fanometrix runs real-time fan research across the global inventory of our publishing partners. We help brands, agencies and rights-holders give fans a voice, understand what matters to them and turn those opinions into actionable insight.
          </p>
          <p>
            Tell us what you want to learn, who you want to hear from and where. We&apos;ll come back to you with our recommended research approach, distribution plan and the costs involved.
          </p>
        </div>

        {/* RESEARCH */}
        <section className="mt-9 space-y-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Research</p>

          <Field label="Survey / research name" hint="A short working title so we can refer to this research.">
            <input type="text" value={values.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Matchday coverage sentiment" className={INPUT_CLS} style={INPUT_STYLE} />
          </Field>

          <Field label="Objective" hint="What are you trying to understand?" prominent>
            <textarea value={values.objective} onChange={(e) => patch({ objective: e.target.value })} rows={3} placeholder="e.g. Understand how fans feel about the sponsor's matchday activations and what they want more of." className={`${INPUT_CLS} resize-y leading-relaxed`} style={INPUT_STYLE} />
          </Field>

          <Field label="Ideal audience" hint="Who would you like to hear from?" optional>
            <textarea value={values.audience} onChange={(e) => patch({ audience: e.target.value })} rows={2} placeholder="e.g. Regular readers who follow the Premier League, especially younger fans." className={`${INPUT_CLS} resize-y leading-relaxed`} style={INPUT_STYLE} />
          </Field>

          <Field label="Market(s)" hint="Where are these fans? Choose the countries that matter for this research." optional>
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map((c) => (
                <Chip key={c.code} active={values.markets.includes(c.code)} onClick={() => toggleMarket(c.code)}>{c.name}</Chip>
              ))}
              <Chip active={values.otherMarketsActive} onClick={() => patch({ otherMarketsActive: !values.otherMarketsActive })}>Other…</Chip>
            </div>
            {values.otherMarketsActive && (
              <div className="mt-3">
                <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Other market(s)</label>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>If the market you need isn&apos;t listed, tell us here and we&apos;ll confirm what&apos;s possible.</p>
                <input type="text" value={values.otherMarkets} onChange={(e) => patch({ otherMarkets: e.target.value })} placeholder="e.g. Saudi Arabia, UAE" className={`${INPUT_CLS} mt-2`} style={INPUT_STYLE} />
              </div>
            )}
          </Field>
        </section>

        {/* CLIENT */}
        <section className="mt-10 space-y-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Client</p>
            <p className="text-xs mt-1 leading-snug" style={{ color: "var(--text-tertiary)" }}>
              Who this research is for, so results can be attributed. This does not grant the Brand or Agency any access.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <OrgSelect label="Brand / Client" value={values.brandOrgId} options={brandOptions} loading={orgsLoading} placeholder="Select a brand…" onChange={(v) => patch({ brandOrgId: v })} />
              {brandOther && <OtherNote>Can&apos;t find the Brand? Tell us the name in Additional context below and we&apos;ll add it for you.</OtherNote>}
            </div>
            <div>
              <OrgSelect label="Agency" value={values.agencyOrgId} options={agencyOptions} loading={orgsLoading} placeholder="Select an agency…" onChange={(v) => patch({ agencyOrgId: v })} />
              {agencyOther && <OtherNote>Can&apos;t find the Agency? Tell us the name in Additional context below and we&apos;ll add it for you.</OtherNote>}
            </div>
          </div>
        </section>

        {/* REQUIREMENTS */}
        <section className="mt-10 space-y-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Requirements</p>

          <div className="grid gap-8 sm:grid-cols-2">
            <Field label="Desired timing / launch date" hint="When would you like this to go live? We&apos;ll confirm what&apos;s achievable." optional>
              <input type="date" value={values.desiredLaunchDate} onChange={(e) => patch({ desiredLaunchDate: e.target.value })} className={INPUT_CLS} style={INPUT_STYLE} />
            </Field>
            <Field label="Desired responses / sample size" hint="Roughly how many responses would make this useful? Indicative only, not a final target." optional>
              <input type="number" min={0} step={100} value={values.desiredResponses} onChange={(e) => patch({ desiredResponses: e.target.value })} placeholder="e.g. 500" className={INPUT_CLS} style={INPUT_STYLE} />
            </Field>
          </div>

          <Field label="Additional context" hint="Campaign background, sponsorship context, reporting requirements, a relevant event, or the name of any Brand/Agency not listed above." optional>
            <textarea value={values.additionalContext} onChange={(e) => patch({ additionalContext: e.target.value })} rows={4} placeholder="Tell us anything that would help us plan the research well." className={`${INPUT_CLS} resize-y leading-relaxed`} style={INPUT_STYLE} />
          </Field>
        </section>

        {/* REQUESTER (derived, read-only) */}
        <section className="mt-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Requester</p>
          <div className="mt-3 rounded-[var(--radius-control)] border p-4 grid gap-3 sm:grid-cols-3" style={{ background: "var(--surface-sunken)", borderColor: "var(--border-default)" }}>
            <ReadOnly label="Organisation" value={user?.organisationName ?? "—"} />
            <ReadOnly label="Requester" value={requesterName || "—"} />
            <ReadOnly label="Email" value={user?.workEmail ?? "—"} />
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>Taken from your account — no need to re-enter it.</p>
        </section>

        <div className="mt-10 pt-4 flex items-center gap-3 flex-wrap" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <Button onClick={submit} variant="primary" size="md" disabled={!canSubmit || submitting}>
            {submitting ? "Submitting…" : <>Submit request <StudioIcon.arrowRight size={15} /></>}
          </Button>
          {!canSubmit && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>A research name and objective are required.</span>}
          {error && <span className="text-xs" style={{ color: "#B4694C" }}>{error}</span>}
        </div>
      </div>
    </StudioContainer>
  );
}

function OtherNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs mt-1.5 leading-snug rounded-[var(--radius-control)] px-2.5 py-1.5" style={{ background: "var(--accent-wash)", color: "var(--accent-ink)" }}>
      {children}
    </p>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="text-sm mt-0.5 truncate" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function SubmittedConfirmation({ name, onAnother }: { name: string | null; onAnother: () => void }) {
  return (
    <StudioContainer>
      <div className="max-w-lg py-6">
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-full mb-4" style={{ background: "var(--accent-wash)", color: "var(--accent-ink)" }} aria-hidden>
          <StudioIcon.check size={22} strokeWidth={2.5} />
        </div>
        <Eyebrow>Survey Studio · Request</Eyebrow>
        <h1 className="mt-1 text-[22px] font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>Request submitted</h1>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          We&apos;ve received your research brief{name ? <> for <strong style={{ color: "var(--text-primary)" }}>{name}</strong></> : null}. We&apos;ll review it and come back to you with our recommended approach, distribution plan and costs.
        </p>
        <div className="mt-5 flex items-center gap-4">
          <Button href={MANAGE_REQUESTS_HREF} variant="primary" size="md">View submitted requests in Manage <StudioIcon.arrowRight size={15} /></Button>
          <Button onClick={onAnother} variant="ghost" size="md">Submit another</Button>
        </div>
      </div>
    </StudioContainer>
  );
}
