"use client";

// ── Survey Studio — Report view ──────────────────────────────────────────────
// Renders a generated Study report through the Survey Studio editorial renderer — a client
// deliverable, distinct from Analysis / Findings / Results. Owner-scoped (the API enforces
// canCurateStudies). Print → PDF via the browser (the renderer owns A4 print layout).

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { StudioReportDocument } from "@/app/components/studio/report/StudioReportDocument";
import type { StudyReportDocument } from "@/lib/studio/report/report-document";

type ReportData = { report: { id: string; title: string; status: string; config: StudyReportDocument }; stale: boolean };

export default function StudyReportPage({ params }: { params: Promise<{ studyId: string; reportId: string }> }) {
  const { studyId, reportId } = use(params);
  const [data, setData] = useState<ReportData | "loading" | "error">("loading");

  useEffect(() => {
    fetch(`/api/studio/studies/${studyId}/reports/${reportId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: ReportData) => setData(j))
      .catch(() => setData("error"));
  }, [studyId, reportId]);

  if (data === "loading") return <div style={{ padding: 48, fontFamily: "system-ui", color: "#565E6B" }}>Loading report…</div>;
  if (data === "error") return <div style={{ padding: 48, fontFamily: "system-ui", color: "#565E6B" }}>This report is unavailable.</div>;

  return (
    <div>
      <div data-no-print="true" style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 20px", borderBottom: "1px solid #E3E6EA", fontFamily: "system-ui", fontSize: 13, background: "#fff" }}>
        <Link href={`/survey-studio/manage/studies/${studyId}`} style={{ color: "#565E6B", textDecoration: "none" }}>← Back to study</Link>
        <span style={{ color: "#858D99" }}>Draft report</span>
        <button type="button" onClick={() => window.print()} style={{ marginLeft: "auto", border: "1px solid #D7B87A", background: "transparent", color: "#8A6D2F", borderRadius: 6, padding: "4px 12px", fontSize: 12.5, cursor: "pointer" }}>Print / PDF</button>
        {data.stale && <span style={{ color: "#B4694C" }}>The study has changed since this report was generated — regenerate to refresh.</span>}
      </div>
      <StudioReportDocument doc={data.report.config} />
    </div>
  );
}
