import { AdminShell } from "@/app/components/AdminShell";
import { PLATFORMS } from "@/lib/social-taxonomy";

const RETENTION_OPTIONS = ["30 days", "60 days", "90 days", "180 days", "1 year", "Forever"];
const REFRESH_OPTIONS   = ["Manual only", "Daily", "Every 12 hours", "Every 6 hours"];

export default function SLSettingsPage() {
  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-400 mt-0.5">Configure Social Listening data sources and behaviour</p>
        </div>

        {/* Data Sources */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Sources</p>
          </div>
          <div className="divide-y divide-gray-50">
            {PLATFORMS.map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{p.label}</p>
                  {!p.defaultOn && <p className="text-xs text-gray-400">API integration coming in V2</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.defaultOn ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {p.defaultOn ? "CSV Import" : "Coming soon"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Collection */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Collection</p>
          </div>
          <div className="px-5 py-4 space-y-4 opacity-60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Default Refresh Interval</p>
                <p className="text-xs text-gray-400">How often automated searches will run</p>
              </div>
              <select disabled className="text-xs border border-gray-200 rounded-lg px-2 py-1.5">
                {REFRESH_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Deduplication</p>
                <p className="text-xs text-gray-400">Remove duplicate mentions on import</p>
              </div>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Enabled</span>
            </div>
          </div>
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-100">
            <p className="text-xs text-amber-600">Automated collection is disabled in V2 Phase 1. All data is imported manually via CSV.</p>
          </div>
        </div>

        {/* Retention */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Retention</p>
          </div>
          <div className="px-5 py-4 space-y-4 opacity-60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Mention Retention Period</p>
                <p className="text-xs text-gray-400">How long mentions are kept before auto-deletion</p>
              </div>
              <select disabled className="text-xs border border-gray-200 rounded-lg px-2 py-1.5">
                {RETENTION_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* AI Classification */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">AI Classification</p>
          </div>
          <div className="divide-y divide-gray-50">
            {[
              { label: "Sentiment Model",   value: process.env.NEXT_PUBLIC_APP_URL ? "GPT-4o-mini (OpenAI)" : "Rule-based fallback", active: true },
              { label: "Football Taxonomy", value: "19 topics, 20 subtopics",  active: true  },
              { label: "Language Detection",value: "Planned, V2 Phase 2",     active: false },
              { label: "Auto-reclassify",   value: "Planned, V2 Phase 2",     active: false },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between px-5 py-3">
                <p className="text-sm font-medium text-gray-800">{item.label}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-blue-50 border-t border-blue-100">
            <p className="text-xs text-blue-600">
              Add <code className="font-mono">OPENAI_API_KEY</code> to Vercel environment variables to enable GPT-4o-mini classification.
              Without it, rule-based classification is used as a fallback.
            </p>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
