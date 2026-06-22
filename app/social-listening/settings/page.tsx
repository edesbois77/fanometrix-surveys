import { AdminShell } from "@/app/components/AdminShell";

const SETTING_GROUPS = [
  {
    heading: "Data Sources",
    items: ["Twitter/X API", "Reddit API", "Instagram Graph API", "News RSS feeds", "Manual CSV import"],
  },
  {
    heading: "Collection",
    items: ["Refresh interval (hours)", "Deduplication window", "Keyword match threshold"],
  },
  {
    heading: "Retention",
    items: ["Mention retention period (days)", "Archive policy", "GDPR auto-purge"],
  },
  {
    heading: "AI Classification",
    items: ["Sentiment model", "Topic taxonomy", "Relevance threshold", "Language detection"],
  },
];

export default function SLSettingsPage() {
  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-400 mt-0.5">Configure Social Listening behaviour</p>
        </div>

        <div className="space-y-4">
          {SETTING_GROUPS.map(g => (
            <div key={g.heading} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{g.heading}</p>
              </div>
              <div className="px-5 py-3 space-y-3 opacity-50">
                {g.items.map(item => (
                  <div key={item} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{item}</span>
                    <span className="text-xs text-gray-300 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">
                      V2
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-center text-gray-400 mt-6">
          Settings will be configurable once data sources are connected in V2.
        </p>
      </div>
    </AdminShell>
  );
}
