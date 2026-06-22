import { AdminShell } from "@/app/components/AdminShell";

const METRICS = [
  { label: "Active Searches",    value: "—", sub: "listening now"           },
  { label: "Mentions This Week", value: "—", sub: "across all searches"     },
  { label: "Avg Sentiment",      value: "—", sub: "positive / neutral / neg" },
  { label: "Top Platform",       value: "—", sub: "by mention volume"        },
];

export default function SLDashboardPage() {
  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Social Listening</h1>
          <p className="text-sm text-gray-400 mt-0.5">Dashboard</p>
        </div>

        {/* Coming soon banner */}
        <div className="bg-[#0B1929] rounded-2xl p-8 mb-6 text-center">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase mb-3" style={{ color: "#D7B87A" }}>
            Coming in V2
          </p>
          <h2 className="text-2xl font-bold text-white mb-3">Social Listening Dashboard</h2>
          <p className="text-sm text-white/60 max-w-lg mx-auto leading-relaxed">
            Real-time overview of fan conversations across public platforms. Track sentiment trends,
            emerging topics and volume — alongside your survey data.
          </p>
        </div>

        {/* Placeholder metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {METRICS.map(m => (
            <div key={m.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <p className="text-2xl font-bold text-gray-300">{m.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{m.label}</p>
              <p className="text-[10px] text-gray-300 mt-3">{m.sub}</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm text-center">
          <p className="text-sm text-gray-500 leading-relaxed max-w-md mx-auto">
            Create a <strong>Search</strong> to start collecting mentions,
            then return here to see sentiment trends, top topics and volume over time.
          </p>
          <a href="/social-listening/searches"
            className="inline-block mt-4 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            style={{ background: "#D7B87A", color: "#0B1929" }}>
            Create your first search →
          </a>
        </div>
      </div>
    </AdminShell>
  );
}
