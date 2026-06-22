"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";

type Publisher = { id: string; name: string; created_at: string; updated_at: string };

export default function PublishersPage() {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [newName,    setNewName]    = useState("");
  const [adding,     setAdding]     = useState(false);
  const [editId,     setEditId]     = useState<string | null>(null);
  const [editName,   setEditName]   = useState("");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/publishers");
    const json = await res.json();
    setPublishers(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const name = newName.trim();
    if (!name) { setError("Publisher name is required."); return; }
    setAdding(true);
    const res  = await fetch("/api/publishers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    setAdding(false);
    if (!res.ok) { setError(json.error ?? "Failed to add publisher."); return; }
    setNewName("");
    showToast(`"${name}" added.`);
    load();
  }

  function startEdit(p: Publisher) {
    setEditId(p.id);
    setEditName(p.name);
    setError("");
  }

  function cancelEdit() { setEditId(null); setEditName(""); setError(""); }

  async function handleSave(id: string) {
    setError("");
    const name = editName.trim();
    if (!name) { setError("Publisher name is required."); return; }
    setSaving(true);
    const res  = await fetch(`/api/publishers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Failed to update publisher."); return; }
    setEditId(null);
    showToast(`"${name}" updated.`);
    load();
  }

  async function handleDelete(p: Publisher) {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/publishers/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json();
      showToast(json.error ?? "Failed to delete publisher.", false);
      return;
    }
    showToast(`"${p.name}" deleted.`);
    load();
  }

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Publishers</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {publishers.length} publisher{publishers.length !== 1 ? "s" : ""}
          </p>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-lg">
            Publishers listed here appear in the Publisher Access selector when creating or editing
            user accounts. Add any new publishers before assigning them to campaigns or accounts.
          </p>
        </div>

        {/* Add publisher form */}
        <form onSubmit={handleAdd} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Publisher</p>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={e => { setNewName(e.target.value); setError(""); }}
              placeholder="e.g. Sky Sports"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
            />
            <button
              type="submit"
              disabled={adding}
              className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
              style={{ background: "#D7B87A", color: "#0B1929" }}
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        </form>

        {/* Publisher list */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : publishers.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No publishers yet. Add one above.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-semibold">Publisher</th>
                  <th className="text-left px-5 py-3 font-semibold hidden sm:table-cell">Added</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {publishers.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="px-5 py-3">
                      {editId === p.id ? (
                        <input
                          value={editName}
                          onChange={e => { setEditName(e.target.value); setError(""); }}
                          autoFocus
                          onKeyDown={e => { if (e.key === "Enter") handleSave(p.id); if (e.key === "Escape") cancelEdit(); }}
                          className="border border-[#D7B87A] rounded-lg px-2 py-1 text-sm focus:outline-none w-full max-w-xs"
                        />
                      ) : (
                        <span className="font-medium text-gray-800">{p.name}</span>
                      )}
                      {editId === p.id && error && (
                        <p className="text-red-500 text-xs mt-1">{error}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs hidden sm:table-cell">
                      {new Date(p.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {editId === p.id ? (
                          <>
                            <button
                              onClick={() => handleSave(p.id)}
                              disabled={saving}
                              className="text-xs font-semibold text-green-600 hover:text-green-800 disabled:opacity-50"
                            >
                              {saving ? "Saving…" : "Save"}
                            </button>
                            <button onClick={cancelEdit} className="text-xs text-gray-400 hover:text-gray-600">
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(p)}
                              className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(p)}
                              className="text-xs text-red-400 hover:text-red-600 transition-colors"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-4">
          Deleting a publisher does not affect existing campaigns or user accounts — it only removes it from the selection list.
        </p>

      </div>

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
