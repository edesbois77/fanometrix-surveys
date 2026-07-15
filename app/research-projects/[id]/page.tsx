"use client";

// The real, operational Research Project Workspace — thin by design. Product
// Walkthrough is now a fully separate experience with its own body (see
// app/product-walkthrough/[id]/page.tsx); this route renders only the real
// workspace, with no present-mode flag and no cross-route mode-redirect. See
// app/components/research-projects/WorkspaceBody.tsx for everything the
// Workspace itself actually does.
import { useParams } from "next/navigation";
import { WorkspaceBody } from "@/app/components/research-projects/WorkspaceBody";

export default function ResearchProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <WorkspaceBody projectId={id} />;
}
