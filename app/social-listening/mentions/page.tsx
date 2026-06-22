import { AdminShell } from "@/app/components/AdminShell";

const COLS = ["Platform", "Content", "Sentiment", "Topics", "Market", "Date"];

export default function SLMentionsPage() {
  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mentions</h1>
            <p className="text-sm text-gray-400 mt-0.5">Collected fan conversations</p>
          </div>
          <div className="flex gap-2">
            <button disabled
              className="text-sm border border-gray-200 text-gray-400 px-4 py-2 rounded-lg font-medium cursor-not-allowed">
              Import CSV
            </button>
            <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-medium self-center">Coming in V2</span>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {COLS.map(c => (
                  <th key={c} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={COLS.length} className="px-4 py-12 text-center text-gray-400 text-sm">
                  No mentions yet. Create a search to start collecting data.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-[#0B1929] rounded-xl p-5 text-center">
          <p className="text-xs text-white/50 mb-1">V2 will support</p>
          <p className="text-sm text-white/80 leading-relaxed">
            Manual CSV import · API integrations · AI sentiment classification · Topic tagging
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
