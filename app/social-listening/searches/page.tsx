import { AdminShell } from "@/app/components/AdminShell";

const FIELDS = [
  { label: "Search Name",  hint: "e.g. Carlsberg — Fan Sentiment" },
  { label: "Keywords",     hint: "Comma-separated, e.g. Carlsberg, Carlsberg beer, #Carlsberg" },
  { label: "Markets",      hint: "ISO country codes, e.g. GB, DE, SE" },
  { label: "Platforms",    hint: "Twitter/X, Reddit, Instagram, News…" },
];

export default function SLSearchesPage() {
  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Searches</h1>
          <p className="text-sm text-gray-400 mt-0.5">Define what to listen for</p>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-lg">
            A Search defines the keywords, markets and platforms Fanometrix monitors.
            Mentions are collected and classified against each search.
          </p>
        </div>

        {/* Placeholder form preview */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-5">
          <div className="flex items-center justify-between mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New Search</p>
            <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-medium">Coming in V2</span>
          </div>
          <div className="space-y-4 opacity-50 pointer-events-none">
            {FIELDS.map(f => (
              <div key={f.label}>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">{f.label}</label>
                <input disabled
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-400 bg-gray-50"
                  placeholder={f.hint}
                />
              </div>
            ))}
            <button disabled
              className="w-full py-3 rounded-xl text-sm font-semibold"
              style={{ background: "#0B1929", color: "#D7B87A", opacity: 0.4 }}>
              Save Search
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-6 text-center shadow-sm">
          <p className="text-sm text-gray-400">No searches yet. Search creation will be available in V2.</p>
        </div>
      </div>
    </AdminShell>
  );
}
