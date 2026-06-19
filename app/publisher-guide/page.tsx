import Link from "next/link";

export const metadata = { title: "Publisher Integration Guide – Fanometrix" };

const CODE = `<!-- Fanometrix MPU (300x250) — Google Ad Manager -->
<iframe
  src="https://fanometrix-surveys.vercel.app/embed
    ?campaign=YOUR_CAMPAIGN_ID
    &publisher=YOUR_PUBLISHER_NAME
    &placement=YOUR_PLACEMENT_NAME
    &country=%%COUNTRY%%
    &segment=YOUR_SEGMENT"
  width="300" height="250" frameborder="0"
  scrolling="no"
  style="border:0;overflow:hidden;display:block;"
  title="Fanometrix Fan Survey"
></iframe>`;

const MACROS: [string, string, string][] = [
  ["Google Ad Manager", "country", "%%COUNTRY%%"],
  ["Xandr (AppNexus)", "country", "${GEO_COUNTRY}"],
  ["Freewheel",        "country", "[country]"],
  ["The Trade Desk",  "country", "##COUNTRY##"],
  ["DV360",           "country", "%%COUNTRY%%"],
];

export default function PublisherGuidePage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/dashboard" className="text-indigo-500 text-sm hover:underline">← Dashboard</Link>

        <h1 className="text-3xl font-bold text-gray-900 mt-6 mb-2">Publisher Integration Guide</h1>
        <p className="text-sm text-gray-400 mb-8">Fanometrix · Version 1.0 · June 2026</p>

        <div className="space-y-8 text-gray-700 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Overview</h2>
            <p>Fanometrix delivers fan sentiment surveys as standard 300×250 MPU creatives. They are trafficked as third-party iframe or script-tag HTML creatives within your ad server.</p>
            <p className="mt-2">Surveys are typically 3 questions with radio-button answers and take under 60 seconds to complete. Responses are stored anonymously — no personal data is collected.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Creative format</h2>
            <div className="grid grid-cols-3 gap-3">
              {[["Format", "MPU"],["Size","300 × 250 px"],["File type","iframe / HTML"],["Safe frame","Yes"],["3rd party served","Yes"],["GDPR consent required","No"]].map(([k,v])=>(
                <div key={k} className="bg-white border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-400">{k}</p>
                  <p className="font-semibold text-gray-800">{v}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Permitted URL parameters</h2>
            <p className="mb-3">These parameters are set by you in the creative tag and stored alongside each survey response:</p>
            <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Parameter</th>
                  <th className="text-left px-3 py-2 font-semibold">Required</th>
                  <th className="text-left px-3 py-2 font-semibold">Example</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  ["campaign","Yes","carlsberg_ucl_2026"],
                  ["publisher","Recommended","sky-sports"],
                  ["placement","Recommended","homepage-mpu"],
                  ["country","Recommended — use geo macro","%%COUNTRY%%"],
                  ["club","Optional","Arsenal"],
                  ["competition","Optional","Premier+League"],
                  ["segment","Optional","season-ticket-holder"],
                  ["survey","Optional — links to survey config","uuid"],
                ].map(([p,r,e])=>(
                  <tr key={p}>
                    <td className="px-3 py-2 font-mono text-indigo-700">{p}</td>
                    <td className="px-3 py-2">{r}</td>
                    <td className="px-3 py-2 text-gray-400 font-mono">{e}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">NOT permitted</h2>
            <p className="mb-2">The following must never be passed as URL parameters:</p>
            <ul className="list-disc list-inside space-y-1 text-red-600">
              <li>Names, email addresses, phone numbers</li>
              <li>User IDs, login tokens, or authenticated identifiers</li>
              <li>Hashed or encrypted personal identifiers</li>
              <li>Free-text personal information of any kind</li>
              <li>Precise location data (lat/lon, postcode)</li>
            </ul>
            <p className="mt-2 text-gray-500">Passing prohibited data is a breach of the integration agreement and may result in removal of access.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Country geo macro</h2>
            <p className="mb-3">Your ad server automatically knows the user's country via IP geolocation. Replace the country value with the correct macro:</p>
            <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Ad Server</th>
                  <th className="text-left px-3 py-2 font-semibold">Parameter</th>
                  <th className="text-left px-3 py-2 font-semibold">Macro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {MACROS.map(([server, param, macro]) => (
                  <tr key={server}>
                    <td className="px-3 py-2">{server}</td>
                    <td className="px-3 py-2 font-mono text-indigo-700">{param}</td>
                    <td className="px-3 py-2 font-mono text-gray-500">{macro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Example creative tag</h2>
            <pre className="bg-gray-900 text-green-400 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">{CODE}</pre>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Testing</h2>
            <p>Use the <Link href="/embed-generator" className="text-indigo-600 hover:underline">Embed Generator</Link> to create and preview your creative tag. For QA, hardcode <code className="bg-gray-100 px-1 rounded">country=GB</code> rather than using an unfired macro.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Privacy &amp; compliance</h2>
            <p>Fanometrix collects only anonymous, non-personal data. No consent mechanism is required from respondents. See the full <Link href="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</Link> for detail.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Contact</h2>
            <p>Integration support: <a href="mailto:publishers@fanometrix.com" className="text-indigo-600 hover:underline">publishers@fanometrix.com</a></p>
          </section>

        </div>

        <p className="text-xs text-gray-400 mt-10 pt-6 border-t border-gray-200">
          Fanometrix · Publisher Integration Guide v1.0
        </p>
      </div>
    </main>
  );
}
