"use client";

// Bulk-edit modal for the campaigns selection bar. Only the fields the user ticks
// are applied; everything left unticked stays exactly as it is on each campaign —
// so a single change (e.g. the wrong agency, or a new response target) can be
// pushed across every selected campaign without touching anything else.
import { useState } from "react";
import { Button } from "@/app/components/workspace-ui";

type Org = { id: string; name: string; type: string };
type Row = { on: boolean; v: string };

const INP = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] disabled:bg-gray-50 disabled:text-gray-400";

function EditRow({ label, on, onToggle, children }: { label: string; on: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-3">
      <label className="inline-flex items-center gap-2 cursor-pointer select-none w-40 flex-shrink-0">
        <input type="checkbox" checked={on} onChange={e => onToggle(e.target.checked)} className="w-4 h-4" style={{ accentColor: "#0B1929" }} />
        <span className="text-sm font-medium" style={{ color: on ? "var(--text-primary)" : "var(--text-tertiary)" }}>{label}</span>
      </label>
      <div className={on ? "" : "opacity-50"}>{children}</div>
    </div>
  );
}

export function BulkEditCampaignsModal({ count, brandOrgs, agencyOrgs, publisherOrgs, working, onApply, onClose }: {
  count: number;
  brandOrgs: Org[];
  agencyOrgs: Org[];
  publisherOrgs: Org[];
  working: boolean;
  onApply: (patch: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [brand, setBrand] = useState<Row>({ on: false, v: "" });
  const [agency, setAgency] = useState<Row>({ on: false, v: "" });
  const [publisher, setPublisher] = useState<Row>({ on: false, v: "" });
  const [target, setTarget] = useState<Row>({ on: false, v: "" });
  const [start, setStart] = useState<Row>({ on: false, v: "" });
  const [end, setEnd] = useState<Row>({ on: false, v: "" });
  const [error, setError] = useState("");

  function apply() {
    const patch: Record<string, unknown> = {};
    if (brand.on) patch.brand_org_id = brand.v || null;
    if (agency.on) patch.agency_org_id = agency.v || null;
    if (publisher.on) patch.publisher_org_id = publisher.v || null;
    if (target.on) patch.target_responses = target.v ? Number(target.v) : null;
    if (start.on) patch.start_date = start.v || null;
    if (end.on) patch.end_date = end.v || null;
    if (Object.keys(patch).length === 0) { setError("Tick at least one field to change."); return; }
    setError("");
    onApply(patch);
  }

  const orgOptions = (orgs: Org[], noneLabel: string) => (
    <>
      <option value="">{noneLabel}</option>
      {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Edit {count} campaign{count === 1 ? "" : "s"}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Only the ticked fields change — everything else stays as it is on each campaign.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          <EditRow label="Brand" on={brand.on} onToggle={v => setBrand(r => ({ ...r, on: v }))}>
            <select disabled={!brand.on} value={brand.v} onChange={e => setBrand(r => ({ ...r, v: e.target.value }))} className={INP}>
              {orgOptions(brandOrgs, "None")}
            </select>
          </EditRow>

          <EditRow label="Agency" on={agency.on} onToggle={v => setAgency(r => ({ ...r, on: v }))}>
            <select disabled={!agency.on} value={agency.v} onChange={e => setAgency(r => ({ ...r, v: e.target.value }))} className={INP}>
              {orgOptions(agencyOrgs, "None")}
            </select>
          </EditRow>

          <EditRow label="Publisher" on={publisher.on} onToggle={v => setPublisher(r => ({ ...r, on: v }))}>
            <select disabled={!publisher.on} value={publisher.v} onChange={e => setPublisher(r => ({ ...r, v: e.target.value }))} className={INP}>
              {orgOptions(publisherOrgs, "None")}
            </select>
          </EditRow>

          <EditRow label="Response target" on={target.on} onToggle={v => setTarget(r => ({ ...r, on: v }))}>
            <input type="number" min={1} disabled={!target.on} value={target.v} onChange={e => setTarget(r => ({ ...r, v: e.target.value }))} className={INP} placeholder="e.g. 1000 (blank = no target)" />
          </EditRow>

          <EditRow label="Start date" on={start.on} onToggle={v => setStart(r => ({ ...r, on: v }))}>
            <input type="date" disabled={!start.on} value={start.v} onChange={e => setStart(r => ({ ...r, v: e.target.value }))} className={INP} />
          </EditRow>

          <EditRow label="End date" on={end.on} onToggle={v => setEnd(r => ({ ...r, on: v }))}>
            <input type="date" disabled={!end.on} value={end.v} min={start.v || undefined} onChange={e => setEnd(r => ({ ...r, v: e.target.value }))} className={INP} />
          </EditRow>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="px-6 py-4 flex items-center justify-end gap-2 border-t border-gray-100 flex-shrink-0">
          <Button variant="ghost" onClick={onClose} disabled={working}>Cancel</Button>
          <Button variant="primary" onClick={apply} disabled={working}>
            {working ? "Applying…" : `Apply to ${count} campaign${count === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
