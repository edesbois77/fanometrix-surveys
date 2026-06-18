"use client";

import type { SurveyResponse } from "@/lib/types";

function avg(nums: (number | null)[]): number {
  const valid = nums.filter((n): n is number => n !== null);
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
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
    { label: "Total Responses",   value: total.toLocaleString(),              sub: "all time"           },
    { label: "Completion Rate",   value: `${completion}%`,                    sub: "all 3 questions"    },
    { label: "Avg Response Time", value: avgTime > 0 ? `${avgTime}s` : "—",  sub: "seconds per survey" },
    { label: "Countries",         value: countries || "—",                     sub: "represented"        },
    { label: "Publishers",        value: publishers || "—",                    sub: "media partners"     },
    { label: "Campaigns",         value: campaigns  || "—",                    sub: "active"             },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 16 }}>
      {cards.map(({ label, value, sub }) => (
        <div key={label} style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(215,184,122,0.15)",
          borderRadius: 16,
          padding: "18px 16px",
          backdropFilter: "blur(8px)",
        }}>
          <p style={{
            color: "rgba(215,184,122,0.6)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}>{label}</p>
          <p style={{
            color: "#FFFFFF",
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1,
            marginBottom: 4,
          }}>{value}</p>
          <p style={{ color: "rgba(224,225,221,0.4)", fontSize: 10 }}>{sub}</p>
        </div>
      ))}
    </div>
  );
}
