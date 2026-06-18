"use client";

import type { SurveyResponse } from "@/lib/types";

export type DashFilters = {
  campaign_id: string; publisher: string; placement: string; club: string;
  competition: string; country: string; fan_segment: string;
  device: string; browser: string; q1: string; q2: string; q3: string;
};

export type DatePreset = "all" | "today" | "7d" | "30d" | "campaign" | "custom";

export const EMPTY_DASH_FILTERS: DashFilters = {
  campaign_id: "", publisher: "", placement: "", club: "",
  competition: "", country: "", fan_segment: "",
  device: "", browser: "", q1: "", q2: "", q3: "",
};

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "all",      label: "All Time"     },
  { key: "today",    label: "Today"        },
  { key: "7d",       label: "Last 7 Days"  },
  { key: "30d",      label: "Last 30 Days" },
  { key: "campaign", label: "This Campaign"},
  { key: "custom",   label: "Custom Range" },
];

const FILTER_FIELDS: { label: string; field: keyof DashFilters }[] = [
  { label: "Campaign",    field: "campaign_id"  },
  { label: "Publisher",   field: "publisher"    },
  { label: "Placement",   field: "placement"    },
  { label: "Club",        field: "club"         },
  { label: "Competition", field: "competition"  },
  { label: "Country",     field: "country"      },
  { label: "Fan Segment", field: "fan_segment"  },
  { label: "Device",      field: "device"       },
  { label: "Browser",     field: "browser"      },
];

function uniqueVals(data: SurveyResponse[], field: keyof SurveyResponse): string[] {
  return [...new Set(data.map(r => r[field] as string).filter(Boolean))].sort();
}

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid rgba(11,25,41,0.08)",
  borderRadius: 16,
  marginBottom: 16,
  boxShadow: "0 4px 20px rgba(11,25,41,0.06)",
};

const inputSt: React.CSSProperties = {
  width: "100%",
  background: "#F7F6F2",
  border: "1px solid rgba(11,25,41,0.10)",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  color: "#0B1929",
  outline: "none",
};

interface Props {
  allResponses: SurveyResponse[];
  filters: DashFilters;
  setFilter: (field: keyof DashFilters, value: string) => void;
  clearFilters: () => void;
  datePreset: DatePreset;
  setDatePreset: (p: DatePreset) => void;
  dateFrom: string; dateTo: string;
  setDateFrom: (v: string) => void; setDateTo: (v: string) => void;
  campaignHasDates: boolean;
  filteredCount: number; totalCount: number;
}

export function DashboardFilters({
  allResponses, filters, setFilter, clearFilters,
  datePreset, setDatePreset, dateFrom, dateTo, setDateFrom, setDateTo,
  campaignHasDates, filteredCount, totalCount,
}: Props) {
  const chips: { label: string; field: keyof DashFilters | "__date__"; value: string }[] = [];
  FILTER_FIELDS.forEach(({ label, field }) => {
    if (filters[field]) chips.push({ label, field, value: filters[field] });
  });
  (["q1","q2","q3"] as (keyof DashFilters)[]).forEach(k => {
    if (filters[k]) chips.push({ label: k.toUpperCase(), field: k, value: filters[k] });
  });
  if (datePreset !== "all") {
    const dl = DATE_PRESETS.find(d => d.key === datePreset)?.label ?? datePreset;
    chips.push({ label: "Date", field: "__date__", value: datePreset === "custom" ? `${dateFrom} → ${dateTo}` : dl });
  }

  return (
    <div style={card}>
      {/* Date tabs */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"14px 20px 12px", borderBottom:"1px solid rgba(11,25,41,0.06)", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {DATE_PRESETS.map(({ key, label }) => {
            const disabled = key === "campaign" && !campaignHasDates;
            const active = datePreset === key;
            return (
              <button key={key} onClick={() => !disabled && setDatePreset(key)} disabled={disabled}
                style={{ fontSize:11, fontWeight:active?700:500, padding:"5px 12px", borderRadius:20, border:"none",
                  cursor:disabled?"not-allowed":"pointer",
                  background: active ? "#D7B87A" : "rgba(11,25,41,0.05)",
                  color: active ? "#0B1929" : disabled ? "rgba(11,25,41,0.2)" : "#5F6670",
                  transition:"all 0.12s" }}>
                {label}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize:11, color:"#5F6670" }}>
          <strong style={{ color:"#0B1929" }}>{filteredCount.toLocaleString()}</strong>
          {filteredCount !== totalCount && ` of ${totalCount.toLocaleString()}`} responses
        </span>
      </div>

      {/* Custom dates */}
      {datePreset === "custom" && (
        <div style={{ display:"flex", gap:12, padding:"12px 20px", borderBottom:"1px solid rgba(11,25,41,0.06)" }}>
          {[["From", dateFrom, setDateFrom], ["To", dateTo, setDateTo]].map(([lbl, val, setter]) => (
            <div key={lbl as string} style={{ display:"flex", alignItems:"center", gap:8 }}>
              <label style={{ fontSize:11, color:"#5F6670" }}>{lbl as string}</label>
              <input type="date" value={val as string} onChange={e => (setter as (v:string)=>void)(e.target.value)} style={inputSt} />
            </div>
          ))}
        </div>
      )}

      {/* Dropdowns */}
      <div style={{ padding:"14px 20px", display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
        {FILTER_FIELDS.map(({ label, field }) => (
          <div key={field}>
            <label style={{ display:"block", fontSize:9, color:"#D7B87A", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>
              {label}
            </label>
            <select value={filters[field]} onChange={e => setFilter(field, e.target.value)} style={inputSt}>
              <option value="">All</option>
              {uniqueVals(allResponses, field as keyof SurveyResponse).map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Active chips */}
      {chips.length > 0 && (
        <div style={{ padding:"10px 20px 14px", borderTop:"1px solid rgba(11,25,41,0.05)",
          display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
          {chips.map(({ label, field, value }) => (
            <span key={`${field}-${value}`} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11,
              background:"rgba(215,184,122,0.12)", border:"1px solid rgba(215,184,122,0.3)",
              color:"#0B1929", padding:"3px 10px", borderRadius:20 }}>
              <span style={{ color:"#D7B87A", fontWeight:600 }}>{label}:</span> {value}
              <button onClick={() => {
                if (field === "__date__") { setDatePreset("all"); setDateFrom(""); setDateTo(""); }
                else setFilter(field, "");
              }} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(11,25,41,0.4)", fontSize:14, lineHeight:1, padding:0 }}>
                ×
              </button>
            </span>
          ))}
          <button onClick={() => { clearFilters(); setDatePreset("all"); setDateFrom(""); setDateTo(""); }}
            style={{ fontSize:11, color:"#5F6670", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
