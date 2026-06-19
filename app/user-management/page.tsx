"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";

type User = {
  id: string;
  username: string;
  role: "admin" | "brand" | "agency" | "publisher";
  organisation_name: string;
  organisation_type: string;
  allowed_campaign_ids: string[];
  allowed_publisher_ids: string[];
  is_active: boolean;
  created_at: string;
};

const ROLES = ["admin", "brand", "agency", "publisher"] as const;

const EMPTY_FORM = {
  username: "",
  password: "",
  role: "brand" as User["role"],
  organisation_name: "",
  organisation_type: "",
  allowed_campaign_ids: "",
  allowed_publisher_ids: "",
  is_active: true,
};

export default function UserManagementPage() {
  const [users,       setUsers]       = useState<User[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [editUser,    setEditUser]    = useState<User | null>(null);
  const [form,        setForm]        = useState({ ...EMPTY_FORM });
  const [saving,      setSaving]      = useState(false);
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) {
      const json = await res.json();
      setUsers(json.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  function openCreate() {
    setEditUser(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }

  function openEdit(u: User) {
    setEditUser(u);
    setForm({
      username:              u.username,
      password:              "",
      role:                  u.role,
      organisation_name:     u.organisation_name,
      organisation_type:     u.organisation_type,
      allowed_campaign_ids:  u.allowed_campaign_ids.join(", "),
      allowed_publisher_ids: u.allowed_publisher_ids.join(", "),
      is_active:             u.is_active,
    });
    setShowModal(true);
  }

  function parseIds(raw: string): string[] {
    return raw.split(",").map(s => s.trim()).filter(Boolean);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      username:              form.username.toLowerCase().trim(),
      role:                  form.role,
      organisation_name:     form.organisation_name,
      organisation_type:     form.organisation_type,
      allowed_campaign_ids:  parseIds(form.allowed_campaign_ids),
      allowed_publisher_ids: parseIds(form.allowed_publisher_ids),
      is_active:             form.is_active,
      ...(form.password ? { password: form.password } : {}),
    };

    const url    = editUser ? `/api/users/${editUser.id}` : "/api/users";
    const method = editUser ? "PUT" : "POST";

    const res  = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();

    setSaving(false);

    if (!res.ok) {
      showToast(json.error ?? "Failed to save user", false);
    } else {
      showToast(editUser ? "User updated." : "User created.");
      setShowModal(false);
      loadUsers();
    }
  }

  async function toggleActive(u: User) {
    const res  = await fetch(`/api/users/${u.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ is_active: !u.is_active }),
    });
    const json = await res.json();
    if (!res.ok) {
      showToast(json.error ?? "Failed to update", false);
    } else {
      showToast(u.is_active ? "Account disabled." : "Account enabled.");
      loadUsers();
    }
  }

  const ROLE_COLOURS: Record<User["role"], string> = {
    admin:     "bg-[#0B1929] text-white",
    brand:     "bg-amber-100 text-amber-800",
    agency:    "bg-blue-100 text-blue-800",
    publisher: "bg-green-100 text-green-800",
  };

  return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-sm text-gray-400 mt-0.5">Create and manage platform accounts.</p>
          </div>
          <button
            onClick={openCreate}
            className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            style={{ background: "#0B1929", color: "#D7B87A" }}
          >
            + New User
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No users yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-semibold">Username</th>
                  <th className="text-left px-5 py-3 font-semibold">Role</th>
                  <th className="text-left px-5 py-3 font-semibold">Organisation</th>
                  <th className="text-left px-5 py-3 font-semibold">Status</th>
                  <th className="text-left px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-gray-700">{u.username}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLOURS[u.role]}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {u.organisation_name || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold ${u.is_active ? "text-green-600" : "text-gray-400"}`}>
                        {u.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3 justify-end">
                        <button
                          onClick={() => openEdit(u)}
                          className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(u)}
                          className={`text-xs font-medium transition-colors ${
                            u.is_active ? "text-red-400 hover:text-red-600" : "text-green-500 hover:text-green-700"
                          }`}
                        >
                          {u.is_active ? "Disable" : "Enable"}
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-5">
              {editUser ? `Edit ${editUser.username}` : "New User"}
            </h2>

            <form onSubmit={handleSave} className="space-y-4">
              {!editUser && (
                <Field label="Username">
                  <input
                    type="text"
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    required
                    placeholder="e.g. carlsberg_client"
                    className={INPUT}
                  />
                </Field>
              )}

              <Field label={editUser ? "New Password (leave blank to keep current)" : "Password"}>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required={!editUser}
                  placeholder="••••••••"
                  className={INPUT}
                />
              </Field>

              <Field label="Role">
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as User["role"] }))}
                  className={INPUT}
                  required
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </Field>

              <Field label="Organisation Name">
                <input
                  type="text"
                  value={form.organisation_name}
                  onChange={e => setForm(f => ({ ...f, organisation_name: e.target.value }))}
                  placeholder="e.g. Carlsberg"
                  className={INPUT}
                />
              </Field>

              <Field label="Organisation Type">
                <input
                  type="text"
                  value={form.organisation_type}
                  onChange={e => setForm(f => ({ ...f, organisation_type: e.target.value }))}
                  placeholder="e.g. brand, agency, publisher"
                  className={INPUT}
                />
              </Field>

              <Field label="Allowed Campaign IDs (comma-separated)">
                <input
                  type="text"
                  value={form.allowed_campaign_ids}
                  onChange={e => setForm(f => ({ ...f, allowed_campaign_ids: e.target.value }))}
                  placeholder="e.g. carlsberg_ucl_2026, carlsberg_el_2026"
                  className={INPUT}
                />
              </Field>

              <Field label="Allowed Publisher IDs (comma-separated)">
                <input
                  type="text"
                  value={form.allowed_publisher_ids}
                  onChange={e => setForm(f => ({ ...f, allowed_publisher_ids: e.target.value }))}
                  placeholder="e.g. FotMob, LiveScore"
                  className={INPUT}
                />
              </Field>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4 accent-[#0B1929]"
                />
                <span className="text-sm text-gray-700">Account active</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 text-sm font-semibold py-2.5 rounded-lg transition-opacity disabled:opacity-50"
                  style={{ background: "#0B1929", color: "#D7B87A" }}
                >
                  {saving ? "Saving…" : editUser ? "Save Changes" : "Create User"}
                </button>
              </div>
            </form>
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

const INPUT = "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
