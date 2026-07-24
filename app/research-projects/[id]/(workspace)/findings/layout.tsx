"use client";

// The Findings SECTION shell — a multi-page area (Overview · Survey · Conversation
// · Research Library) that mirrors the Dashboard's sub-route hierarchy. This
// stage sits between Dashboard and Analysis: the analyst reviews and approves
// what each source found, and only approved findings feed the cross-source
// Analysis. This layout owns the section furniture (header + sub-navigation) once;
// each sub-page renders only its own body.
import { useParams } from "next/navigation";
import { PageContainer, WorkspaceHeader, SubNav, type SubNavItem } from "@/app/components/workspace-ui";

const ITEMS: SubNavItem[] = [
  { segment: "", label: "Overview" },
  { segment: "survey", label: "Survey Findings" },
  { segment: "conversation", label: "Conversation Findings" },
  { segment: "document", label: "Research Library Findings" },
];

export default function FindingsSectionLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const id = params.id as string;
  const base = `/research-projects/${id}/findings`;

  return (
    <PageContainer>
      <WorkspaceHeader
        title="Findings"
        description="What each evidence source found, for you to review and approve. Approve the findings that hold; set the rest aside with a reason. Only approved findings feed the cross-source Analysis."
      />
      <SubNav base={base} items={ITEMS} />
      {children}
    </PageContainer>
  );
}
