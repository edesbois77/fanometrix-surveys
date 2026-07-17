"use client";

// The Dashboard SECTION shell — a multi-page area (Overview · Survey Intelligence
// · Conversation Intelligence · Document Intelligence) that mirrors the sub-route
// hierarchy Research and Execution use. This layout owns the section furniture
// once — the "Dashboard" page header, the sub-navigation, and the shared
// project-responses fetch — so each sub-page renders only its own body.
//
// Dashboard = monitoring: it presents the evidence collected from every source
// and how collection is performing. Interpretation happens in Analysis. The
// Overview is deliberately operational (health, collection, what needs
// attention); the detailed analytics live in the per-source sub-pages.
//
// The (workspace) layout above provides AdminShell, the ProjectProvider data
// layer and the project header + area navigation.
import { useParams } from "next/navigation";
import { PageContainer, WorkspaceHeader, SubNav, type SubNavItem } from "@/app/components/workspace-ui";

// One item per Dashboard sub-page. A future evidence source (Google Trends, CRM,
// media performance…) is added here as one more monitoring tab — no restructure.
const ITEMS: SubNavItem[] = [
  { segment: "", label: "Overview" },
  { segment: "survey", label: "Survey Intelligence" },
  { segment: "conversation", label: "Conversation Intelligence" },
  { segment: "document", label: "Document Intelligence" },
];

export default function DashboardSectionLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const id = params.id as string;
  const base = `/research-projects/${id}/dashboard`;

  return (
    <PageContainer>
      <WorkspaceHeader
        title="Dashboard"
        description="Monitor the evidence collected from every research source, and how collection is performing. Interpretation happens in Analysis."
      />
      <SubNav base={base} items={ITEMS} />
      {children}
    </PageContainer>
  );
}
