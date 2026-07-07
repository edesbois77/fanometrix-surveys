"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminShell } from "@/app/components/AdminShell";

type OrgType = "publisher" | "agency" | "brand" | "internal";
type OrgStatus = "active" | "disabled";

type Organisation = {
  id: string;
  name: string;
  type: OrgType;
  status: OrgStatus;
  created_at: string;
  updated_at: string;
  user_count: number;
};

const GOLD = "#D7B87A";
const NAVY = "#0B1929";

const TYPE_LABELS: Record<OrgType, string> = {
  publisher: "Publisher",
  agency: "Agency",
  brand: "Brand",
  internal: "Internal",
};

const TYPE_COLOURS: Record<OrgType, string> = {
  publisher: "bg-blue-50 text-blue-700",
  agency: "bg-purple-50 text-purple-700",
  brand: "bg-amber-50 text-amber-700",
  internal: "bg-gray-100 text-gray-600",
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function OrganisationsPage() {
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  // Pre-select the Type filter when linked to from a Brand/Agency dropdown
  // elsewhere (e.g. /organisations?type=brand) — read directly from the URL
  // rather than useSearchParams() so this page doesn't need a Suspense wrapper.
  const [typeFilter, setTypeFilter] = useState<"all" | OrgType>(() => {
    if (typeof window === "undefined") return "all";
    const t = new URLSearchParams(window.location.search).get("type");
    return t === "publisher" || t === "agency" || t === "brand" || t === "internal" ? t : "all";
  });
  const [statusFilter, setStatusFilter] = useState<"all" | OrgStatus>("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; type: OrgType; status: OrgStatus }>({
    name: "", type: "publisher", status: "active",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/organisations");
    const json = await res.json();
    setOrgs(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm({ name: "", type: "publisher", status: "active" });
    setError("");
    setDrawerOpen(true);
  }

  function openEdit(o: Organisation) {
    setEditingId(o.id);
    setForm({ name: o.name, type: o.type, status: o.status });
    setError("");
    setDrawerOpen(true);
  }

  async function handleSave() {
    setError("");
    const name = form.name.trim();
    if (!name) { setError("Organisation name is required."); return; }
    setSaving(true);

    const res = await fetch(editingId ? `/api/organisations/${editingId}` : "/api/organisations", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? form : { name, type: form.type }),
    });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) { setError(json.error ?? "Failed to save organisation."); return; }
    setDrawerOpen(false);
    showToast(editingId ? `"${name}" updated.` : `"${name}" created.`);
    load();
  }

  async function toggleStatus(o: Organisation) {
    const nextStatus: OrgStatus = o.status === "active" ? "disabled" : "active";
    const res = await fetch(`/api/organisations/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      const json = await res.json();
      showToast(json.error ?? "Failed to update status.", false);
      return;
    }
    showToast(nextStatus === "disabled" ? `"${o.name}" disabled.` : `"${o.name}" enabled.`);
    load();
  }

  async function handleDelete(o: Organisation, force = false) {
    if (!confirm(force
      ? `"${o.name}" still has active users. Delete anyway? Their accounts will keep their organisation reference until reassigned.`
      : `Delete "${o.name}"? This can be reviewed later but won't appear in pickers.`
    )) return;

    const res = await fetch(`/api/organisations/${o.id}${force ? "?force=true" : ""}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json();
      if (res.status === 409 && !force) {
        handleDelete(o, true);
        return;
      }
      showToast(json.error ?? "Failed to delete organisation.", false);
      return;
    }
    showToast(`"${o.name}" deleted.`);
    load();
  }

  const filtered = useMemo(() => {
    let list = orgs;
    if (typeFilter !== "all") list = list.filter(o => o.type === typeFilter);
    if (statusFilter !== "all") list = list.filter(o => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o => o.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [orgs, typeFilter, statusFilter, search]);

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Organisations</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                {orgs.length} organisation{orgs.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button onClick={openCreate}
              className="text-sm font-semibold px-4 py-2 rounded-lg flex-shrink-0"
              style={{ background: GOLD, color: NAVY }}>
              + Create Organisation
            </button>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex gap-2.5 items-start">
            <span className="text-gray-400 flex-shrink-0 text-sm mt-0.5">ℹ</span>
            <p className="text-sm text-gray-500 leading-relaxed">
              Publishers, agencies, brands, and internal teams, the canonical registry every user account
              and campaign links back to. Disabling an organisation immediately blocks its users&apos; access.
            </p>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="mb-5 space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
            <input
              type="search"
              placeholder="Search organisations…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
              <option value="all">All Types</option>
              <option value="publisher">Publisher</option>
              <option value="agency">Agency</option>
              <option value="brand">Brand</option>
              <option value="internal">Internal</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No organisations match your filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-semibold">Name</th>
                  <th className="text-left px-5 py-3 font-semibold">Type</th>
                  <th className="text-left px-5 py-3 font-semibold">Status</th>
                  <th className="text-left px-5 py-3 font-semibold hidden sm:table-cell">Users</th>
                  <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Created</th>
                  <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Updated</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => (
                  <tr key={o.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="px-5 py-3 font-medium text-gray-800">{o.name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${TYPE_COLOURS[o.type]}`}>
                        {TYPE_LABELS[o.type]}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        o.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {o.status === "active" ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 hidden sm:table-cell">{o.user_count}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs hidden md:table-cell">{formatDate(o.created_at)}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs hidden md:table-cell">{formatDate(o.updated_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3 justify-end">
                        <button onClick={() => openEdit(o)} className="text-xs text-gray-500 hover:text-gray-800 transition-colors">
                          Edit
                        </button>
                        <button onClick={() => toggleStatus(o)} className="text-xs text-amber-600 hover:text-amber-800 transition-colors">
                          {o.status === "active" ? "Disable" : "Enable"}
                        </button>
                        <button onClick={() => handleDelete(o)} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create / Edit Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-full sm:w-[480px] bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editingId ? "Edit Organisation" : "Create Organisation"}</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <Field label="Name *">
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={INP} placeholder="e.g. FotMob" autoFocus />
              </Field>

              <Field label="Type *">
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as OrgType }))}
                  className={INP}>
                  <option value="publisher">Publisher</option>
                  <option value="agency">Agency</option>
                  <option value="brand">Brand</option>
                  <option value="internal">Internal</option>
                </select>
              </Field>

              {editingId && (
                <Field label="Status">
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as OrgStatus }))}
                    className={INP}>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Disabling immediately blocks every user in this organisation, on their very next request.
                  </p>
                </Field>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setDrawerOpen(false)} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60"
                style={{ background: GOLD, color: NAVY }}>
                {saving ? "Saving…" : editingId ? "Save Organisation" : "Create Organisation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}
