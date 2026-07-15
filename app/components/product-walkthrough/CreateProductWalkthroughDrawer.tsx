"use client";

// The Library's only creation flow — a simple drawer, same shell as
// ResearchProjectEditDrawer (DrawerSection, right-side panel), not a
// multi-step wizard. Creating a Product Walkthrough does one thing only:
// create an empty walkthrough container and take the presenter directly
// into its workspace. Everything about what the walkthrough contains —
// adding a Survey or Conversation Search, configuring it, generating its
// evidence — happens inside the workspace itself, step by step, since
// that's the experience being demonstrated. This drawer deliberately does
// NOT ask about topic, tone, markets, sources or volume.
import { useState } from "react";
import { DrawerSection } from "@/app/components/DrawerSection";

const INP = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export function CreateProductWalkthroughDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [researchQuestion, setResearchQuestion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim()) { setError("Walkthrough Name is required."); return; }
    setError(""); setSaving(true);
    const res = await fetch("/api/research-projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        research_mode: "simulated",
        name: name.trim(),
        client_label: clientLabel.trim() || undefined,
        internal_notes: internalNotes.trim() || undefined,
        research_question: researchQuestion.trim() || undefined,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Failed to create the walkthrough."); return; }
    onCreated(json.data.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full sm:w-[480px] bg-white flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">New Product Walkthrough</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <DrawerSection step={1} title="Walkthrough" subtitle="Just enough to create the container, everything it contains gets built inside the workspace itself." prominent>
            <Field label="Walkthrough Name *">
              <input value={name} onChange={e => setName(e.target.value)}
                className={INP} placeholder="e.g. Sponsorship Pitch, Prospect A" />
            </Field>
            <Field label="Client / Prospect">
              <input value={clientLabel} onChange={e => setClientLabel(e.target.value)}
                className={INP} placeholder="Optional, e.g. Heineken" />
            </Field>
            <Field label="Internal Note">
              <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
                rows={2} className={INP} placeholder="Optional, a private note to help you find this again, not shown to prospects." />
            </Field>
          </DrawerSection>

          <DrawerSection step={2} title="Research Question" subtitle="Optional, you can set or change this from inside the workspace at any time.">
            <Field label="Research Question">
              <textarea value={researchQuestion} onChange={e => setResearchQuestion(e.target.value)}
                rows={2} className={INP} placeholder="e.g. How do football fans want brands to show up in matchday sponsorship?" />
            </Field>
          </DrawerSection>

          {error && <p className="text-red-500 text-xs">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60 transition-colors"
            style={{ background: "#0B1929", color: "#D7B87A" }}>
            {saving ? "Creating…" : "Create Product Walkthrough"}
          </button>
        </div>
      </div>
    </div>
  );
}
