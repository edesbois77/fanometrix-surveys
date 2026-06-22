"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AdminShell } from "@/app/components/AdminShell";

// ─── Types ────────────────────────────────────────────────────────────────────
type User = {
  id: string;
  username: string;
  role: "admin" | "brand" | "agency" | "publisher";
  organisation_name: string;
  allowed_campaign_ids: string[];
  allowed_publisher_ids: string[];
  is_active: boolean;
  force_password_change: boolean;
  created_at: string;
  updated_at: string;
};

type Option = { value: string; label: string };
type CampaignOption = Option & { created_at: string };

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLES = ["admin", "brand", "agency", "publisher"] as const;


// ─── Password generator (uses Web Crypto) ─────────────────────────────────────
function generatePassword(): string {
  const upper  = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower  = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const syms   = "!@#$%&*";
  const all    = upper + lower + digits + syms;

  const rand = new Uint8Array(32);
  crypto.getRandomValues(rand);

  const chars: string[] = [
    upper[rand[0]  % upper.length],
    lower[rand[1]  % lower.length],
    digits[rand[2] % digits.length],
    syms[rand[3]   % syms.length],
    ...Array.from({ length: 8 }, (_, i) => all[rand[4 + i] % all.length]),
  ];

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand[12 + i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// ─── Searchable multi-select ──────────────────────────────────────────────────
function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Search…",
  helperText,
  strict = false,
  onUnmatchedText,
}: {
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  helperText?: string;
  /** When true, typing an unrecognised value is flagged as an error */
  strict?: boolean;
  /** Called with true when there is unmatched text, false when cleared */
  onUnmatchedText?: (hasUnmatched: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [open,   setOpen]   = useState(false);
  const inputRef            = useRef<HTMLInputElement>(null);
  const dropRef             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        dropRef.current  && !dropRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const remaining = options.filter(
    o => !selected.includes(o.value) &&
         o.label.toLowerCase().includes(search.toLowerCase())
  );

  // Notify parent whether there is unmatched text pending
  const hasUnmatched = strict && search.trim().length > 0 && remaining.length === 0;
  useEffect(() => {
    onUnmatchedText?.(hasUnmatched);
  }, [hasUnmatched, onUnmatchedText]);

  function add(value: string) {
    onChange([...selected, value]);
    setSearch("");
    onUnmatchedText?.(false);
    inputRef.current?.focus();
  }

  function remove(value: string) {
    onChange(selected.filter(v => v !== value));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault(); // always stop outer form submitting
      if (remaining.length > 0) add(remaining[0].value); // select first match
    }
    if (e.key === "Escape") { setOpen(false); setSearch(""); onUnmatchedText?.(false); }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value);
    setOpen(true);
    if (!e.target.value.trim()) onUnmatchedText?.(false);
  }

  const labelFor = (v: string) => options.find(o => o.value === v)?.label ?? v;

  return (
    <div>
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
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? placeholder : "Add another…"}
          className={[INPUT, hasUnmatched ? "border-red-400 focus:border-red-400" : ""].join(" ").trim()}
          autoComplete="off"
        />
        {hasUnmatched && (
          <p className="text-xs text-red-500 mt-1">
            &ldquo;{search}&rdquo; is not a recognised publisher — select from the list, or add it in Administration → Publishers first.
          </p>
        )}
        {open && !hasUnmatched && (
          <div ref={dropRef} className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
            {remaining.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-gray-400">
                {search ? "No matches found" : "All selected"}
              </p>
            ) : (
              remaining.map(o => (
                <button
                  key={o.value} type="button"
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

// ─── Credentials modal (shown once after account create / password reset) ─────
function CredentialsModal({
  username,
  password,
  onClose,
}: {
  username: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCredentials() {
    const text = `Username: ${username}\nTemporary Password: ${password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: select the text manually
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Username</p>
            <p className="font-mono text-sm text-gray-900">{username}</p>
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
          <button
            onClick={copyCredentials}
            className="flex-1 text-sm font-semibold py-2.5 rounded-lg transition-colors"
            style={{ background: "#0B1929", color: "#D7B87A" }}
          >
            {copied ? "✓ Copied" : "Copy Credentials"}
          </button>
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────
type FormState = {
  username:              string;
  new_password:          string;
  confirm_password:      string;
  force_password_change: boolean;
  role:                  User["role"];
  organisation_name:     string;
  allowed_campaign_ids:  string[];
  allowed_publisher_ids: string[];
  is_active:             boolean;
};

const EMPTY_FORM: FormState = {
  username:              "",
  new_password:          "",
  confirm_password:      "",
  force_password_change: true,
  role:                  "brand",
  organisation_name:     "",
  allowed_campaign_ids:  [],
  allowed_publisher_ids: [],
  is_active:             true,
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function UserManagementPage() {
  const [users,           setUsers]           = useState<User[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [showModal,       setShowModal]       = useState(false);
  const [editUser,        setEditUser]        = useState<User | null>(null);
  const [form,            setForm]            = useState<FormState>({ ...EMPTY_FORM });
  const [formError,       setFormError]       = useState("");
  const [saving,          setSaving]          = useState(false);
  const [toast,           setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [credentials,     setCredentials]     = useState<{ username: string; password: string } | null>(null);
  const [campaignOptions,     setCampaignOptions]     = useState<CampaignOption[]>([]);
  const [publisherOptions,    setPublisherOptions]    = useState<Option[]>([]);
  const [publisherUnmatched,  setPublisherUnmatched]  = useState(false);
  const [campaignSort,        setCampaignSort]        = useState<"recent" | "alpha">("recent");

  // ── Table sort ───────────────────────────────────────────────────────────────
  type SortCol = "username" | "role" | "organisation_name" | "is_active" | "updated_at";
  type SortDir = "asc" | "desc";
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const sortedUsers = useMemo(() => {
    if (!sortCol) return users;
    return [...users].sort((a, b) => {
      let va: string | number;
      let vb: string | number;
      switch (sortCol) {
        case "username":
          va = a.username.toLowerCase(); vb = b.username.toLowerCase(); break;
        case "role":
          va = a.role; vb = b.role; break;
        case "organisation_name":
          va = (a.organisation_name || "").toLowerCase();
          vb = (b.organisation_name || "").toLowerCase(); break;
        case "is_active":
          va = a.is_active ? 0 : 1; vb = b.is_active ? 0 : 1; break;
        case "updated_at":
          va = a.updated_at ?? a.created_at;
          vb = b.updated_at ?? b.created_at; break;
        default: return 0;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ?  1 : -1;
      return 0;
    });
  }, [users, sortCol, sortDir]);

  // ── Load users ──────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) setUsers((await res.json()).data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ── Load campaign + publisher options ───────────────────────────────────────
  useEffect(() => {
    Promise.all([fetch("/api/campaigns"), fetch("/api/publishers")])
      .then(async ([camRes, pubRes]) => {
        const camData: Array<{
          campaign_id: string; campaign_name: string;
          brand_name: string; publisher: string | null; created_at: string;
        }> = (await camRes.json()).data ?? [];
        const pubData: Array<{ name: string }> = (await pubRes.json()).data ?? [];

        setCampaignOptions(
          camData.map(c => ({
            value:      c.campaign_id,
            label:      `${c.campaign_name} — ${c.brand_name}`,
            created_at: c.created_at,
          }))
        );

        // Publishers registry is primary source; supplement with any names
        // set directly on campaigns (covers legacy / unlisted ones)
        const seen = new Set<string>(pubData.map(p => p.name));
        for (const c of camData) if (c.publisher?.trim()) seen.add(c.publisher.trim());
        setPublisherOptions([...seen].sort().map(p => ({ value: p, label: p })));
      })
      .catch(() => {});
  }, []);

  const sortedCampaignOptions: Option[] = campaignSort === "alpha"
    ? [...campaignOptions].sort((a, b) => a.label.localeCompare(b.label))
    : [...campaignOptions].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function openCreate() {
    setEditUser(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setShowModal(true);
  }

  function openEdit(u: User) {
    setEditUser(u);
    setForm({
      username:              u.username,
      new_password:          "",
      confirm_password:      "",
      force_password_change: u.force_password_change,
      role:                  u.role,
      organisation_name:     u.organisation_name,
      allowed_campaign_ids:  u.allowed_campaign_ids  ?? [],
      allowed_publisher_ids: u.allowed_publisher_ids ?? [],
      is_active:             u.is_active,
    });
    setFormError("");
    setShowModal(true);
  }

  function handleGeneratePassword() {
    const pwd = generatePassword();
    setForm(f => ({ ...f, new_password: pwd, confirm_password: pwd }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    // Block save if there is unmatched text in the publisher search input
    if (publisherUnmatched) {
      setFormError("Please select a publisher from the list, or clear the Publisher Access search field before saving.");
      return;
    }

    // Validate username — stored as typed, matched case-insensitively at login
    const cleanUsername = form.username.trim();
    if (!cleanUsername) { setFormError("Username is required."); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
      setFormError("Username may only contain letters, numbers, underscores and hyphens.");
      return;
    }

    // Validate password
    const hasPassword = form.new_password.length > 0;
    if (!editUser && !hasPassword) { setFormError("Password is required."); return; }
    if (hasPassword) {
      if (form.new_password.length < 8) { setFormError("Password must be at least 8 characters."); return; }
      if (form.new_password !== form.confirm_password) { setFormError("Passwords do not match."); return; }
    }

    setSaving(true);

    const payload: Record<string, unknown> = {
      username:              cleanUsername,
      role:                  form.role,
      organisation_name:     form.organisation_name,
      allowed_campaign_ids:  form.allowed_campaign_ids,
      allowed_publisher_ids: form.allowed_publisher_ids,
      is_active:             form.is_active,
      force_password_change: form.force_password_change,
    };
    if (hasPassword) payload.password = form.new_password;

    const url    = editUser ? `/api/users/${editUser.id}` : "/api/users";
    const method = editUser ? "PUT" : "POST";

    const res  = await fetch(url, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setFormError(json.error ?? "Failed to save. Please try again.");
      return;
    }

    // Show credentials modal if a password was set
    if (hasPassword) {
      setCredentials({ username: cleanUsername, password: form.new_password });
    } else {
      showToast(editUser ? "Account updated." : "Account created.");
    }

    setPublisherUnmatched(false);
    setShowModal(false);
    loadUsers();
  }

  async function toggleActive(u: User) {
    const res  = await fetch(`/api/users/${u.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !u.is_active }),
    });
    const json = await res.json();
    if (!res.ok) { showToast(json.error ?? "Failed to update", false); return; }
    showToast(u.is_active ? "Account disabled." : "Account enabled.");
    loadUsers();
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
      <div className="p-4 md:p-6 max-w-6xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-sm text-gray-400 mt-0.5">Organisation accounts and platform access.</p>
          </div>
          <button onClick={openCreate}
            className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            style={{ background: "#0B1929", color: "#D7B87A" }}>
            + New Account
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No accounts yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {(
                    [
                      { col: "username"          as SortCol, label: "Username"      },
                      { col: "role"              as SortCol, label: "Access Rights" },
                      { col: "organisation_name" as SortCol, label: "Organisation"  },
                      { col: "is_active"         as SortCol, label: "Status"        },
                      { col: "updated_at"        as SortCol, label: "Last Updated"  },
                    ] as { col: SortCol; label: string }[]
                  ).map(({ col, label }) => {
                    const active = sortCol === col;
                    return (
                      <th key={col} className="text-left px-5 py-3">
                        <button
                          onClick={() => handleSort(col)}
                          className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors select-none ${
                            active ? "text-[#0B1929]" : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          {label}
                          <span className="text-[10px] leading-none">
                            {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map(u => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-gray-700">
                      {u.username}
                      {u.force_password_change && (
                        <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-sans">
                          pwd reset
                        </span>
                      )}
                    </td>
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
                      {u.updated_at
                        ? new Date(u.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : new Date(u.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3 justify-end">
                        <button onClick={() => openEdit(u)}
                          className="text-xs text-gray-500 hover:text-gray-800 transition-colors">
                          Edit
                        </button>
                        <button onClick={() => toggleActive(u)}
                          className={`text-xs font-medium transition-colors ${
                            u.is_active ? "text-red-400 hover:text-red-600" : "text-green-500 hover:text-green-700"
                          }`}>
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

      {/* ── Create / Edit modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-lg w-full mx-4 max-h-[92vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-5">
              {editUser ? `Edit ${editUser.username}` : "New Account"}
            </h2>

            <form onSubmit={handleSave} className="space-y-4">

              {/* Username — always editable */}
              <Field label="Username">
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  required
                  placeholder="e.g. FotMob_Admin"
                  className={INPUT}
                  spellCheck={false}
                  autoCapitalize="none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Letters, numbers, underscores and hyphens only. Login is not case-sensitive.
                </p>
              </Field>

              {/* Password */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    {editUser ? "Set New Password" : "Password"}
                  </label>
                  <input
                    type="password"
                    value={form.new_password}
                    onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))}
                    required={!editUser}
                    placeholder="••••••••"
                    className={INPUT}
                    autoComplete="new-password"
                  />
                </div>

                {(form.new_password.length > 0 || !editUser) && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={form.confirm_password}
                      onChange={e => setForm(f => ({ ...f, confirm_password: e.target.value }))}
                      required={!editUser || form.new_password.length > 0}
                      placeholder="••••••••"
                      className={INPUT}
                      autoComplete="new-password"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="w-full border border-dashed border-gray-300 text-gray-600 hover:border-[#D7B87A] hover:text-[#0B1929] text-sm py-2 rounded-lg transition-colors"
                >
                  ⚡ Generate Temporary Password
                </button>

                <p className="text-xs text-gray-400">
                  Passwords cannot be viewed. You can only set or generate a new password.
                </p>
              </div>

              {/* Force password change */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.force_password_change}
                  onChange={e => setForm(f => ({ ...f, force_password_change: e.target.checked }))}
                  className="w-4 h-4 mt-0.5 accent-[#0B1929] flex-shrink-0"
                />
                <div>
                  <span className="text-sm text-gray-700 font-medium">Force password change on first login</span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    The user will be prompted to set a permanent password before accessing the platform.
                  </p>
                </div>
              </label>

              <hr className="border-gray-100" />

              {/* Role */}
              <Field label="Access Rights">
                <select value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as User["role"] }))}
                  className={INPUT} required>
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </Field>

              {/* Organisation Name */}
              <Field label="Organisation Name">
                <input type="text" value={form.organisation_name}
                  onChange={e => setForm(f => ({ ...f, organisation_name: e.target.value }))}
                  placeholder="e.g. Carlsberg" className={INPUT} />
              </Field>


              <hr className="border-gray-100" />

              {/* Campaign Access */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Campaign Access
                  </label>
                  <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                    <button type="button" onClick={() => setCampaignSort("recent")}
                      className={`px-2.5 py-1 transition-colors ${campaignSort === "recent" ? "bg-[#0B1929] text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                      Recent
                    </button>
                    <button type="button" onClick={() => setCampaignSort("alpha")}
                      className={`px-2.5 py-1 border-l border-gray-200 transition-colors ${campaignSort === "alpha" ? "bg-[#0B1929] text-white" : "text-gray-500 hover:bg-gray-50"}`}>
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
                  strict
                  onUnmatchedText={setPublisherUnmatched}
                />
              </Field>

              <hr className="border-gray-100" />

              {/* Account active */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4 accent-[#0B1929]" />
                <span className="text-sm text-gray-700">Account active</span>
              </label>

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                  <p className="text-red-600 text-sm">{formError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setPublisherUnmatched(false); setShowModal(false); }}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 text-sm font-semibold py-2.5 rounded-lg transition-opacity disabled:opacity-50"
                  style={{ background: "#0B1929", color: "#D7B87A" }}>
                  {saving ? "Saving…" : editUser ? "Save Changes" : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Credentials modal (shown once) ── */}
      {credentials && (
        <CredentialsModal
          username={credentials.username}
          password={credentials.password}
          onClose={() => {
            setCredentials(null);
            showToast("Account ready. Share credentials securely.");
          }}
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
