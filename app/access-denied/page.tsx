import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "#F7F8FA" }}
    >
      <div className="text-center max-w-sm">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6"
          style={{ background: "#FEF2F2" }}
        >
          ✕
        </div>
        <h1 className="text-xl font-bold mb-2" style={{ color: "#0B1929" }}>
          Access Denied
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Your account does not have permission to view this page. Contact your administrator if you believe this is a mistake.
        </p>
        <Link
          href="/home"
          className="inline-block text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          style={{ background: "#0B1929", color: "#D7B87A" }}
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
