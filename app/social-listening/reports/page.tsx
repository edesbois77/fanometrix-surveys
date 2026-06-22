import { AdminShell } from "@/app/components/AdminShell";

const REPORT_TYPES = [
  { title: "Sentiment Trend",      desc: "Positive / neutral / negative split over time.",        icon: "↗" },
  { title: "Emerging Themes",      desc: "AI-identified topics gaining traction this week.",      icon: "◈" },
  { title: "Market Comparison",    desc: "Side-by-side sentiment across markets and countries.", icon: "⬡" },
  { title: "Survey + Social",      desc: "Combine listening findings with survey results.",       icon: "◫" },
];

export default function SLReportsPage() {
  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-400 mt-0.5">Summaries, trends and insights</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {REPORT_TYPES.map(r => (
            <div key={r.title}
              className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm opacity-60">
              <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center text-lg mb-3">
                {r.icon}
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">{r.title}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">{r.desc}</p>
              <p className="text-xs font-medium mt-3" style={{ color: "#D7B87A" }}>Available in V2</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-6 text-center shadow-sm">
          <p className="text-sm text-gray-400 leading-relaxed max-w-md mx-auto">
            Reports will be available once mentions have been collected.
            Findings can be combined with survey results for a unified view of fan sentiment.
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
