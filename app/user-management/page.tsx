"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminShell } from "@/app/components/AdminShell";
import { DrawerSection } from "@/app/components/DrawerSection";
import { MultiSelect, type MultiSelectOption } from "@/app/components/MultiSelect";

// ─── Types ────────────────────────────────────────────────────────────────────
type Role = "admin" | "brand" | "agency" | "publisher";
type OrgType = "publisher" | "agency" | "brand" | "internal";
type AccessScope = "organisation_wide" | "selected";
type Status = "pending_invitation" | "active" | "disabled";

type User = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  work_email: string;
  job_title: string | null;
  role: Role;
  organisation_id: string | null;
  organisations: { name: string; type: OrgType } | null;
  access_scope: AccessScope;
  status: Status;
  last_login_at: string | null;
  password_changed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type Organisation = { id: string; name: string; type: OrgType; status: "active" | "disabled" };
type Grant = { resource_type: string; resource_id: string };

const NEW_ORG = "__new__";
const ROLES: Role[] = ["admin", "publisher", "agency", "brand"];
const ROLE_LABELS: Record<Role, string> = { admin: "Admin", publisher: "Publisher", agency: "Agency", brand: "Brand" };
const ORG_TYPE_LABELS: Record<OrgType, string> = { publisher: "Publisher", agency: "Agency", brand: "Brand", internal: "Internal" };

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return `${Math.floor(diff / 86_400_000)} days ago`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

function fullName(u: User): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="text-xs text-gray-500">
      {label}: <span className="text-gray-700">{value}</span>
    </span>
  );
}

function accessScopeLabel(u: { role: Role; access_scope: AccessScope }): string {
  if (u.access_scope === "organisation_wide") return u.role === "publisher" ? "Publisher-wide" : "Organisation-wide";
  return "Selected Access";
}

// ─── Password generator (uses Web Crypto) ─────────────────────────────────────
function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const syms = "!@#$%&*";
  const all = upper + lower + digits + syms;

  const rand = new Uint8Array(32);
  crypto.getRandomValues(rand);

  const chars: string[] = [
    upper[rand[0] % upper.length],
    lower[rand[1] % lower.length],
    digits[rand[2] % digits.length],
    syms[rand[3] % syms.length],
    ...Array.from({ length: 8 }, (_, i) => all[rand[4 + i] % all.length]),
  ];

  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand[12 + i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// ─── Credentials modal (shown once after account create / password reset) ─────
function CredentialsModal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copyCredentials() {
    const text = `Work Email: ${email}\nTemporary Password: ${password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: user copies manually.
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-sm w-full mx-4">
        <div className="text-center mb-5">
          <div className="text-2xl mb-2">🔐</div>
          <h2 className="text-lg font-bold text-gray-900">Account Ready</h2>
          <p className="text-sm text-gray-500 mt-1">Share these credentials securely.</p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Work Email</p>
            <p className="font-mono text-sm text-gray-900">{email}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Temporary Password</p>
            <p className="font-mono text-sm text-gray-900 tracking-widest">{password}</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-5">
          <p className="text-xs text-amber-800 font-medium">
            ⚠️ Copy these credentials now. The password cannot be viewed again.
          </p>
        </div>

        <div className="flex gap-3">
          <button onClick={copyCredentials}
            className="flex-1 text-sm font-semibold py-2.5 rounded-lg transition-colors"
            style={{ background: "#0B1929", color: "#D7B87A" }}>
            {copied ? "✓ Copied" : "Copy Credentials"}
          </button>
          <button onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────
type FormState = {
  first_name: string;
  last_name: string;
  work_email: string;
  job_title: string;
  new_password: string;
  confirm_password: string;
  force_password_change: boolean;
  role: Role;
  organisation_id: string; // "" = none, NEW_ORG = create-new mode
  new_org_name: string;
  new_org_type: OrgType;
  access_scope: AccessScope;
  status: Status;
  grants: string[]; // composite "resource_type:resource_id" values
};

const EMPTY_FORM: FormState = {
  first_name: "",
  last_name: "",
  work_email: "",
  job_title: "",
  new_password: "",
  confirm_password: "",
  force_password_change: true,
  role: "brand",
  organisation_id: "",
  new_org_name: "",
  new_org_type: "brand",
  access_scope: "organisation_wide",
  status: "active",
  grants: [],
};

const INPUT = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [accessOptions, setAccessOptions] = useState<MultiSelectOption[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) setUsers((await res.json()).data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    fetch("/api/organisations").then(r => r.json()).then(j => setOrgs(j.data ?? [])).catch(() => {});
    fetch("/api/access-search").then(r => r.json()).then(j => setAccessOptions(j.data ?? [])).catch(() => {});
  }, []);

  const orgsByType = useMemo(() => {
    const grouped: Record<OrgType, Organisation[]> = { publisher: [], agency: [], brand: [], internal: [] };
    for (const o of orgs) grouped[o.type].push(o);
    return grouped;
  }, [orgs]);

  function openCreate() {
    setEditUser(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setDrawerOpen(true);
  }

  async function openEdit(u: User) {
    setEditUser(u);
    setFormError("");
    setForm({
      first_name: u.first_name ?? "",
      last_name: u.last_name ?? "",
      work_email: u.work_email,
      job_title: u.job_title ?? "",
      new_password: "",
      confirm_password: "",
      force_password_change: false,
      role: u.role,
      organisation_id: u.organisation_id ?? "",
      new_org_name: "",
      new_org_type: "brand",
      access_scope: u.access_scope,
      status: u.status,
      grants: [],
    });
    setDrawerOpen(true);

    // Fetch this user's current grants to pre-populate Assign Permissions.
    const res = await fetch(`/api/users/${u.id}`);
    if (res.ok) {
      const detail = (await res.json()).data as User & { grants: Grant[] };
      setForm(f => ({ ...f, grants: detail.grants.map(g => `${g.resource_type}:${g.resource_id}`) }));
    }
  }

  function handleGeneratePassword() {
    const pwd = generatePassword();
    setForm(f => ({ ...f, new_password: pwd, confirm_password: pwd }));
  }

  async function handleSave() {
    setFormError("");

    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const email = form.work_email.trim();
    if (!firstName || !lastName) { setFormError("First and last name are required."); return; }
    if (!email) { setFormError("Work email is required."); return; }

    const hasPassword = form.new_password.length > 0;
    if (!editUser && !hasPassword) { setFormError("Password is required."); return; }
    if (hasPassword) {
      if (form.new_password.length < 8) { setFormError("Password must be at least 8 characters."); return; }
      if (form.new_password !== form.confirm_password) { setFormError("Passwords do not match."); return; }
    }

    if (form.organisation_id === NEW_ORG && !form.new_org_name.trim()) {
      setFormError("Enter a name for the new organisation."); return;
    }

    setSaving(true);

    // Create-new-organisation-inline, if that's what was selected.
    let organisationId = form.organisation_id;
    if (organisationId === NEW_ORG) {
      const orgRes = await fetch("/api/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.new_org_name.trim(), type: form.new_org_type }),
      });
      const orgJson = await orgRes.json();
      if (!orgRes.ok) { setSaving(false); setFormError(orgJson.error ?? "Failed to create organisation."); return; }
      organisationId = orgJson.data.id;
      setOrgs(prev => [...prev, orgJson.data]);
    }

    const effectiveScope: AccessScope = form.role === "publisher" ? "organisation_wide" : form.access_scope;
    const grants = effectiveScope === "selected"
      ? form.grants.map(v => {
          const idx = v.indexOf(":");
          return { resource_type: v.slice(0, idx), resource_id: v.slice(idx + 1) };
        })
      : [];

    const payload: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      work_email: email,
      job_title: form.job_title.trim() || null,
      role: form.role,
      organisation_id: organisationId || null,
      access_scope: effectiveScope,
      force_password_change: form.force_password_change,
      grants,
    };
    if (editUser) payload.status = form.status;
    if (hasPassword) payload.password = form.new_password;

    const url = editUser ? `/api/users/${editUser.id}` : "/api/users";
    const method = editUser ? "PUT" : "POST";

    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) { setFormError(json.error ?? "Failed to save. Please try again."); return; }

    if (hasPassword) {
      setCredentials({ email, password: form.new_password });
    } else {
      showToast(editUser ? "Account updated." : "Account created.");
    }

    setDrawerOpen(false);
    loadUsers();
  }

  async function toggleStatus(u: User) {
    const nextStatus: Status = u.status === "disabled" ? "active" : "disabled";
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const json = await res.json();
    if (!res.ok) { showToast(json.error ?? "Failed to update", false); return; }
    showToast(nextStatus === "disabled" ? "Account disabled." : "Account enabled.");
    loadUsers();
  }

  const filtered = useMemo(() => {
    let list = users;
    if (roleFilter !== "all") list = list.filter(u => u.role === roleFilter);
    if (statusFilter !== "all") list = list.filter(u => u.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        fullName(u).toLowerCase().includes(q) ||
        u.work_email.toLowerCase().includes(q) ||
        (u.organisations?.name ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, roleFilter, statusFilter, search]);

  const ROLE_COLOURS: Record<Role, string> = {
    admin: "bg-[#0B1929] text-white",
    brand: "bg-amber-100 text-amber-800",
    agency: "bg-blue-100 text-blue-800",
    publisher: "bg-green-100 text-green-800",
  };

  const STATUS_COLOURS: Record<Status, string> = {
    active: "bg-green-50 text-green-700",
    pending_invitation: "bg-amber-50 text-amber-700",
    disabled: "bg-gray-100 text-gray-500",
  };
  const STATUS_LABELS: Record<Status, string> = {
    active: "Active", pending_invitation: "Pending Invitation", disabled: "Disabled",
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">

        <div className="mb-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                {users.length} account{users.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button onClick={openCreate}
              className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex-shrink-0"
              style={{ background: "#0B1929", color: "#D7B87A" }}>
              + New Account
            </button>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="mb-5 space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
            <input
              type="search"
              placeholder="Search by name, email or organisation…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as typeof roleFilter)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
              <option value="all">All Roles</option>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending_invitation">Pending Invitation</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        {/* Accounts */}
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">No accounts match your filters.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(u => (
              <div key={u.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:border-gray-200 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <p className="font-semibold text-gray-900">{fullName(u) || <span className="text-gray-300">Unnamed account</span>}</p>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 whitespace-nowrap ${STATUS_COLOURS[u.status]}`}>
                    {STATUS_LABELS[u.status]}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-2">
                  <Meta label="Email" value={u.work_email} />
                  <Meta label="Organisation" value={u.organisations ? `${u.organisations.name} (${ORG_TYPE_LABELS[u.organisations.type]})` : "—"} />
                  <Meta label="Role" value={
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLOURS[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                  } />
                  <Meta label="Access Rights" value={accessScopeLabel(u)} />
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
                  <Meta label="Created" value={formatDate(u.created_at)} />
                  <Meta label="Last Login" value={relativeTime(u.last_login_at)} />
                  <Meta label="Last Updated" value={formatDate(u.updated_at)} />
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-gray-50">
                  <button onClick={() => openEdit(u)}
                    className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                    Edit
                  </button>
                  <button onClick={() => toggleStatus(u)}
                    className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${
                      u.status === "disabled"
                        ? "border-green-200 text-green-700 hover:bg-green-50"
                        : "border-red-100 text-red-400 hover:bg-red-50"
                    }`}>
                    {u.status === "disabled" ? "Enable" : "Disable"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create / Edit Drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-full sm:w-[480px] bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editUser ? `Edit ${fullName(editUser) || editUser.work_email}` : "New Account"}</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">

              {/* Section 1: User Details */}
              <DrawerSection step={1} title="User Details" subtitle="Who this account belongs to, and how they log in.">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First Name *">
                    <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                      className={INPUT} placeholder="Sarah" required />
                  </Field>
                  <Field label="Last Name *">
                    <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                      className={INPUT} placeholder="Jones" required />
                  </Field>
                </div>

                <Field label="Work Email *">
                  <input type="email" value={form.work_email} onChange={e => setForm(f => ({ ...f, work_email: e.target.value }))}
                    className={INPUT} placeholder="sarah.jones@dentsu.com" required />
                  <p className="text-xs text-gray-400 mt-1">This becomes the login username.</p>
                </Field>

                <Field label="Job Title">
                  <input value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))}
                    className={INPUT} placeholder="Account Director (optional)" />
                </Field>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    {editUser ? "Set New Password" : "Password *"}
                  </label>
                  <input type="password" value={form.new_password} onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))}
                    required={!editUser} placeholder="••••••••" className={INPUT} autoComplete="new-password" />
                </div>

                {(form.new_password.length > 0 || !editUser) && (
                  <Field label="Confirm Password">
                    <input type="password" value={form.confirm_password} onChange={e => setForm(f => ({ ...f, confirm_password: e.target.value }))}
                      required={!editUser || form.new_password.length > 0} placeholder="••••••••" className={INPUT} autoComplete="new-password" />
                  </Field>
                )}

                <button type="button" onClick={handleGeneratePassword}
                  className="w-full border border-dashed border-gray-300 text-gray-600 hover:border-[#D7B87A] hover:text-[#0B1929] text-sm py-2 rounded-lg transition-colors">
                  ⚡ Generate Temporary Password
                </button>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.force_password_change}
                    onChange={e => setForm(f => ({ ...f, force_password_change: e.target.checked }))}
                    className="w-4 h-4 mt-0.5 accent-[#0B1929] flex-shrink-0" />
                  <div>
                    <span className="text-sm text-gray-700 font-medium">Force password change on first login</span>
                    <p className="text-xs text-gray-400 mt-0.5">The user sets their own permanent password before accessing the platform.</p>
                  </div>
                </label>
              </DrawerSection>

              {/* Section 2: Organisation */}
              <DrawerSection step={2} title="Organisation" subtitle="Which company this person belongs to.">
                <Field label="Organisation">
                  <select value={form.organisation_id} onChange={e => setForm(f => ({ ...f, organisation_id: e.target.value }))}
                    className={INPUT}>
                    <option value="">No organisation</option>
                    <option value={NEW_ORG}>+ Create New Organisation…</option>
                    {(["publisher", "agency", "brand", "internal"] as OrgType[]).map(t => (
                      orgsByType[t].length > 0 && (
                        <optgroup key={t} label={ORG_TYPE_LABELS[t] + "s"}>
                          {orgsByType[t].map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </optgroup>
                      )
                    ))}
                  </select>
                </Field>

                {form.organisation_id === NEW_ORG && (
                  <div className="grid grid-cols-2 gap-3 bg-gray-50 border border-gray-100 rounded-lg p-3">
                    <Field label="New Org Name">
                      <input value={form.new_org_name} onChange={e => setForm(f => ({ ...f, new_org_name: e.target.value }))}
                        className={INPUT} placeholder="e.g. Snack Media" />
                    </Field>
                    <Field label="Type">
                      <select value={form.new_org_type} onChange={e => setForm(f => ({ ...f, new_org_type: e.target.value as OrgType }))}
                        className={INPUT}>
                        <option value="publisher">Publisher</option>
                        <option value="agency">Agency</option>
                        <option value="brand">Brand</option>
                        <option value="internal">Internal</option>
                      </select>
                    </Field>
                  </div>
                )}
              </DrawerSection>

              {/* Section 3: Role */}
              <DrawerSection step={3} title="Role" subtitle="What type of user this is.">
                <Field label="Role">
                  <select value={form.role}
                    onChange={e => {
                      const role = e.target.value as Role;
                      setForm(f => ({ ...f, role, access_scope: role === "publisher" ? "organisation_wide" : f.access_scope }));
                    }}
                    className={INPUT}>
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </Field>
              </DrawerSection>

              {/* Section 4: Access Scope */}
              <DrawerSection step={4} title="Access Scope" subtitle="What this user is allowed to see." prominent>
                {form.role === "publisher" ? (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                    <p className="text-xs text-blue-700 font-medium">Publisher-wide (fixed)</p>
                    <p className="text-xs text-blue-500 mt-0.5">
                      Publisher accounts always see everything belonging to their own organisation only, and nothing else.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(["organisation_wide", "selected"] as AccessScope[]).map(scope => (
                      <label key={scope} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        form.access_scope === scope ? "border-[#D7B87A] bg-[#FBF5E8]/50" : "border-gray-200"
                      }`}>
                        <input type="radio" name="access_scope" checked={form.access_scope === scope}
                          onChange={() => setForm(f => ({ ...f, access_scope: scope }))}
                          className="w-4 h-4 mt-0.5 accent-[#0B1929] flex-shrink-0" />
                        <div>
                          <span className="text-sm text-gray-800 font-medium">
                            {scope === "organisation_wide" ? "Organisation-wide" : "Selected Access"}
                          </span>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {scope === "organisation_wide"
                              ? "Sees everything belonging to their organisation, automatically."
                              : "Only sees the specific Research Projects, Campaign Groups, Campaigns, and Insights assigned below."}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </DrawerSection>

              {/* Section 5: Assign Permissions */}
              {form.role !== "publisher" && form.access_scope === "selected" && (
                <DrawerSection step={5} title="Assign Permissions" subtitle="Search across everything, assign at the highest level that makes sense.">
                  <MultiSelect
                    options={accessOptions}
                    selected={form.grants}
                    onChange={v => setForm(f => ({ ...f, grants: v }))}
                    placeholder="Search Research Projects, Campaign Groups, Campaigns, Insights…"
                    helperText="Granting a Research Project or Campaign Group automatically includes everything inside it, there's usually no need to also add its individual campaigns."
                  />
                </DrawerSection>
              )}

              {editUser && (
                <DrawerSection step={form.role !== "publisher" && form.access_scope === "selected" ? 6 : 5} title="Status">
                  <Field label="Account Status">
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))}
                      className={INPUT}>
                      <option value="active">Active</option>
                      <option value="pending_invitation">Pending Invitation</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </Field>
                </DrawerSection>
              )}

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                  <p className="text-red-600 text-sm">{formError}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button type="button" onClick={() => setDrawerOpen(false)} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60"
                style={{ background: "#D7B87A", color: "#0B1929" }}>
                {saving ? "Saving…" : editUser ? "Save Changes" : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Credentials modal (shown once) ── */}
      {credentials && (
        <CredentialsModal
          email={credentials.email}
          password={credentials.password}
          onClose={() => { setCredentials(null); showToast("Account ready. Share credentials securely."); }}
        />
      )}

      {/* ── Toast ── */}
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
