"use client";

// Product Walkthrough's detail page — the exact same WorkspaceBody the
// real Research Project Workspace renders, with Present Mode turned on
// (presentModeEnabled: true). This is Phase A of the Product Walkthrough
// restructure: purely the architectural split + rename, so a walkthrough
// still opens as a fully-built project the same way today's Showroom
// demos do. Phase B/C add the empty-start creation flow and the guided
// live-build steps on top of this same page.
import { useParams } from "next/navigation";
import { WorkspaceBody } from "@/app/components/research-projects/WorkspaceBody";

export default function ProductWalkthroughDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <WorkspaceBody projectId={id} presentModeEnabled />;
}
