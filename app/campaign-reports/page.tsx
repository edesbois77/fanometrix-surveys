import { AdminShell } from "@/app/components/AdminShell";

export default function CampaignReportsPage() {
  return (
    <AdminShell>
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Campaign Reports</h1>
        <p className="text-sm text-gray-400 mb-10">Detailed results for your fan survey campaigns.</p>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-4xl mb-4">↗</div>
          <p className="text-base font-semibold text-gray-700 mb-1">Coming soon</p>
          <p className="text-sm text-gray-400">Campaign reports will be available here shortly.</p>
        </div>
      </div>
    </AdminShell>
  );
}
