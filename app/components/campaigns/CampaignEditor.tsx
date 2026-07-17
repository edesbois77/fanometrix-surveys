"use client";

// The one Campaign editor for the whole platform. Extracted verbatim from the
// standalone /campaigns drawer so there is a SINGLE campaign model, editor,
// validation and save — multiple entry points, one implementation:
//   • Global Campaigns page   → mounts it inside a drawer  (variant="drawer")
//   • Research Project         → mounts it as a full embedded page (variant="page")
//
// The editing experience is identical in both; only the surrounding chrome and
// where Save returns to differ. The component owns its own state and supporting
// data (orgs / surveys / projects), validates, and POST/PUTs; the consumer only
// supplies optional presets (a project/survey to lock to when creating) and
// handles onSaved / onCancel navigation.
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { countryCodeWarning, languageCodeWarning, MARKET_REFERENCE_PAIRS, isValidCountryCode, expectedSurveyLanguage } from "@/lib/locales";
import { SUPPORTED_LANGUAGES } from "@/lib/survey-locale";
import { STUDY_TYPES, STUDY_TYPE_LABELS } from "@/lib/naming";
import { useSession } from "@/app/components/SessionProvider";
import { CreativeDesignPicker } from "@/app/components/CreativeDesignPicker";
import { CreativeDesignPreview } from "@/app/components/CreativeDesignPreview";
import { isSurveyValidForReady } from "@/lib/survey-validation";
import { useCreativeDesignNames } from "@/lib/creative-designs";
import { Icon } from "@/app/components/workspace-ui";
import type { Campaign } from "@/app/components/campaigns/types";

type Survey = {
  id: string; name: string; status: string;
  questions?: Array<{ text: string; options: string[] }>;
  thank_you_title?: string | Record<string, string>;
  thank_you_body?: string | Record<string, string>;
};

type ResearchProjectSummary = {
  id: string; project_id: string; project_name: string;
  survey_id: string | null; start_date: string | null; end_date: string | null;
  target_responses: number | null; archive_after_days: number | null;
  tags: string[]; creative_design: string | null;
};

type Org = { id: string; name: string; type: "publisher" | "agency" | "brand" | "internal" };

const BLANK: Partial<Campaign> = {
  campaign_id: "", campaign_name: "",
  campaign_description: "", start_date: null, end_date: null,
  survey_id: null, publisher_org_id: null, brand_org_id: null, agency_org_id: null, topic: null, study_type: "custom", country_code: null, market: null, survey_language: "en", status: "draft",
  target_responses: null, archive_after_days: 90, creative_design: null,
  research_project_id: null, tags: null,
};

const INP = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]";

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Derive an embed slug from the human fields so the user never has to craft one
// (Campaign ID moves to Advanced). A short random suffix keeps it unique.
function autoSlug(name: string, market: string): string {
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${name}_${market}_${new Date().getFullYear()}_${rnd}`
    .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").replace(/__+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

/** A field that can be inherited from a linked Research Project, or overridden.
 * Override intent is tracked locally so clicking Override ALWAYS reveals the
 * control — even when the value being overridden to is null (e.g. "Fanometrix
 * Default" creative, or no target), which would otherwise still read as
 * "inherited" and keep the control hidden. `inherited` seeds the initial state. */
function InheritableField({
  label, inherited, resolvedDisplay, onOverride, onRevert, children,
}: {
  label: string; inherited: boolean; resolvedDisplay: string;
  onOverride: () => void; onRevert: () => void; children: React.ReactNode;
}) {
  const [overridden, setOverridden] = useState(!inherited);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
        {overridden ? (
          <button type="button" onClick={() => { setOverridden(false); onRevert(); }} className="text-xs text-gray-400 underline">Revert to inherited</button>
        ) : (
          <button type="button" onClick={() => { setOverridden(true); onOverride(); }} className="text-xs text-[#0B1929] underline">Override</button>
        )}
      </div>
      {overridden ? children : (
        <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
          Inherited: {resolvedDisplay}
        </p>
      )}
    </div>
  );
}

// A numbered section rendered as a standard white workspace card — the editor
// reads as part of the Fanometrix workspace, not a legacy admin form. Premium
// but minimal: a defined numbered marker, a strong title, a quiet section icon
// and a subtle divider under the header — no coloured backgrounds.
function Section({ step, title, subtitle, icon, children }: { step: number; title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border overflow-hidden" style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-sm)" }}>
      <div className="flex items-start gap-3.5 px-5 md:px-6 pt-5 pb-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <span className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold" style={{ border: "1.5px solid var(--border-strong)", color: "var(--text-secondary)" }}>{step}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold tracking-[-0.01em] leading-tight" style={{ color: "var(--text-primary)" }}>{title}</h3>
          {subtitle && <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{subtitle}</p>}
        </div>
        {icon && <span className="flex-shrink-0 mt-0.5" style={{ color: "var(--text-disabled)" }} aria-hidden>{icon}</span>}
      </div>
      <div className="px-5 md:px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

export function CampaignEditor({
  campaign, presetProjectId, presetSurveyId, presetResearchMode = "real",
  variant = "drawer", onCancel, onSaved,
}: {
  /** The campaign being edited; omit/null to create a new one. */
  campaign?: Campaign | null;
  /** Lock a new campaign to a project/survey (the in-project create flow). */
  presetProjectId?: string | null;
  presetSurveyId?: string | null;
  presetResearchMode?: "real" | "simulated";
  variant?: "drawer" | "page";
  onCancel: () => void;
  onSaved: (result: { id: string | null; created: boolean }) => void;
}) {
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const designNames = useCreativeDesignNames();
  const isEdit = !!campaign?.id;

  const [editing, setEditing] = useState<Partial<Campaign>>(() => {
    if (campaign?.id) {
      const {
        surveys: _s, effective_status: _es, status_reason: _sr, is_auto_transition: _iat,
        response_count: _rc, deleted_at: _da, deleted_by: _db, delete_reason: _dr,
        effective_survey_id: _esi, effective_start_date: _esd, effective_end_date: _eed,
        effective_target_responses: _etr, effective_archive_after_days: _ead,
        effective_tags: _et, effective_creative_design: _ecd, inherited: _inh,
        ...rest
      } = campaign;
      return { ...rest };
    }
    const isPublisher = user?.role === "publisher";
    return {
      ...BLANK,
      publisher_org_id: isPublisher ? (user?.organisationId ?? null) : null,
      ...(presetProjectId ? { research_project_id: presetProjectId } : {}),
      ...(presetSurveyId ? { survey_id: presetSurveyId } : {}),
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [researchProjects, setResearchProjects] = useState<ResearchProjectSummary[]>([]);
  const [researchMode, setResearchMode] = useState<"real" | "simulated">(presetResearchMode);

  useEffect(() => {
    (async () => {
      const [oRes, sRes, pRes] = await Promise.all([
        fetch("/api/organisations"), fetch("/api/surveys"), fetch("/api/research-projects"),
      ]);
      setOrgs((await oRes.json()).data ?? []);
      setSurveys((await sRes.json()).data ?? []);
      setResearchProjects((await pRes.json()).data ?? []);
    })();
  }, []);

  // Create-for-project pre-fill: when creating with a preset project, seed the
  // campaign from that project (topic / type / brand / agency) and capture its
  // research mode so the new campaign is flagged simulated iff the project is.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (isEdit || !presetProjectId || prefilledRef.current) return;
    prefilledRef.current = true;
    (async () => {
      const res = await fetch(`/api/research-projects/${presetProjectId}`);
      if (!res.ok) return;
      const { data: proj } = await res.json();
      setResearchMode(proj.research_mode === "simulated" ? "simulated" : "real");
      setEditing(e => ({
        ...e,
        topic: proj.topic ?? "",
        study_type: proj.study_type ?? "custom",
        brand_org_id: proj.brand_org_id ?? null,
        agency_org_id: proj.agency_org_id ?? null,
      }));
    })();
  }, [presetProjectId, isEdit]);

  const publisherOrgs = useMemo(() => {
    const all = orgs.filter(o => o.type === "publisher");
    return user?.role === "publisher" ? all.filter(o => o.id === user.organisationId) : all;
  }, [orgs, user?.role, user?.organisationId]);
  const brandOrgs = useMemo(() => orgs.filter(o => o.type === "brand"), [orgs]);
  const agencyOrgs = useMemo(() => orgs.filter(o => o.type === "agency"), [orgs]);

  const selectedProject = useMemo(
    () => researchProjects.find(p => p.id === editing.research_project_id) ?? null,
    [researchProjects, editing.research_project_id]
  );

  // Research Target / Creative Design (migration 094) are survey-scoped, so the
  // "Inherited: X" display for those two comes from the specific survey's own
  // research_project_evidence row, not the lightweight project list.
  const [surveyEvidenceDefaults, setSurveyEvidenceDefaults] = useState<{ target_responses: number | null; creative_design: string | null } | null>(null);
  useEffect(() => {
    const projectId = editing.research_project_id;
    const effectiveSurveyId = editing.survey_id ?? selectedProject?.survey_id ?? null;
    if (!projectId || !effectiveSurveyId) { setSurveyEvidenceDefaults(null); return; }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/research-projects/${projectId}`);
      if (!res.ok || cancelled) return;
      const { data: proj } = await res.json();
      const item = (proj.evidence ?? []).find(
        (e: { evidence_type: string; evidence_id: string }) => e.evidence_type === "survey" && e.evidence_id === effectiveSurveyId
      );
      if (!cancelled) {
        setSurveyEvidenceDefaults(item?.survey ? {
          target_responses: item.survey.target_responses ?? null,
          creative_design: item.survey.creative_design ?? null,
        } : null);
      }
    })();
    return () => { cancelled = true; };
  }, [editing.research_project_id, editing.survey_id, selectedProject?.survey_id]);

  // Auto-match Survey Language to Country Code, but only when the user changes
  // Country Code — never silently overwriting an existing campaign's language on
  // first mount (survey_language is deliberately independent of country_code).
  const countryLangBaseline = useRef<string | null>(campaign?.country_code ?? null);
  useEffect(() => {
    if (editing.country_code === countryLangBaseline.current) return;
    countryLangBaseline.current = editing.country_code ?? null;
    if (!editing.country_code) return;
    setEditing(e => ({ ...e, survey_language: expectedSurveyLanguage(e.country_code!) }));
  }, [editing.country_code]);

  async function handleSave() {
    if (!editing.campaign_name?.trim()) { setError("Campaign name is required."); return; }
    if (editing.start_date && editing.end_date && editing.start_date > editing.end_date) {
      setError("Start date cannot be after end date."); return;
    }
    if (editing.target_responses !== null && editing.target_responses !== undefined && editing.target_responses < 1) {
      setError("Target responses must be at least 1."); return;
    }
    setError(""); setSaving(true);

    // Campaign ID (embed slug) is optional in the UI — auto-generate one if the
    // user left it blank.
    const campaignId = editing.campaign_id?.trim() || autoSlug(editing.campaign_name, editing.market ?? editing.country_code ?? "");

    const url = isEdit ? `/api/campaigns/${editing.id}` : "/api/campaigns";
    const method = isEdit ? "PUT" : "POST";
    const body = {
      ...editing,
      campaign_id: campaignId,
      ...(!isEdit && presetProjectId ? { is_simulated: researchMode === "simulated" } : {}),
    };
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Failed to save."); return; }
    onSaved({ id: json.data?.id ?? editing.id ?? null, created: !isEdit });
  }

  const form = (
    <>
      <Section step={1} title="Campaign Identity" subtitle="Naming, description, and optional parent research project." icon={<Icon.document size={18} />}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Campaign Name *">
            <input value={editing.campaign_name ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_name: e.target.value }))} className={INP} placeholder="e.g. Summer Brand Awareness Push" />
          </Field>
          <Field label="Type *">
            <select value={editing.study_type ?? "custom"} onChange={e => setEditing(x => ({ ...x, study_type: e.target.value }))} className={INP}>
              {STUDY_TYPES.map(t => <option key={t} value={t}>{STUDY_TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand (optional)">
            <select value={editing.brand_org_id ?? ""} onChange={e => setEditing(x => ({ ...x, brand_org_id: e.target.value || null }))} className={INP}>
              <option value="">None</option>
              {brandOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Agency (optional)">
            <select value={editing.agency_org_id ?? ""} onChange={e => setEditing(x => ({ ...x, agency_org_id: e.target.value || null }))} className={INP}>
              <option value="">None</option>
              {agencyOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
        </div>
        {isAdmin && (
          <p className="text-right -mt-2">
            <Link href="/organisations?type=brand" className="text-xs text-gray-400 hover:text-[#0B1929] underline">Manage Brands &amp; Agencies →</Link>
          </p>
        )}
        <Field label="Campaign ID">
          <input value={editing.campaign_id ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_id: e.target.value }))} className={`${INP} font-mono`} placeholder="Auto-generated from name & market" />
          <p className="text-xs text-gray-400 mt-1">Embed slug. Leave blank to auto-generate.</p>
        </Field>
        <Field label="Description">
          <input value={editing.campaign_description ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_description: e.target.value }))} className={INP} placeholder="Optional" />
        </Field>
        <Field label="Research Project">
          <select value={editing.research_project_id ?? ""} onChange={e => setEditing(x => ({ ...x, research_project_id: e.target.value || null }))} className={INP} disabled={!!presetProjectId}>
            <option value="">No project, standalone campaign</option>
            {researchProjects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
          </select>
          {selectedProject && (
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
              Survey, dates, target responses, archive settings and tags left blank below are inherited from this project.
            </p>
          )}
        </Field>
      </Section>

      <Section step={2} title="Market Targeting" subtitle="Publisher, country and language for this specific deployment, always stored independently." icon={<Icon.globe size={18} />}>
        <Field label="Publisher">
          <select value={editing.publisher_org_id ?? ""} onChange={e => setEditing(x => ({ ...x, publisher_org_id: e.target.value || null }))} disabled={user?.role === "publisher"} className={`${INP} ${user?.role === "publisher" ? "bg-gray-50 text-gray-500" : ""}`}>
            <option value="">Select publisher</option>
            {publisherOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          {user?.role === "publisher" && <p className="text-xs text-gray-400 mt-1">Locked to your organisation.</p>}
        </Field>
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Country Code <span className="font-normal text-gray-400">(ISO 3166-1 alpha-2)</span></label>
          <input value={editing.country_code ?? ""} onChange={e => setEditing(x => ({ ...x, country_code: e.target.value.toUpperCase().slice(0, 2) || null }))} className={`${INP} font-mono uppercase ${editing.country_code && !isValidCountryCode(editing.country_code) ? "border-amber-400" : ""}`} placeholder="GB" maxLength={2} />
          {(() => { const warn = countryCodeWarning(editing.country_code ?? ""); return warn ? <p className="text-xs text-amber-600 mt-1">⚠ {warn}</p> : null; })()}
          <p className="text-xs text-gray-400 mt-1">Used for embed routing <code className="text-xs">?country=GB</code> and reporting. Always uppercase.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Market Name</label>
          <input value={editing.market ?? ""} onChange={e => setEditing(x => ({ ...x, market: e.target.value || null }))} className={INP} placeholder="United Kingdom" />
          <p className="text-xs text-gray-400 mt-1">Human-readable market label for display and reporting.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Survey Language <span className="font-normal text-gray-400">(ISO 639-1)</span></label>
          <select value={editing.survey_language ?? "en"} onChange={e => setEditing(x => ({ ...x, survey_language: e.target.value }))} className={INP}>
            {SUPPORTED_LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.label} / {lang.nativeLabel} ({lang.code})</option>)}
          </select>
          {(() => { const warn = languageCodeWarning(editing.survey_language ?? ""); return warn ? <p className="text-xs text-amber-600 mt-1">⚠ {warn}</p> : null; })()}
          <p className="text-xs text-gray-400 mt-1">Controls which translation the survey creative renders. Independent of country code.</p>
        </div>
        <details className="group">
          <summary className="text-xs text-[#D7B87A] cursor-pointer select-none hover:opacity-75">Show common country → language pairs</summary>
          <div className="mt-2 rounded-lg overflow-hidden border border-gray-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-400 uppercase tracking-wide text-[10px]">
                  <th className="text-left px-3 py-2">Market</th>
                  <th className="text-left px-3 py-2">country_code</th>
                  <th className="text-left px-3 py-2">survey_language</th>
                </tr>
              </thead>
              <tbody>
                {MARKET_REFERENCE_PAIRS.map(p => (
                  <tr key={p.country_code} className="border-t border-gray-50">
                    <td className="px-3 py-1.5 text-gray-600">{p.market}</td>
                    <td className="px-3 py-1.5 font-mono font-semibold text-[#0B1929]">{p.country_code}</td>
                    <td className="px-3 py-1.5 font-mono text-[#D7B87A]">{p.survey_language}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Section>

      <Section step={3} title="Survey" subtitle="The survey this campaign serves." icon={<Icon.survey size={18} />}>
        {selectedProject ? (
          <InheritableField label="Survey" inherited={editing.survey_id == null} resolvedDisplay={surveys.find(s => s.id === selectedProject.survey_id)?.name ?? "—"} onOverride={() => setEditing(x => ({ ...x, survey_id: selectedProject.survey_id ?? null }))} onRevert={() => setEditing(x => ({ ...x, survey_id: null }))}>
            <select value={editing.survey_id ?? ""} onChange={e => setEditing(x => ({ ...x, survey_id: e.target.value || null }))} className={INP}>
              <option value="">None selected</option>
              {surveys.filter(s => s.status === "draft" || (s.status === "ready" && isSurveyValidForReady(s))).map(s => <option key={s.id} value={s.id}>{s.name}{s.status === "draft" ? " (Draft)" : ""}</option>)}
            </select>
          </InheritableField>
        ) : (
          <Field label="Survey">
            <select value={editing.survey_id ?? ""} onChange={e => setEditing(x => ({ ...x, survey_id: e.target.value || null }))} className={INP}>
              <option value="">None selected</option>
              {surveys.filter(s => s.status === "draft" || (s.status === "ready" && isSurveyValidForReady(s))).map(s => <option key={s.id} value={s.id}>{s.name}{s.status === "draft" ? " (Draft)" : ""}</option>)}
            </select>
          </Field>
        )}
      </Section>

      <Section step={4} title="Campaign Settings" subtitle="Dates, response targets, archive timing, and status, each can inherit from the linked project." icon={<Icon.clock size={18} />}>
        <div className="grid grid-cols-2 gap-3">
          {selectedProject ? (
            <InheritableField label="Start Date" inherited={editing.start_date == null} resolvedDisplay={formatDate(selectedProject.start_date)} onOverride={() => setEditing(x => ({ ...x, start_date: selectedProject.start_date ?? "" }))} onRevert={() => setEditing(x => ({ ...x, start_date: null }))}>
              <input type="date" value={editing.start_date ?? ""} onChange={e => setEditing(x => ({ ...x, start_date: e.target.value || null }))} className={INP} />
            </InheritableField>
          ) : (
            <Field label="Start Date"><input type="date" value={editing.start_date ?? ""} onChange={e => setEditing(x => ({ ...x, start_date: e.target.value || null }))} className={INP} /></Field>
          )}
          {selectedProject ? (
            <InheritableField label="End Date" inherited={editing.end_date == null} resolvedDisplay={formatDate(selectedProject.end_date)} onOverride={() => setEditing(x => ({ ...x, end_date: selectedProject.end_date ?? "" }))} onRevert={() => setEditing(x => ({ ...x, end_date: null }))}>
              <input type="date" value={editing.end_date ?? ""} min={editing.start_date ?? undefined} onChange={e => setEditing(x => ({ ...x, end_date: e.target.value || null }))} className={INP} />
            </InheritableField>
          ) : (
            <Field label="End Date"><input type="date" value={editing.end_date ?? ""} min={editing.start_date ?? undefined} onChange={e => setEditing(x => ({ ...x, end_date: e.target.value || null }))} className={INP} /></Field>
          )}
        </div>
        {editing.start_date && editing.end_date && editing.start_date > editing.end_date && (
          <p className="text-xs text-red-500 -mt-2">End date must be on or after the start date.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {selectedProject ? (
            <InheritableField label="Target Responses" inherited={editing.target_responses == null} resolvedDisplay={surveyEvidenceDefaults?.target_responses?.toLocaleString() ?? "—"} onOverride={() => setEditing(x => ({ ...x, target_responses: surveyEvidenceDefaults?.target_responses ?? null }))} onRevert={() => setEditing(x => ({ ...x, target_responses: null }))}>
              <input type="number" min={1} value={editing.target_responses ?? ""} onChange={e => setEditing(x => ({ ...x, target_responses: e.target.value ? Number(e.target.value) : null }))} className={INP} placeholder="e.g. 10000" />
            </InheritableField>
          ) : (
            <Field label="Target Responses"><input type="number" min={1} value={editing.target_responses ?? ""} onChange={e => setEditing(x => ({ ...x, target_responses: e.target.value ? Number(e.target.value) : null }))} className={INP} placeholder="e.g. 10000 (optional)" /></Field>
          )}
          {selectedProject ? (
            <InheritableField label="Archive After (days)" inherited={editing.archive_after_days == null} resolvedDisplay={selectedProject.archive_after_days != null ? String(selectedProject.archive_after_days) : "—"} onOverride={() => setEditing(x => ({ ...x, archive_after_days: selectedProject.archive_after_days ?? 90 }))} onRevert={() => setEditing(x => ({ ...x, archive_after_days: null }))}>
              <input type="number" min={1} value={editing.archive_after_days ?? ""} onChange={e => setEditing(x => ({ ...x, archive_after_days: e.target.value ? Number(e.target.value) : null }))} className={INP} placeholder="90" />
            </InheritableField>
          ) : (
            <Field label="Archive After (days)"><input type="number" min={1} value={editing.archive_after_days ?? 90} onChange={e => setEditing(x => ({ ...x, archive_after_days: Number(e.target.value) || 90 }))} className={INP} placeholder="90" /></Field>
          )}
        </div>
        <Field label="Status">
          <select value={editing.status ?? "draft"} onChange={e => setEditing(x => ({ ...x, status: e.target.value }))} className={INP}>
            {(["draft", "scheduled", "live", "paused", "closed", "archived"] as const).map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">Status controls whether the survey can accept responses. Certain statuses update automatically based on campaign dates and response targets.</p>
        </Field>
      </Section>

      <Section step={5} title="Creative Design" subtitle="Visual design applied to this campaign's survey MPU." icon={<Icon.sparkles size={18} />}>
        {isAdmin && (
          <p className="text-right -mt-1">
            <a href="/creative-lab/designs" target="_blank" rel="noopener" className="text-xs font-medium underline" style={{ color: "#D7B87A" }}>Browse all designs →</a>
          </p>
        )}
        {selectedProject ? (
          <InheritableField label="Design" inherited={editing.creative_design == null} resolvedDisplay={designNames[surveyEvidenceDefaults?.creative_design ?? ""] ?? "Fanometrix Default"} onOverride={() => setEditing(x => ({ ...x, creative_design: surveyEvidenceDefaults?.creative_design ?? null }))} onRevert={() => setEditing(x => ({ ...x, creative_design: null }))}>
            <CreativeDesignPicker value={editing.creative_design ?? null} onChange={v => setEditing(x => ({ ...x, creative_design: v }))} />
          </InheritableField>
        ) : (
          <>
            <p className="text-xs text-gray-400 leading-relaxed">Select a design for this campaign&apos;s survey MPU. Leave unset to use the standard production creative.</p>
            <CreativeDesignPicker value={editing.creative_design ?? null} onChange={v => setEditing(x => ({ ...x, creative_design: v }))} />
          </>
        )}
        <CreativeDesignPreview designId={editing.creative_design} />
      </Section>

      {error && <p className="text-red-500 text-xs">{error}</p>}
    </>
  );

  const actions = (
    <>
      <button onClick={onCancel} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
      <button onClick={handleSave} disabled={saving} className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60" style={{ background: "#D7B87A", color: "#0B1929" }}>
        {saving ? "Saving…" : "Save Campaign"}
      </button>
    </>
  );

  if (variant === "drawer") {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">{form}</div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">{actions}</div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {form}
      <div className="flex justify-end gap-3 pt-2">{actions}</div>
    </div>
  );
}
