import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Nav */}
      <header className="px-8 py-5 flex items-center justify-between border-b border-gray-100">
        <span className="text-lg font-bold tracking-tight" style={{ color: "#0B1929" }}>
          Fanometrix
        </span>
        <Link
          href="/login"
          className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          style={{ background: "#0B1929", color: "#D7B87A" }}
        >
          Enter Platform
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center py-24">
        <div className="max-w-3xl mx-auto">

          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase px-4 py-1.5 rounded-full mb-10"
            style={{ background: "#FBF5E6", color: "#D7B87A", border: "1px solid #E8D5A3" }}
          >
            Fan Insight Platform
          </div>

          {/* Headline */}
          <h1
            className="text-5xl sm:text-6xl font-bold leading-tight mb-6"
            style={{ color: "#0B1929", letterSpacing: "-0.02em" }}
          >
            Football fan intelligence.
          </h1>

          {/* Subheadline */}
          <p
            className="text-xl sm:text-2xl font-medium mb-6"
            style={{ color: "#4A6080" }}
          >
            Understand audiences. Measure impact. Discover opportunities.
          </p>

          {/* Body */}
          <p className="text-base text-gray-500 max-w-xl mx-auto mb-12 leading-relaxed">
            Fanometrix combines anonymous fan surveys, campaign analytics and first-party publisher
            context to help brands, rights holders and media partners better understand football
            supporters.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="px-8 py-3.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: "#0B1929", color: "#D7B87A" }}
            >
              Enter Platform
            </Link>
            <Link
              href="/login"
              className="px-8 py-3.5 rounded-xl text-sm font-semibold border transition-colors"
              style={{ borderColor: "#D7B87A", color: "#0B1929" }}
            >
              Request Access
            </Link>
          </div>
        </div>
      </main>

      {/* Stats strip */}
      <section className="border-t border-gray-100 py-12 px-8">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center">
          {[
            { value: "First-party", label: "Fan data, privacy safe" },
            { value: "Real-time", label: "Campaign analytics" },
            { value: "Multi-publisher", label: "Audience context" },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-2xl font-bold mb-1" style={{ color: "#0B1929" }}>{value}</p>
              <p className="text-sm text-gray-400">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer
        className="px-8 py-6 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400"
      >
        <span>© {new Date().getFullYear()} Fanometrix</span>
        <nav className="flex gap-6">
          <Link href="/privacy" className="hover:text-gray-600 transition-colors">Privacy Policy</Link>
          <Link href="/publisher-hub" className="hover:text-gray-600 transition-colors">Publisher Hub</Link>
        </nav>
      </footer>
    </div>
  );
}
