"use client";

import type { SurveyResponse } from "@/lib/types";

function avg(nums: (number | null)[]): number {
  const v = nums.filter((n): n is number => n !== null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
}

export function KpiCards({ responses }: { responses: SurveyResponse[] }) {
  const total      = responses.length;
  const complete   = responses.filter(r => r.q1 && r.q2 && r.q3).length;
  const completion = total > 0 ? Math.round((complete / total) * 100) : 0;
  const avgTime    = avg(responses.map(r => r.response_duration_seconds));
  const countries  = new Set(responses.map(r => r.country).filter(Boolean)).size;
  const publishers = new Set(responses.map(r => r.publisher).filter(Boolean)).size;
  const campaigns  = new Set(responses.map(r => r.campaign_id).filter(Boolean)).size;

  const cards = [
    { label: "Total Responses",   value: total.toLocaleString(),             sub: "all time"           },
    { label: "Completion Rate",   value: `${completion}%`,                   sub: "all 3 questions"    },
    { label: "Avg Response Time", value: avgTime > 0 ? `${avgTime}s` : "—", sub: "seconds per survey" },
    { label: "Countries",         value: countries || "—",                    sub: "represented"        },
    { label: "Publishers",        value: publishers || "—",                   sub: "media partners"     },
    { label: "Campaigns",         value: campaigns  || "—",                   sub: "active"             },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
      {cards.map(({ label, value, sub }) => (
        <div key={label} style={{
          background: "#FFFFFF",
          border: "1px solid rgba(11,25,41,0.08)",
          borderRadius: 16,
          padding: "20px 18px",
          boxShadow: "0 4px 20px rgba(11,25,41,0.06)",
        }}>
          <p style={{
            color: "#D7B87A",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}>{label}</p>
          <p style={{
            color: "#0B1929",
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1,
            marginBottom: 5,
          }}>{value}</p>
          <p style={{ color: "#5F6670", fontSize: 11 }}>{sub}</p>
        </div>
      ))}
    </div>
  );
}
