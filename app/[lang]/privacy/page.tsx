import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

// ─── Locale imports ───────────────────────────────────────────────────────────
import en from "@/locales/privacy/en.json";
import de from "@/locales/privacy/de.json";
import fr from "@/locales/privacy/fr.json";
import es from "@/locales/privacy/es.json";
import it from "@/locales/privacy/it.json";
import pt from "@/locales/privacy/pt.json";
import sv from "@/locales/privacy/sv.json";
import zh from "@/locales/privacy/zh.json";
import hi from "@/locales/privacy/hi.json";

const LOCALES = { en, de, fr, es, it, pt, sv, zh, hi } as const;
type Lang = keyof typeof LOCALES;

// Language switcher pills shown at the top of every page
const LANG_LINKS: { lang: Lang; label: string }[] = [
  { lang: "en", label: "EN" },
  { lang: "de", label: "DE" },
  { lang: "fr", label: "FR" },
  { lang: "es", label: "ES" },
  { lang: "it", label: "IT" },
  { lang: "pt", label: "PT" },
  { lang: "sv", label: "SV" },
  { lang: "zh", label: "中文" },
  { lang: "hi", label: "हि" },
];

export function generateStaticParams() {
  return Object.keys(LOCALES).map(lang => ({ lang }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ lang: string }> }
): Promise<Metadata> {
  const { lang } = await params;
  const content = LOCALES[lang as Lang] ?? LOCALES.en;
  return { title: `${content.title} — Fanometrix` };
}

export default async function PrivacyPage(
  { params }: { params: Promise<{ lang: string }> }
) {
  const { lang } = await params;

  if (!(lang in LOCALES)) notFound();

  const c = LOCALES[lang as Lang] ?? LOCALES.en;

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-2xl mx-auto">

        {/* Language switcher */}
        <div className="flex flex-wrap gap-1.5 mb-8">
          {LANG_LINKS.map(l => (
            <Link
              key={l.lang}
              href={`/${l.lang}/privacy`}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                l.lang === lang
                  ? "bg-[#0B1929] text-[#D7B87A]"
                  : "bg-white border border-gray-200 text-gray-500 hover:border-[#D7B87A] hover:text-[#0B1929]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Header */}
        <h1 className="text-3xl font-bold text-gray-900 mb-1">{c.title}</h1>
        <p className="text-base text-gray-500 mb-1">{c.subtitle}</p>
        <p className="text-sm text-gray-400 mb-8">{c.updated}</p>

        {/* Sections */}
        <div className="space-y-8 text-gray-700 text-sm leading-relaxed">
          {c.sections.map((section, i) => (
            <section key={i}>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{section.heading}</h2>

              {/* Body paragraphs */}
              {section.body?.map((p, j) => (
                <p key={j} className={j < section.body.length - 1 ? "mb-2" : ""}>{p}</p>
              ))}

              {/* Data table */}
              {"table" in section && Array.isArray(section.table) && (
                <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden mt-3">
                  <tbody className="divide-y divide-gray-100">
                    {(section.table as { f: string; d: string }[]).map(row => (
                      <tr key={row.f}>
                        <td className="px-3 py-2 font-medium text-gray-800 align-top w-2/5 bg-gray-50">{row.f}</td>
                        <td className="px-3 py-2 text-gray-600">{row.d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Bullet list */}
              {"list" in section && Array.isArray(section.list) && (
                <ul className="list-disc list-inside space-y-1 text-gray-600 mt-3">
                  {(section.list as string[]).map((item, k) => (
                    <li key={k}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* Contact */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{c.contactHeading}</h2>
            <p>
              {c.contactBody}{" "}
              <a href={`mailto:${c.contactEmail}`} className="text-[#D7B87A] hover:underline font-medium">
                {c.contactEmail}
              </a>
            </p>
          </section>

          {/* Discrepancy note */}
          <div className="border-l-4 border-[#D7B87A] bg-amber-50 px-4 py-3 rounded-r-lg">
            <p className="text-xs text-amber-900 leading-relaxed">{c.discrepancy}</p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-400 mt-10 pt-6 border-t border-gray-200">
          Fanometrix · Fan Insight Platform ·{" "}
          <Link href="/" className="hover:underline">fanometrix-surveys.vercel.app</Link>
        </p>
      </div>
    </main>
  );
}
