"use client";

// The real, operational Research Project Workspace — thin by design.
// Present Mode is never reachable here (presentModeEnabled: false, no
// matter what's in the URL) — that entire mechanism now lives in
// Product Walkthrough (app/product-walkthrough/[id]/page.tsx), which
// renders the exact same WorkspaceBody with it turned on. See
// app/components/research-projects/WorkspaceBody.tsx for everything the
// Workspace itself actually does.
import { useParams } from "next/navigation";
import { WorkspaceBody } from "@/app/components/research-projects/WorkspaceBody";

export default function ResearchProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <WorkspaceBody projectId={id} presentModeEnabled={false} />;
}
