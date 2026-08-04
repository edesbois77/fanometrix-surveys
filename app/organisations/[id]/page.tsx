"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";

const GOLD = "#D7B87A";
const NAVY = "#0B1929";
const INP = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]";

type Tab = "overview" | "units" | "names" | "identifiers" | "classifications" | "identity" | "relationships" | "offices";
type Org = { id: string; name: string; type: string; status: string; created_at: string; deleted_at: string | null };
type Unit = { id: string; organisation_id: string; parent_unit_id: string | null; name: string; deleted_at: string | null };
type Name = { id: string; value: string; name_form: string; language: string | null; script: string | null; is_primary: boolean; effective_from: string | null; effective_to: string | null };
type Ident = { id: string; scheme: string; designation: string; authority: string | null; namespace: string | null; effective_from: string | null; effective_to: string | null };
type Scheme = { id: string; key: string; label: string; is_system: boolean };
type Category = { id: string; scheme_id: string; key: string; label: string; is_system: boolean };
type Assignment = { id: string; effective_from: string | null; effective_to: string | null; category: { label: string; scheme: { label: string; is_system: boolean } } };

const applic = (from: string | null, to: string | null) =>
  `${from ?? "open"} → ${to ?? "current"}`;

function Toast({ t }: { t: { msg: string; ok: boolean } | null }) {
  if (!t) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${t.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
      {t.ok ? "✓" : "✕"} {t.msg}
    </div>
  );
}

export default function OrganisationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("overview");
  const [org, setOrg] = useState<Org | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const show = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const loadOrg = useCallback(async () => {
    const res = await fetch(`/api/organisations/${id}`);
    if (res.ok) setOrg((await res.json()).data);
  }, [id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { loadOrg(); }, [loadOrg]);

  const TABS: Tab[] = ["overview", "units", "names", "identifiers", "classifications", "identity", "relationships", "offices"];

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <Link href="/organisations" className="text-xs text-gray-400 hover:text-gray-600">← All organisations</Link>
        <div className="flex items-center justify-between mt-2 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">{org?.name ?? "…"}</h1>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 capitalize">{org?.type}</span>
        </div>
        <p className="text-xs text-gray-400 mb-5">Canonical Organisation record · legacy name/type/status preserved for compatibility</p>

        <div className="flex gap-1 border-b border-gray-100 mb-5 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize whitespace-nowrap border-b-2 -mb-px ${tab === t ? "border-[#D7B87A] text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === "overview" && org && <Overview org={org} />}
        {tab === "units" && <UnitsTab orgId={id} show={show} />}
        {tab === "names" && <NamesTab orgId={id} show={show} />}
        {tab === "identifiers" && <IdentifiersTab orgId={id} show={show} />}
        {tab === "classifications" && <ClassificationsTab orgId={id} show={show} />}
        {tab === "identity" && <IdentityTab orgId={id} show={show} />}
        {tab === "relationships" && <RelationshipsTab orgId={id} show={show} />}
        {tab === "offices" && <OfficesTab orgId={id} show={show} />}
      </div>
      <Toast t={toast} />
    </AdminShell>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 mb-4">{children}</div>;
}
function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <button onClick={onClick} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: GOLD, color: NAVY }}>{label}</button>;
}

function Overview({ org }: { org: Org }) {
  return (
    <Card>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-gray-400 uppercase">Legacy type</dt><dd className="capitalize">{org.type}</dd></div>
        <div><dt className="text-xs text-gray-400 uppercase">Status</dt><dd className="capitalize">{org.status}</dd></div>
        <div><dt className="text-xs text-gray-400 uppercase">Created</dt><dd>{new Date(org.created_at).toLocaleDateString("en-GB")}</dd></div>
        <div><dt className="text-xs text-gray-400 uppercase">Technical id</dt><dd className="text-xs text-gray-500 font-mono">{org.id}</dd></div>
      </dl>
      <p className="text-xs text-gray-400 mt-4 leading-relaxed">
        The technical id is not a canonical Identifier. Canonical Names, Identifiers and Classifications are managed in the tabs above; the legacy name and type remain as compatibility projections.
      </p>
    </Card>
  );
}

// ── Units ────────────────────────────────────────────────────────────────────
function UnitsTab({ orgId, show }: { orgId: string; show: (m: string, ok?: boolean) => void }) {
  const [units, setUnits] = useState<Unit[]>([]);
  const load = useCallback(async () => {
    const res = await fetch(`/api/organisations/${orgId}/units`);
    if (res.ok) setUnits((await res.json()).data);
  }, [orgId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);

  const byId = new Map(units.map(u => [u.id, u]));
  const depthOf = (u: Unit): number => { let d = 0, p = u.parent_unit_id; while (p && byId.get(p)) { d++; p = byId.get(p)!.parent_unit_id; } return d; };
  const sorted = [...units].sort((a, b) => a.name.localeCompare(b.name));

  async function create() {
    const name = prompt("New unit name:");
    if (!name) return;
    const parentUnitId = units.length && confirm("Nest under an existing unit? (Cancel = root unit)")
      ? prompt("Parent unit name (exact):") : null;
    const parent = parentUnitId ? units.find(u => u.name === parentUnitId) : null;
    if (parentUnitId && !parent) { show("Parent unit not found.", false); return; }
    const res = await fetch(`/api/organisations/${orgId}/units`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentUnitId: parent?.id ?? null }),
    });
    const j = await res.json();
    if (!res.ok) { show(j.error ?? "Failed.", false); return; }
    show("Unit created."); load();
  }
  async function rename(u: Unit) {
    const name = prompt("Rename unit (updates its canonical Name):", u.name);
    if (!name || name === u.name) return;
    const res = await fetch(`/api/organisations/units/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Unit renamed."); load();
  }
  async function del(u: Unit) {
    if (!confirm(`Delete unit "${u.name}"?`)) return;
    const res = await fetch(`/api/organisations/units/${u.id}`, { method: "DELETE" });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Unit deleted."); load();
  }

  return (
    <Card>
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-gray-800">Organisation Units</h3>
        <AddButton onClick={create} label="+ Add unit" />
      </div>
      {sorted.length === 0 ? <p className="text-sm text-gray-400">No units yet.</p> : (
        <ul className="divide-y divide-gray-50">
          {sorted.map(u => (
            <li key={u.id} className="py-2 flex items-center justify-between" style={{ paddingLeft: depthOf(u) * 16 }}>
              <span className="text-sm text-gray-800">{depthOf(u) > 0 && <span className="text-gray-300 mr-1">└</span>}{u.name}</span>
              <span className="flex gap-3">
                <button onClick={() => rename(u)} className="text-xs text-gray-500 hover:text-gray-800">Rename</button>
                <button onClick={() => del(u)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-400 mt-3">Nesting is validated by the database: no self-parenting, cycles, or cross-organisation nesting; a unit&apos;s organisation cannot change.</p>
    </Card>
  );
}

// ── Names ────────────────────────────────────────────────────────────────────
function NamesTab({ orgId, show }: { orgId: string; show: (m: string, ok?: boolean) => void }) {
  const [names, setNames] = useState<Name[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ value: "", name_form: "display", language: "", effectiveFrom: "", effectiveTo: "" });
  const load = useCallback(async () => { const r = await fetch(`/api/organisations/${orgId}/names`); if (r.ok) setNames((await r.json()).data); }, [orgId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);

  async function add() {
    const res = await fetch(`/api/organisations/${orgId}/names`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: form.value, nameForm: form.name_form, language: form.language || null, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; }
    setAdding(false); setForm({ value: "", name_form: "display", language: "", effectiveFrom: "", effectiveTo: "" }); show("Name added."); load();
  }
  async function correct(n: Name) {
    const value = prompt("Correct this name in place (no history is created):", n.value);
    if (!value || value === n.value) return;
    const res = await fetch(`/api/organisations/names/${n.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Name corrected."); load();
  }
  async function change() {
    const value = prompt("New primary name (records a genuine change, preserving the old one):");
    if (!value) return;
    const transitionDate = prompt("Transition date (YYYY-MM-DD, inclusive start of the new name):", new Date().toISOString().slice(0, 10));
    if (!transitionDate) return;
    const res = await fetch(`/api/organisations/${orgId}/names`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "change", value, transitionDate }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Name change recorded."); load();
  }
  async function retire(n: Name) {
    if (!confirm(`Retire name "${n.value}"?`)) return;
    const res = await fetch(`/api/organisations/names/${n.id}`, { method: "DELETE" });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Name retired."); load();
  }

  return (
    <Card>
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-gray-800">Canonical Names</h3>
        <span className="flex gap-2">
          <button onClick={change} className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700">Record name change</button>
          <AddButton onClick={() => setAdding(a => !a)} label="+ Add name" />
        </span>
      </div>
      {adding && (
        <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
          <input className={INP} placeholder="Name value" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
          <div className="flex gap-2">
            <select className={INP} value={form.name_form} onChange={e => setForm(f => ({ ...f, name_form: e.target.value }))}>
              {["display", "legal", "trading", "short", "other"].map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <input className={INP} placeholder="Language (e.g. en)" value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <input className={INP} type="date" value={form.effectiveFrom} onChange={e => setForm(f => ({ ...f, effectiveFrom: e.target.value }))} />
            <input className={INP} type="date" value={form.effectiveTo} onChange={e => setForm(f => ({ ...f, effectiveTo: e.target.value }))} />
          </div>
          <button onClick={add} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: GOLD, color: NAVY }}>Save name</button>
        </div>
      )}
      <ul className="divide-y divide-gray-50">
        {names.map(n => (
          <li key={n.id} className="py-2 flex items-center justify-between">
            <span className="text-sm text-gray-800">
              {n.value}
              {n.is_primary && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">PRIMARY</span>}
              <span className="ml-2 text-xs text-gray-400">{n.name_form}{n.language ? ` · ${n.language}` : ""} · {applic(n.effective_from, n.effective_to)}</span>
            </span>
            <span className="flex gap-3">
              <button onClick={() => correct(n)} className="text-xs text-gray-500 hover:text-gray-800">Correct</button>
              <button onClick={() => retire(n)} className="text-xs text-red-400 hover:text-red-600">Retire</button>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-400 mt-3">Correction edits a fact in place. &quot;Record name change&quot; closes the current primary at the transition date and opens a new one, preserving history. The primary projects to the legacy name.</p>
    </Card>
  );
}

// ── Identifiers ──────────────────────────────────────────────────────────────
function IdentifiersTab({ orgId, show }: { orgId: string; show: (m: string, ok?: boolean) => void }) {
  const [items, setItems] = useState<Ident[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ scheme: "", designation: "", authority: "", namespace: "" });
  const load = useCallback(async () => { const r = await fetch(`/api/organisations/${orgId}/identifiers`); if (r.ok) setItems((await r.json()).data); }, [orgId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);

  async function add() {
    const res = await fetch(`/api/organisations/${orgId}/identifiers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; }
    setAdding(false); setForm({ scheme: "", designation: "", authority: "", namespace: "" }); show("Identifier added."); load();
  }
  async function retire(i: Ident) {
    if (!confirm(`Retire identifier ${i.scheme}:${i.designation}?`)) return;
    const res = await fetch(`/api/organisations/identifiers/${i.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retire: true }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Identifier retired."); load();
  }

  return (
    <Card>
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-gray-800">Identifiers</h3>
        <AddButton onClick={() => setAdding(a => !a)} label="+ Add identifier" />
      </div>
      {adding && (
        <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
          <div className="flex gap-2">
            <input className={INP} placeholder="Scheme / context (required, e.g. lei)" value={form.scheme} onChange={e => setForm(f => ({ ...f, scheme: e.target.value }))} />
            <input className={INP} placeholder="Designation (required)" value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <input className={INP} placeholder="Authority (optional)" value={form.authority} onChange={e => setForm(f => ({ ...f, authority: e.target.value }))} />
            <input className={INP} placeholder="Namespace (optional)" value={form.namespace} onChange={e => setForm(f => ({ ...f, namespace: e.target.value }))} />
          </div>
          <button onClick={add} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: GOLD, color: NAVY }}>Save identifier</button>
        </div>
      )}
      {items.length === 0 ? <p className="text-sm text-gray-400">No identifiers yet.</p> : (
        <ul className="divide-y divide-gray-50">
          {items.map(i => (
            <li key={i.id} className="py-2 flex items-center justify-between">
              <span className="text-sm text-gray-800">
                <span className="font-mono">{i.scheme}</span>: {i.designation}
                <span className="ml-2 text-xs text-gray-400">{i.authority ? `${i.authority} · ` : ""}{applic(i.effective_from, i.effective_to)}</span>
              </span>
              <button onClick={() => retire(i)} className="text-xs text-red-400 hover:text-red-600">Retire</button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-400 mt-3">The same designation may exist under different schemes. Technical ids are not Identifiers.</p>
    </Card>
  );
}

// ── Classifications ──────────────────────────────────────────────────────────
function ClassificationsTab({ orgId, show }: { orgId: string; show: (m: string, ok?: boolean) => void }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [cats, setCats] = useState<Record<string, Category[]>>({});
  const [pick, setPick] = useState<{ schemeId: string; categoryId: string }>({ schemeId: "", categoryId: "" });

  const load = useCallback(async () => {
    const [a, s] = await Promise.all([fetch(`/api/organisations/${orgId}/classifications`), fetch(`/api/organisations/classification/schemes`)]);
    if (a.ok) setAssignments((await a.json()).data);
    if (s.ok) setSchemes((await s.json()).data);
  }, [orgId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);

  async function loadCats(schemeId: string) {
    const r = await fetch(`/api/organisations/classification/schemes/${schemeId}/categories`);
    if (r.ok) { const j = await r.json(); setCats(c => ({ ...c, [schemeId]: j.data as Category[] })); }
  }
  async function assign() {
    if (!pick.categoryId) { show("Pick a category.", false); return; }
    const res = await fetch(`/api/organisations/${orgId}/classifications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId: pick.categoryId }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Classification assigned."); setPick({ schemeId: "", categoryId: "" }); load();
  }
  async function retire(a: Assignment) {
    if (!confirm("Retire this classification?")) return;
    const res = await fetch(`/api/organisations/classifications/${a.id}`, { method: "DELETE" });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Classification retired."); load();
  }
  async function newScheme() {
    const label = prompt("New scheme label (e.g. Agency Specialism):"); if (!label) return;
    const key = prompt("Scheme key (lower_snake_case, e.g. agency_specialism):"); if (!key) return;
    const res = await fetch(`/api/organisations/classification/schemes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, label }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Scheme created."); load();
  }
  async function newCategory(s: Scheme) {
    const label = prompt(`New category label in "${s.label}" (e.g. Sports Marketing Agency):`); if (!label) return;
    const key = prompt("Category key (lower_snake_case):"); if (!key) return;
    const res = await fetch(`/api/organisations/classification/schemes/${s.id}/categories`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, label }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; }
    show("Category added (no migration needed)."); setCats(c => { const cp = { ...c }; delete cp[s.id]; return cp; }); loadCats(s.id);
  }

  const current = assignments.filter(a => !a.effective_to);
  const historical = assignments.filter(a => a.effective_to);

  return (
    <>
      <Card>
        <h3 className="font-semibold text-gray-800 mb-3">Classifications</h3>
        <p className="text-xs text-gray-400 uppercase mb-1">Current</p>
        {current.length === 0 ? <p className="text-sm text-gray-400 mb-3">None.</p> : (
          <ul className="divide-y divide-gray-50 mb-3">
            {current.map(a => (
              <li key={a.id} className="py-2 flex items-center justify-between">
                <span className="text-sm text-gray-800">{a.category.scheme.label}: <strong>{a.category.label}</strong>
                  {a.category.scheme.is_system && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">SYSTEM · from type</span>}
                  <span className="ml-2 text-xs text-gray-400">{applic(a.effective_from, a.effective_to)}</span>
                </span>
                {!a.category.scheme.is_system && <button onClick={() => retire(a)} className="text-xs text-red-400 hover:text-red-600">Retire</button>}
              </li>
            ))}
          </ul>
        )}
        {historical.length > 0 && <>
          <p className="text-xs text-gray-400 uppercase mb-1">Historical</p>
          <ul className="divide-y divide-gray-50 mb-3">
            {historical.map(a => (
              <li key={a.id} className="py-2 text-sm text-gray-500">{a.category.scheme.label}: {a.category.label} <span className="text-xs text-gray-300">{applic(a.effective_from, a.effective_to)}</span></li>
            ))}
          </ul>
        </>}
        <div className="bg-gray-50 rounded-lg p-3 flex flex-wrap gap-2 items-center">
          <select className={INP + " max-w-[200px]"} value={pick.schemeId} onChange={e => { const s = e.target.value; setPick({ schemeId: s, categoryId: "" }); if (s) loadCats(s); }}>
            <option value="">Choose scheme…</option>
            {schemes.filter(s => !s.is_system).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select className={INP + " max-w-[200px]"} value={pick.categoryId} onChange={e => setPick(p => ({ ...p, categoryId: e.target.value }))} disabled={!pick.schemeId}>
            <option value="">Choose category…</option>
            {(cats[pick.schemeId] ?? []).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <button onClick={assign} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: GOLD, color: NAVY }}>Assign</button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Organisation Category is system-managed from the legacy type and cannot be assigned manually — change the organisation&apos;s type instead.</p>
      </Card>

      <Card>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-800">Schemes &amp; categories</h3>
          <AddButton onClick={newScheme} label="+ New scheme" />
        </div>
        <ul className="divide-y divide-gray-50">
          {schemes.map(s => (
            <li key={s.id} className="py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-800">{s.label} <span className="text-xs text-gray-400 font-mono">{s.key}</span>{s.is_system && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">SYSTEM</span>}</span>
                <span className="flex gap-3 items-center">
                  <button onClick={() => loadCats(s.id)} className="text-xs text-gray-500 hover:text-gray-800">Show categories</button>
                  {!s.is_system && <button onClick={() => newCategory(s)} className="text-xs text-[#8a6d2f] font-medium">+ Category</button>}
                </span>
              </div>
              {cats[s.id] && <div className="mt-1 pl-3 text-xs text-gray-500">{cats[s.id].map(c => c.label).join(" · ") || "no categories"}</div>}
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-400 mt-3">New categories (e.g. &quot;Sports Marketing Agency&quot;) are added by row configuration — no database migration.</p>
      </Card>
    </>
  );
}

// ── Organisational Identity (BP-03 / IC-05) ──────────────────────────────────────
type Identity = { id: string; label: string; descriptor: string | null; effective_from: string | null; effective_to: string | null };

function IdentityTab({ orgId, show }: { orgId: string; show: (m: string, ok?: boolean) => void }) {
  const [items, setItems] = useState<Identity[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: "", descriptor: "", effectiveFrom: "", effectiveTo: "" });
  const load = useCallback(async () => { const r = await fetch(`/api/organisations/${orgId}/identities`); if (r.ok) setItems((await r.json()).data); }, [orgId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);

  async function add() {
    const res = await fetch(`/api/organisations/${orgId}/identities`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: form.label, descriptor: form.descriptor || null, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; }
    setAdding(false); setForm({ label: "", descriptor: "", effectiveFrom: "", effectiveTo: "" }); show("Identity created."); load();
  }
  async function correct(i: Identity) {
    const label = prompt("Correct this identity's label in place (no history):", i.label);
    if (!label || label === i.label) return;
    const res = await fetch(`/api/organisations/identities/${i.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Identity corrected."); load();
  }
  async function cease(i: Identity) {
    if (!confirm(`Cease identity "${i.label}" (records a represented-world end)?`)) return;
    const res = await fetch(`/api/organisations/identities/${i.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cease: true }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Identity ceased."); load();
  }
  async function retire(i: Identity) {
    if (!confirm(`Retire (remove as erroneous) identity "${i.label}"?`)) return;
    const res = await fetch(`/api/organisations/identities/${i.id}`, { method: "DELETE" });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Identity retired."); load();
  }

  return (
    <Card>
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-gray-800">Organisational Identities</h3>
        <AddButton onClick={() => setAdding(a => !a)} label="+ Add identity" />
      </div>
      {adding && (
        <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
          <input className={INP} placeholder="Identity label (the identity's own recognised descriptor — not a Name)" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
          <input className={INP} placeholder="Descriptor (optional)" value={form.descriptor} onChange={e => setForm(f => ({ ...f, descriptor: e.target.value }))} />
          <div className="flex gap-2">
            <input className={INP} type="date" value={form.effectiveFrom} onChange={e => setForm(f => ({ ...f, effectiveFrom: e.target.value }))} />
            <input className={INP} type="date" value={form.effectiveTo} onChange={e => setForm(f => ({ ...f, effectiveTo: e.target.value }))} />
          </div>
          <button onClick={add} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: GOLD, color: NAVY }}>Save identity</button>
        </div>
      )}
      {items.length === 0 ? <p className="text-sm text-gray-400">No identities. An organisation may have none, one, or several.</p> : (
        <ul className="divide-y divide-gray-50">
          {items.map(i => (
            <li key={i.id} className="py-2 flex items-center justify-between">
              <span className="text-sm text-gray-800">{i.label}
                {i.descriptor && <span className="text-gray-400"> — {i.descriptor}</span>}
                <span className="ml-2 text-xs text-gray-400">{applic(i.effective_from, i.effective_to)}</span>
              </span>
              <span className="flex gap-3">
                <button onClick={() => correct(i)} className="text-xs text-gray-500 hover:text-gray-800">Correct</button>
                <button onClick={() => cease(i)} className="text-xs text-amber-600 hover:text-amber-800">Cease</button>
                <button onClick={() => retire(i)} className="text-xs text-red-400 hover:text-red-600">Retire</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-400 mt-3">An Organisational Identity is distinct from the Organisation and from its Names, Identifiers and Classifications. Correct edits in place; Cease records a represented-world end (kept as history).</p>
    </Card>
  );
}

// ── Relationships (BP-03 / IC-07) ────────────────────────────────────────────────
type RType = { id: string; key: string; label: string; directionality: string; is_system: boolean };
type RPart = { id: string; subject_id: string; subject_kind: string; participant_role: string | null };
type Rel = { id: string; descriptor: string | null; effective_from: string | null; effective_to: string | null; type: { label: string }; participants: RPart[] };
type OrgLite = { id: string; name: string };

function RelationshipsTab({ orgId, show }: { orgId: string; show: (m: string, ok?: boolean) => void }) {
  const [rels, setRels] = useState<Rel[]>([]);
  const [types, setTypes] = useState<RType[]>([]);
  const [orgs, setOrgs] = useState<OrgLite[]>([]);
  const [adding, setAdding] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [parts, setParts] = useState<{ subjectId: string; role: string }[]>([]);

  const load = useCallback(async () => {
    const [r, t, o] = await Promise.all([
      fetch(`/api/organisations/${orgId}/relationships`), fetch(`/api/organisations/relationship-types`), fetch(`/api/organisations`),
    ]);
    if (r.ok) setRels((await r.json()).data);
    if (t.ok) setTypes((await t.json()).data);
    if (o.ok) setOrgs(((await o.json()).data as OrgLite[]));
  }, [orgId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setTypeId(types[0]?.id ?? "");
    setParts([{ subjectId: orgId, role: "" }, { subjectId: "", role: "" }]);  // this org + one other, ≥2
    setAdding(true);
  }
  async function create() {
    const participants = parts.filter(p => p.subjectId).map(p => ({ subjectId: p.subjectId, subjectKind: "organisation", role: p.role || null }));
    const res = await fetch(`/api/organisations/${orgId}/relationships`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typeId, participants }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; }
    setAdding(false); show("Relationship created."); load();
  }
  async function cease(r: Rel) {
    if (!confirm("Cease this relationship (records a represented-world end)?")) return;
    const res = await fetch(`/api/organisations/relationships/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cease: true }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Relationship ceased."); load();
  }
  async function retire(r: Rel) {
    if (!confirm("Retire (remove as erroneous) this relationship?")) return;
    const res = await fetch(`/api/organisations/relationships/${r.id}`, { method: "DELETE" });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Relationship retired."); load();
  }
  async function newType() {
    const label = prompt("New relationship type label:"); if (!label) return;
    const key = prompt("Type key (lower_snake_case):"); if (!key) return;
    const directionality = prompt("Directionality (directed / symmetric):", "directed") || "directed";
    const res = await fetch(`/api/organisations/relationship-types`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, label, directionality }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Type created."); load();
  }
  const orgName = (id: string) => orgs.find(o => o.id === id)?.name ?? id.slice(0, 8);

  return (
    <>
      <Card>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-800">Relationships</h3>
          <AddButton onClick={openAdd} label="+ New relationship" />
        </div>
        {adding && (
          <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
            <select className={INP} value={typeId} onChange={e => setTypeId(e.target.value)}>
              {types.map(t => <option key={t.id} value={t.id}>{t.label} ({t.directionality})</option>)}
            </select>
            {parts.map((p, i) => (
              <div key={i} className="flex gap-2">
                <select className={INP} value={p.subjectId} onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, subjectId: e.target.value } : x))}>
                  <option value="">Choose organisation…</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <input className={INP + " max-w-[160px]"} placeholder="role/capacity" value={p.role} onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} />
              </div>
            ))}
            <div className="flex justify-between">
              <button onClick={() => setParts(ps => [...ps, { subjectId: "", role: "" }])} className="text-xs text-[#8a6d2f] font-medium">+ Add participant</button>
              <button onClick={create} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: GOLD, color: NAVY }}>Create relationship</button>
            </div>
          </div>
        )}
        {rels.length === 0 ? <p className="text-sm text-gray-400">No relationships.</p> : (
          <ul className="divide-y divide-gray-50">
            {rels.map(r => (
              <li key={r.id} className="py-2 flex items-start justify-between">
                <span className="text-sm text-gray-800">
                  <strong>{r.type.label}</strong> <span className="text-xs text-gray-400">{applic(r.effective_from, r.effective_to)}</span>
                  <div className="text-xs text-gray-500 mt-0.5">{r.participants.map(p => `${orgName(p.subject_id)}${p.participant_role ? ` (${p.participant_role})` : ""}`).join(" · ")}</div>
                </span>
                <span className="flex gap-3 flex-shrink-0">
                  <button onClick={() => cease(r)} className="text-xs text-amber-600 hover:text-amber-800">Cease</button>
                  <button onClick={() => retire(r)} className="text-xs text-red-400 hover:text-red-600">Retire</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-400 mt-3">A relationship associates two or more subjects with an established meaning. It grants no platform access, and is not Unit containment.</p>
      </Card>

      <Card>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-800">Relationship types</h3>
          <AddButton onClick={newType} label="+ New type" />
        </div>
        <ul className="divide-y divide-gray-50">
          {types.map(t => (
            <li key={t.id} className="py-2 text-sm text-gray-800">{t.label} <span className="text-xs text-gray-400 font-mono">{t.key} · {t.directionality}</span>{t.is_system && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">SYSTEM</span>}</li>
          ))}
        </ul>
        <p className="text-xs text-gray-400 mt-3">Membership and predecessor/successor lineage are system types. New types are added by configuration — no migration.</p>
      </Card>
    </>
  );
}

// ── Organisational Offices (BP-04 / IC-08) ───────────────────────────────────────
type OfficeAttachment = { id: string; governing_organisation_id: string; organisation_unit_id: string | null; effective_from: string | null; effective_to: string | null };
type Office = { id: string; title: string; effective_from: string | null; effective_to: string | null; attachments: OfficeAttachment[] };
type UnitLite = { id: string; name: string };

function OfficesTab({ orgId, show }: { orgId: string; show: (m: string, ok?: boolean) => void }) {
  const [offices, setOffices] = useState<Office[]>([]);
  const [units, setUnits] = useState<UnitLite[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", unitId: "", effectiveFrom: "", effectiveTo: "" });

  const load = useCallback(async () => {
    const [o, u] = await Promise.all([fetch(`/api/organisations/${orgId}/offices`), fetch(`/api/organisations/${orgId}/units`)]);
    if (o.ok) setOffices((await o.json()).data);
    if (u.ok) setUnits((await u.json()).data);
  }, [orgId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);

  const unitName = (id: string | null) => id ? (units.find(u => u.id === id)?.name ?? id.slice(0, 8)) : null;

  async function add() {
    const res = await fetch(`/api/organisations/${orgId}/offices`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title, organisationUnitId: form.unitId || null, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; }
    setAdding(false); setForm({ title: "", unitId: "", effectiveFrom: "", effectiveTo: "" }); show("Office created and attached."); load();
  }
  async function cease(o: Office) {
    if (!confirm(`Cease office "${o.title}" (represented-world end)?`)) return;
    const res = await fetch(`/api/organisations/offices/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cease: true }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Office ceased."); load();
  }
  async function retire(o: Office) {
    if (!confirm(`Retire (remove as erroneous) office "${o.title}"?`)) return;
    const res = await fetch(`/api/organisations/offices/${o.id}`, { method: "DELETE" });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Office retired."); load();
  }
  async function addName(o: Office) {
    const value = prompt(`Add a canonical Name to office "${o.title}" (FR-002):`);
    if (!value) return;
    const res = await fetch(`/api/organisations/${orgId}/names`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId: o.id, subjectKind: "organisational_office", value }) });
    const j = await res.json(); if (!res.ok) { show(j.error ?? "Failed.", false); return; } show("Office name added."); }

  return (
    <Card>
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-gray-800">Organisational Offices</h3>
        <AddButton onClick={() => setAdding(a => !a)} label="+ Add office" />
      </div>
      {adding && (
        <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
          <input className={INP} placeholder="Office title (e.g. Chair of the Board)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <select className={INP} value={form.unitId} onChange={e => setForm(f => ({ ...f, unitId: e.target.value }))}>
            <option value="">Attach directly to this organisation</option>
            {units.map(u => <option key={u.id} value={u.id}>via unit: {u.name}</option>)}
          </select>
          <div className="flex gap-2">
            <input className={INP} type="date" value={form.effectiveFrom} onChange={e => setForm(f => ({ ...f, effectiveFrom: e.target.value }))} />
            <input className={INP} type="date" value={form.effectiveTo} onChange={e => setForm(f => ({ ...f, effectiveTo: e.target.value }))} />
          </div>
          <button onClick={add} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: GOLD, color: NAVY }}>Create office</button>
        </div>
      )}
      {offices.length === 0 ? <p className="text-sm text-gray-400">No offices governed by this organisation.</p> : (
        <ul className="divide-y divide-gray-50">
          {offices.map(o => {
            const att = o.attachments[0];
            return (
              <li key={o.id} className="py-2 flex items-start justify-between">
                <span className="text-sm text-gray-800">
                  {o.title}
                  <span className="ml-2 text-xs text-gray-400">{applic(o.effective_from, o.effective_to)}</span>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {att ? (att.organisation_unit_id ? `via unit: ${unitName(att.organisation_unit_id)}` : "attached directly to this organisation") : "no attachment"}
                    {o.attachments.length > 1 && <span className="text-gray-300"> · {o.attachments.length} attachment periods</span>}
                  </div>
                </span>
                <span className="flex gap-3 flex-shrink-0">
                  <button onClick={() => addName(o)} className="text-xs text-gray-500 hover:text-gray-800">Name</button>
                  <button onClick={() => cease(o)} className="text-xs text-amber-600 hover:text-amber-800">Cease</button>
                  <button onClick={() => retire(o)} className="text-xs text-red-400 hover:text-red-600">Retire</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-gray-400 mt-3">An Office is a first-class subject with exactly one governing organisation at each applicable point (FR-010). It can carry canonical Names/Identifiers/Classifications and participate in ordinary Relationships. Office-holding is a governed mechanism, but actual holdings remain unavailable while the external holder-subject dependency is preserved.</p>
    </Card>
  );
}
