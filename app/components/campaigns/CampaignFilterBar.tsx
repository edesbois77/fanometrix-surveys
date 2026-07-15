import { useState } from "react";
import type { CampaignStatus } from "@/lib/campaign-status";
import { STUDY_TYPES, STUDY_TYPE_LABELS } from "@/lib/naming";

export type UsageFilter = "all" | "no_responses" | "has_responses" | "target_reached" | "end_reached";
export type DateFilter = "all" | "today" | "7days" | "30days";
export type SortBy = "recent" | "oldest" | "az" | "status";

const SELECT_CLS = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600";

// Search + status/usage/date/country/publisher/brand/sort — the same
// filter set for both the standalone Campaigns page and the Research
// Project Workspace's embedded Campaigns manager, so filtering behaves
// identically no matter where a user is scoping their campaign list.
export function CampaignFilterBar({
  search, onSearchChange,
  showStatusFilter, statusFilter, onStatusFilterChange,
  usageFilter, onUsageFilterChange,
  dateFilter, onDateFilterChange,
  typeFilter, onTypeFilterChange,
  countryFilter, onCountryFilterChange, countryOptions,
  publisherFilter, onPublisherFilterChange, publisherOptions,
  brandFilter, onBrandFilterChange, brandOptions,
  agencyFilter, onAgencyFilterChange, agencyOptions,
  sortBy, onSortByChange,
}: {
  search: string; onSearchChange: (v: string) => void;
  showStatusFilter: boolean;
  statusFilter: "all" | CampaignStatus; onStatusFilterChange: (v: "all" | CampaignStatus) => void;
  usageFilter: UsageFilter; onUsageFilterChange: (v: UsageFilter) => void;
  dateFilter: DateFilter; onDateFilterChange: (v: DateFilter) => void;
  typeFilter: string; onTypeFilterChange: (v: string) => void;
  countryFilter: string; onCountryFilterChange: (v: string) => void; countryOptions: [string, string][];
  publisherFilter: string; onPublisherFilterChange: (v: string) => void; publisherOptions: { id: string; name: string }[];
  brandFilter: string; onBrandFilterChange: (v: string) => void; brandOptions: { id: string; name: string }[];
  agencyFilter: string; onAgencyFilterChange: (v: string) => void; agencyOptions: { id: string; name: string }[];
  sortBy: SortBy; onSortByChange: (v: SortBy) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
        <input
          type="search"
          placeholder="Search campaigns…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
        />
      </div>

      <button
        type="button"
        onClick={() => setFiltersOpen(o => !o)}
        className="text-xs font-semibold text-[#0B1929] underline"
      >
        {filtersOpen ? "Hide Filters" : "Filter Campaigns"}
      </button>

      {filtersOpen && (
        <div className="flex flex-wrap gap-3">
          {showStatusFilter && (
            <select value={statusFilter} onChange={e => onStatusFilterChange(e.target.value as "all" | CampaignStatus)} className={SELECT_CLS}>
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="live">Live</option>
              <option value="paused">Paused</option>
            </select>
          )}

          <select value={usageFilter} onChange={e => onUsageFilterChange(e.target.value as UsageFilter)} className={SELECT_CLS}>
            <option value="all">All Usage</option>
            <option value="no_responses">No responses</option>
            <option value="has_responses">Has responses</option>
            <option value="target_reached">Target reached</option>
            <option value="end_reached">End date reached</option>
          </select>

          <select value={dateFilter} onChange={e => onDateFilterChange(e.target.value as DateFilter)} className={SELECT_CLS}>
            <option value="all">Any time</option>
            <option value="today">Today</option>
            <option value="7days">Last 7 days</option>
            <option value="30days">Last 30 days</option>
          </select>

          <select value={typeFilter} onChange={e => onTypeFilterChange(e.target.value)} className={SELECT_CLS}>
            <option value="all">All Types</option>
            {STUDY_TYPES.map(t => (
              <option key={t} value={t}>{STUDY_TYPE_LABELS[t]}</option>
            ))}
          </select>

          <select value={countryFilter} onChange={e => onCountryFilterChange(e.target.value)} className={SELECT_CLS}>
            <option value="all">All Countries</option>
            {countryOptions.map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>

          <select value={publisherFilter} onChange={e => onPublisherFilterChange(e.target.value)} className={SELECT_CLS}>
            <option value="all">All Publishers</option>
            {publisherOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select value={brandFilter} onChange={e => onBrandFilterChange(e.target.value)} className={SELECT_CLS}>
            <option value="all">All Brands</option>
            {brandOptions.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <select value={agencyFilter} onChange={e => onAgencyFilterChange(e.target.value)} className={SELECT_CLS}>
            <option value="all">All Agencies</option>
            {agencyOptions.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <select value={sortBy} onChange={e => onSortByChange(e.target.value as SortBy)} className={SELECT_CLS}>
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest first</option>
            <option value="az">A–Z</option>
            <option value="status">By status</option>
          </select>
        </div>
      )}
    </div>
  );
}
