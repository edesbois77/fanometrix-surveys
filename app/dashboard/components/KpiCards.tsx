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
    { label: "Total Responses",      value: total.toLocaleString(),              sub: "all time"              },
    { label: "Completion Rate",      value: `${completion}%`,                    sub: "all 3 questions"       },
    { label: "Avg Response Time",    value: avgTime > 0 ? `${avgTime}s` : "—",  sub: "seconds per survey"    },
    { label: "Countries",            value: countries || "—",                     sub: "represented"           },
    { label: "Publishers",           value: publishers || "—",                    sub: "media partners"        },
    { label: "Campaigns",            value: campaigns  || "—",                    sub: "active"                },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
      {cards.map(({ label, value, sub }) => (
        <div key={label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-indigo-700 mt-1">{value}</p>
          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
        </div>
      ))}
    </div>
  );
}
