"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";

type AccessRequest = {
  id: string;
  name: string;
  email: string;
  organisation: string;
  role: string | null;
  message: string | null;
  status: "pending" | "approved" | "declined";
  created_at: string;
};

const STATUS_STYLE: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  declined: "bg-red-100 text-red-600",
};

const STATUS_LABEL: Record<string, string> = {
  pending:  "Pending",
  approved: "Ready to Create",
  declined: "Declined",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)     return "Just now";
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AccessRequestsPage() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<"all" | "pending" | "approved" | "declined">("pending");
  const [updating, setUpdating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/access-requests");
    const json = await res.json();
    setRequests(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: string, status: AccessRequest["status"]) {
    setUpdating(id);
    const res  = await fetch(`/api/access-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setUpdating(null);
    if (res.ok) {
      const label = status === "approved" ? "marked as ready to create" : `marked as ${status}`;
      showToast(`Request ${label}.`);
      load();
    } else {
      showToast("Failed to update status.", false);
    }
  }

  const displayed = filter === "all" ? requests : requests.filter(r => r.status === filter);
  const counts = {
    all:      requests.length,
    pending:  requests.filter(r => r.status === "pending").length,
    approved: requests.filter(r => r.status === "approved").length,
    declined: requests.filter(r => r.status === "declined").length,
  };

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Access Requests</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {counts.pending} pending · {counts.approved} approved · {counts.declined} declined
          </p>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-lg">
            Submissions from the public homepage "Request Access" form.
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-5 border-b border-gray-200">
          {(["pending", "all", "approved", "declined"] as const).map(f => {
            const label = f === "approved" ? "Ready to Create" : f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1);
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  filter === f
                    ? "border-[#0B1929] text-[#0B1929]"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {label} ({counts[f]})
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 animate-pulse">
                <div className="h-4 w-48 bg-gray-100 rounded mb-2" />
                <div className="h-3 w-72 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <p className="text-gray-400 text-sm">No {filter === "all" ? "" : filter} requests yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayed.map(r => (
              <div
                key={r.id}
                className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden"
              >
                {/* Summary row */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Status dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    r.status === "pending"  ? "bg-amber-400" :
                    r.status === "approved" ? "bg-green-500" : "bg-red-400"
                  }`} />

                  {/* Name + org */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.name}</p>
                      {r.role && (
                        <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">
                          {r.role}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {r.organisation} · <a href={`mailto:${r.email}`} className="text-[#D7B87A] hover:underline">{r.email}</a>
                    </p>
                  </div>

                  {/* Time */}
                  <p className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                    {relativeTime(r.created_at)}
                  </p>

                  {/* Status badge */}
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_STYLE[r.status]}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>

                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    className="text-gray-300 hover:text-gray-500 text-xs flex-shrink-0 ml-1"
                  >
                    {expanded === r.id ? "▲" : "▼"}
                  </button>
                </div>

                {/* Expanded detail */}
                {expanded === r.id && (
                  <div className="border-t border-gray-50 px-5 py-4 space-y-3">
                    {r.message && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Message</p>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{r.message}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <p className="text-xs text-gray-400 mr-auto">
                        Submitted {new Date(r.created_at).toLocaleString("en-GB")}
                      </p>
                      {r.status !== "approved" && (
                        <button
                          onClick={() => updateStatus(r.id, "approved")}
                          disabled={updating === r.id}
                          title="Mark this request as ready to create an account — no account is created automatically"
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {updating === r.id ? "…" : "Mark Ready"}
                        </button>
                      )}
                      {r.status !== "declined" && (
                        <button
                          onClick={() => updateStatus(r.id, "declined")}
                          disabled={updating === r.id}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50 transition-colors"
                        >
                          {updating === r.id ? "…" : "Decline"}
                        </button>
                      )}
                      {r.status !== "pending" && (
                        <button
                          onClick={() => updateStatus(r.id, "pending")}
                          disabled={updating === r.id}
                          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
                        >
                          Reset to pending
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
