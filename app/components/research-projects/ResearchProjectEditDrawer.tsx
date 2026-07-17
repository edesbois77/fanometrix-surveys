"use client";

// The Research Brief editor — shared by the Research Projects list page
// (create + edit) and the Workspace's "Edit Research Brief" button, so a
// project's brief is edited from exactly one form no matter where the user
// starts. Confidentiality/Version/Research Target/Status live in Project
// Information instead (Workspace-only) — this drawer is specifically the
// research question itself: name, question, classification, objective,
// tags.
import { useState } from "react";
import { DrawerSection } from "@/app/components/DrawerSection";
import { MultiSelect } from "@/app/components/MultiSelect";
import { STUDY_TYPES, STUDY_TYPE_LABELS, toSlugPart } from "@/lib/naming";
import { RESEARCH_SUBJECTS, RESEARCH_SUBJECT_LABELS } from "@/lib/research-subjects";

export type ResearchProjectBriefFields = {
  id?: string;
  project_id?: string;
  topic: string | null;
  research_question: string | null;
  research_subject: string | null;
  study_type: string;
  brand_org_id: string | null;
  agency_org_id: string | null;
  objective: string | null;
  tags: string[] | null;
};

const INP = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export function ResearchProjectEditDrawer({
  initial, orgBrands, orgAgencies, orgName,
  existingTags = [], popularTags = [],
  onClose, onSaved,
}: {
  initial: Partial<ResearchProjectBriefFields>;
  orgBrands: { id: string; name: string }[];
  orgAgencies: { id: string; name: string }[];
  orgName: (id: string | null) => string;
  existingTags?: string[];
  popularTags?: string[];
  onClose: () => void;
  onSaved: (saved: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState<Partial<ResearchProjectBriefFields>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isNew = !editing.id;
  const tagOptions = existingTags.map(t => ({ value: t, label: t }));
  const suggestibleTags = popularTags.filter(t => !(editing.tags ?? []).includes(t));

  async function handleSave() {
    if (!editing.topic?.trim()) { setError("Research Name is required."); return; }
    if (isNew && !editing.research_question?.trim()) { setError("A research question is required."); return; }
    if (!editing.study_type) { setError("Study type is required."); return; }

    let projectId = editing.project_id;
    if (isNew) {
      projectId = toSlugPart(editing.topic ?? "");
      if (!projectId) { setError("Research Name must contain at least one letter or number."); return; }
    }

    setError(""); setSaving(true);

    const url = editing.id ? `/api/research-projects/${editing.id}` : "/api/research-projects";
    const method = editing.id ? "PUT" : "POST";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      // The project name is simply the Research Name the user typed — the
      // classification (type / brand / category / agency) is kept in its own
      // fields, not baked into a composite display name.
      body: JSON.stringify({ ...editing, project_id: projectId, project_name: (editing.topic ?? "").trim() }),
    });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) { setError(json.error ?? "Failed to save."); return; }
    onSaved(json.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full sm:w-[480px] bg-white flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{isNew ? "Create Research Project" : "Edit Research Brief"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          <DrawerSection step={1} title="Research Brief" subtitle="What this project is and the question it's trying to answer." prominent>
            <Field label="Research Name *">
              <input value={editing.topic ?? ""} onChange={e => setEditing(x => ({ ...x, topic: e.target.value }))}
                className={INP} placeholder="e.g. Women's World Cup 2026" />
              <p className="text-xs text-gray-400 mt-1.5">Keep this identifiable in a list, the research question below captures the specific question.</p>
            </Field>

            <Field label="Research Question *">
              <textarea value={editing.research_question ?? ""} onChange={e => setEditing(x => ({ ...x, research_question: e.target.value }))}
                rows={3} className={INP} placeholder="e.g. How do football fans want brands to improve the Women's World Cup experience?" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Research Category">
                <select value={editing.research_subject ?? ""} onChange={e => setEditing(x => ({ ...x, research_subject: e.target.value || null }))} className={INP}>
                  <option value="">None selected</option>
                  {RESEARCH_SUBJECTS.map(s => <option key={s} value={s}>{RESEARCH_SUBJECT_LABELS[s]}</option>)}
                </select>
              </Field>
              <Field label="Research Type *">
                <select value={editing.study_type ?? "fan_understanding"} onChange={e => setEditing(x => ({ ...x, study_type: e.target.value }))} className={INP}>
                  {STUDY_TYPES.map(s => <option key={s} value={s}>{STUDY_TYPE_LABELS[s]}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Brand">
                <select value={editing.brand_org_id ?? ""} onChange={e => setEditing(x => ({ ...x, brand_org_id: e.target.value || null }))} className={INP}>
                  <option value="">None selected</option>
                  {orgBrands.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
              <Field label="Agency">
                <select value={editing.agency_org_id ?? ""} onChange={e => setEditing(x => ({ ...x, agency_org_id: e.target.value || null }))} className={INP}>
                  <option value="">None selected</option>
                  {orgAgencies.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
            </div>

            {editing.topic?.trim() && (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Project Name</p>
                <p className="text-sm font-medium text-gray-700">{editing.topic.trim()}</p>
              </div>
            )}
          </DrawerSection>

          <DrawerSection step={2} title="Objective" subtitle="Optional, a narrower, commercial framing of the research question.">
            <Field label="Research Objective">
              <textarea value={editing.objective ?? ""} onChange={e => setEditing(x => ({ ...x, objective: e.target.value }))}
                rows={2} className={INP} placeholder="e.g. Understand which commercial activations fans value most during WWC2027." />
            </Field>
          </DrawerSection>

          <DrawerSection step={3} title="Tags" subtitle="Optional labels to group related projects.">
            <Field label="Tags">
              {suggestibleTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <span className="text-xs text-gray-400 mr-0.5 mt-1">Reuse:</span>
                  {suggestibleTags.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditing(x => ({ ...x, tags: [...(x.tags ?? []), t] }))}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1 rounded-full transition-colors"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              )}
              <MultiSelect
                options={tagOptions}
                selected={editing.tags ?? []}
                onChange={v => setEditing(x => ({ ...x, tags: v }))}
                placeholder="Search or create a tag…"
                helperText="Type to see matching tags used on other projects, or create a new one. Tags become available to every future project once created."
                allowCreate
                createLabel={t => `+ Create tag: "${t}"`}
              />
            </Field>
          </DrawerSection>

          {error && <p className="text-red-500 text-xs">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60 transition-colors"
            style={{ background: "#0B1929", color: "#D7B87A" }}>
            {saving ? "Saving…" : isNew ? "Create Research Project" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
