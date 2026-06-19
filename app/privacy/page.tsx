import Link from "next/link";

export const metadata = { title: "Privacy Policy – Fanometrix" };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-[#D7B87A] text-sm hover:underline">← Back to survey</Link>

        <h1 className="text-3xl font-bold text-gray-900 mt-6 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-8">Fanometrix · Last updated June 2026</p>

        <div className="space-y-8 text-gray-700 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">What is Fanometrix?</h2>
            <p>Fanometrix is a fan sentiment survey platform that collects anonymous feedback on behalf of sports clubs, competition rights holders, and their media partners. Surveys are delivered as short embedded units within digital media placements.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">What data we collect</h2>
            <p className="mb-3">We collect only the minimum data necessary to produce meaningful fan insight:</p>
            <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Field</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  ["Survey responses (Q1–Q3)", "Your answers to the radio-button questions"],
                  ["Campaign ID", "Identifies which brand or campaign the survey belongs to"],
                  ["Publisher", "The media partner where the survey was displayed"],
                  ["Placement", "The position on the page (e.g. homepage MPU)"],
                  ["Club / Competition", "The football club or competition the survey relates to"],
                  ["Country", "Your country, supplied by the ad server — country level only"],
                  ["Fan segment", "A category label set by the publisher, not entered by you"],
                  ["Device type", "Mobile, tablet, or desktop — derived from your browser"],
                  ["Browser", "Chrome, Safari, Firefox, Edge, or Other"],
                  ["Response time", "How many seconds the survey took to complete"],
                  ["Timestamp", "Date and approximate time of submission"],
                ].map(([field, desc]) => (
                  <tr key={field}>
                    <td className="px-3 py-2 font-medium text-gray-800 align-top">{field}</td>
                    <td className="px-3 py-2 text-gray-600">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">What we do NOT collect</h2>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>Names, email addresses, phone numbers, or any contact information</li>
              <li>User IDs, login credentials, or account data</li>
              <li>Exact location data — only country level</li>
              <li>IP addresses — not stored</li>
              <li>Cookies or persistent identifiers</li>
              <li>Free-text personal information</li>
              <li>Any data from children under 16</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Why we collect it</h2>
            <p>Survey responses are collected to produce aggregated fan insight reports for sports rights holders and their commercial partners. No individual is profiled, targeted, or identified from the data we collect.</p>
            <p className="mt-2">The data is anonymous — the combination of fields we collect cannot realistically be used to identify a specific person. As such, it falls outside the personal data processing requirements of UK GDPR.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Data storage and retention</h2>
            <p>Data is stored securely in a Supabase (Postgres) database hosted in the EU West (London) region. Data is retained for a maximum of 24 months from the date of collection, after which it is deleted.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Your rights</h2>
            <p>Because we do not collect any information that can identify you, we are unable to locate, modify, or delete a specific individual's response. If you have a concern about data collected via a specific survey placement, please contact the publisher who displayed it.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Contact</h2>
            <p>For questions about this policy, contact: <a href="mailto:privacy@fanometrix.com" className="text-[#D7B87A] hover:underline">privacy@fanometrix.com</a></p>
          </section>

        </div>

        <p className="text-xs text-gray-400 mt-10 pt-6 border-t border-gray-200">
          Fanometrix · Fan Insight Platform · <Link href="/" className="hover:underline">fanometrix-surveys.vercel.app</Link>
        </p>
      </div>
    </main>
  );
}
