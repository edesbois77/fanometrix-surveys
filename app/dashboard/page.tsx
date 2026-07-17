"use client";

// The global Survey Dashboard — the platform-wide (or ?research_project_id= /
// ?survey_id=-scoped) dashboard. The entire body now lives in SurveyDashboardBody
// so the same implementation also mounts, project-scoped, inside the Research
// Project workspace. This page keeps the global chrome: AdminShell, the content
// column and the footer.
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { SurveyDashboardBody } from "./SurveyDashboardBody";

export default function DashboardPage() {
  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <SurveyDashboardBody />
        <footer className="mt-12 pt-6 border-t border-gray-200 flex items-center gap-4 text-xs text-gray-400">
          <span>Fanometrix</span>
          <Link href="/privacy" className="hover:text-[#D7B87A] transition-colors">ⓘ Privacy Policy</Link>
          <Link href="/publisher-guide" className="hover:text-[#D7B87A] transition-colors">☰ Publisher Guide</Link>
        </footer>
      </div>
    </AdminShell>
  );
}
