"use client";

// Dashboard › Conversation Intelligence shell — a two-view area:
//   • Overview — the KPIs, charts and evidence summary (monitoring at a glance)
//   • Evidence — the collected conversations themselves, to review before Analysis
// These are the two halves of monitoring a conversation source: the shape of the
// data, and the data itself. A secondary sub-nav switches between them; the
// Dashboard section header + area nav come from the parent dashboard layout.
// Surveys and Documents are expected to evolve the same Overview / Evidence pair.
import { useParams } from "next/navigation";
import { SubNav, type SubNavItem } from "@/app/components/workspace-ui";

const ITEMS: SubNavItem[] = [
  { segment: "", label: "Overview" },
  { segment: "evidence", label: "Evidence" },
];

export default function ConversationDashboardLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const id = params.id as string;
  const base = `/research-projects/${id}/dashboard/conversation`;

  return (
    <div className="space-y-4">
      <SubNav base={base} items={ITEMS} ariaLabel="Conversation Intelligence" />
      {children}
    </div>
  );
}
