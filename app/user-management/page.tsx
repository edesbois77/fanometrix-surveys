"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AdminShell } from "@/app/components/AdminShell";

// ─── Types ────────────────────────────────────────────────────────────────────
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

type Option = { value: string; label: string };
type CampaignOption = Option & { created_at: string };

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLES = ["admin", "brand", "agency", "publisher"] as const;

const ORG_TYPES = ["Admin", "Agency", "Brand", "Publisher"] as const;

const KNOWN_PUBLISHERS = [
  "FotMob", "LiveScore", "SofaScore", "Flashscore",
  "Forza Football", "OneFootball", "WhoScored", "Sofascore",
];

// ─── Searchable multi-select ──────────────────────────────────────────────────
function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Search…",
  helperText,
}: {
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  helperText?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen]     = useState(false);
  const inputRef            = useRef<HTMLInputElement>(null);
  const dropRef             = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const remaining = options.filter(
    o => !selected.includes(o.value) &&
         o.label.toLowerCase().includes(search.toLowerCase())
  );

  function add(value: string) {
    onChange([...selected, value]);
    setSearch("");
    inputRef.current?.focus();
  }

  function remove(value: string) {
    onChange(selected.filter(v => v !== value));
  }

  function labelFor(v: string) {
    return options.find(o => o.value === v)?.label ?? v;
  }

  return (
    <div>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(v => (
            <span key={v} className="inline-flex items-center gap-1 text-xs bg-[#0B1929]/8 text-[#0B1929] border border-[#0B1929]/15 px-2.5 py-1 rounded-full">
              {labelFor(v)}
              <button type="button" onClick={() => remove(v)} className="text-gray-400 hover:text-gray-700 leading-none">×</button>
            </span>
          ))}
        </div>
      )}

      {/* Input + dropdown */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? placeholder : "Add another…"}
          className={INPUT}
          autoComplete="off"
        />

        {open && (
          <div ref={dropRef} className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {remaining.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-gray-400">
                {search ? "No matches found" : selected.length === options.length ? "All selected" : "No options"}
              </p>
            ) : (
              remaining.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); add(o.value); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {helperText && <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{helperText}</p>}
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────
type FormState = {
  username:              string;
  password:              string;
  role:                  User["role"];
  organisation_name:     string;
  organisation_type:     string;
  allowed_campaign_ids:  string[];
  allowed_publisher_ids: string[];
  is_active:             boolean;
};

const EMPTY_FORM: FormState = {
  username:              "",
  password:              "",
  role:                  "brand",
  organisation_name:     "",
  organisation_type:     "",
  allowed_campaign_ids:  [],
  allowed_publisher_ids: [],
  is_active:             true,
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function UserManagementPage() {
  const [users,         setUsers]         = useState<User[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showModal,     setShowModal]     = useState(false);
  const [editUser,      setEditUser]      = useState<User | null>(null);
  const [form,          setForm]          = useState<FormState>({ ...EMPTY_FORM });
  const [saving,        setSaving]        = useState(false);
  const [toast,         setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  // Options for the multi-selects
  const [campaignOptions,  setCampaignOptions]  = useState<CampaignOption[]>([]);
  const [publisherOptions, setPublisherOptions] = useState<Option[]>([]);
  const [campaignSort,     setCampaignSort]     = useState<"recent" | "alpha">("recent");

  // ── Load users ──────────────────────────────────────────────────────────────
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

  // ── Load campaign + publisher options ───────────────────────────────────────
  useEffect(() => {
    fetch("/api/campaigns")
      .then(r => r.json())
      .then(json => {
        const data: Array<{
          campaign_id: string;
          campaign_name: string;
          brand_name: string;
          publishers: string[];
          created_at: string;
        }> = json.data ?? [];

        setCampaignOptions(
          data.map(c => ({
            value:      c.campaign_id,
            label:      `${c.campaign_name} — ${c.brand_name}`,
            created_at: c.created_at,
          }))
        );

        // Merge publishers from campaigns + known static list, deduplicate
        const seen = new Set<string>(KNOWN_PUBLISHERS);
        for (const c of data) {
          for (const p of c.publishers ?? []) {
            if (p.trim()) seen.add(p.trim());
          }
        }
        setPublisherOptions(
          [...seen].sort().map(p => ({ value: p, label: p }))
        );
      })
      .catch(() => {
        // Fallback to static publisher list if campaigns fetch fails
        setPublisherOptions(
          KNOWN_PUBLISHERS.map(p => ({ value: p, label: p }))
        );
      });
  }, []);

  // Sorted campaign options
  const sortedCampaignOptions: Option[] = campaignSort === "alpha"
    ? [...campaignOptions].sort((a, b) => a.label.localeCompare(b.label))
    : [...campaignOptions].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

  // ── Modal helpers ────────────────────────────────────────────────────────────
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

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
      allowed_campaign_ids:  u.allowed_campaign_ids  ?? [],
      allowed_publisher_ids: u.allowed_publisher_ids ?? [],
      is_active:             u.is_active,
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      username:              form.username.toLowerCase().trim(),
      role:                  form.role,
      organisation_name:     form.organisation_name,
      organisation_type:     form.organisation_type,
      allowed_campaign_ids:  form.allowed_campaign_ids,
      allowed_publisher_ids: form.allowed_publisher_ids,
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

  // ── Render ───────────────────────────────────────────────────────────────────
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
                      {new Date(u.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
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

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-5">
              {editUser ? `Edit ${editUser.username}` : "New User"}
            </h2>

            <form onSubmit={handleSave} className="space-y-4">

              {/* Username — create only */}
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

              {/* Password */}
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

              {/* Role */}
              <Field label="Role">
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as User["role"] }))}
                  className={INPUT}
                  required
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </Field>

              {/* Organisation Name */}
              <Field label="Organisation Name">
                <input
                  type="text"
                  value={form.organisation_name}
                  onChange={e => setForm(f => ({ ...f, organisation_name: e.target.value }))}
                  placeholder="e.g. Carlsberg"
                  className={INPUT}
                />
              </Field>

              {/* Organisation Type — dropdown */}
              <Field label="Organisation Type">
                <select
                  value={form.organisation_type}
                  onChange={e => setForm(f => ({ ...f, organisation_type: e.target.value }))}
                  className={INPUT}
                >
                  <option value="">Select type…</option>
                  {ORG_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>

              {/* Campaign Access */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Campaign Access
                  </label>
                  <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => setCampaignSort("recent")}
                      className={`px-2.5 py-1 transition-colors ${campaignSort === "recent" ? "bg-[#0B1929] text-white" : "text-gray-500 hover:bg-gray-50"}`}
                    >
                      Recent
                    </button>
                    <button
                      type="button"
                      onClick={() => setCampaignSort("alpha")}
                      className={`px-2.5 py-1 border-l border-gray-200 transition-colors ${campaignSort === "alpha" ? "bg-[#0B1929] text-white" : "text-gray-500 hover:bg-gray-50"}`}
                    >
                      A–Z
                    </button>
                  </div>
                </div>
                <MultiSelect
                  options={sortedCampaignOptions}
                  selected={form.allowed_campaign_ids}
                  onChange={v => setForm(f => ({ ...f, allowed_campaign_ids: v }))}
                  placeholder="Search campaigns…"
                  helperText="Restrict this account to specific campaigns. Leave blank for access to all campaigns."
                />
              </div>

              {/* Publisher Access */}
              <Field label="Publisher Access">
                <MultiSelect
                  options={publisherOptions}
                  selected={form.allowed_publisher_ids}
                  onChange={v => setForm(f => ({ ...f, allowed_publisher_ids: v }))}
                  placeholder="Search publishers…"
                  helperText="Restrict this account to specific publishers. Leave blank for access to all publishers."
                />
              </Field>

              {/* Active toggle */}
              <label className="flex items-center gap-3 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4 accent-[#0B1929]"
                />
                <span className="text-sm text-gray-700">Account active</span>
              </label>

              {/* Actions */}
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

// ─── Shared styles ────────────────────────────────────────────────────────────
const INPUT = "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors bg-white";

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
