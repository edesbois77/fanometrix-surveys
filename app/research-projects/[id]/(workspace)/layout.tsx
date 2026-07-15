"use client";

// The Research Project shell — the persistent project-level layout for the
// real, operational workspace. It owns the chrome once so the page (and, in
// later steps, the sibling area routes) don't each re-declare it: the global
// AdminShell, the ProjectProvider data layer, and the project header + area
// navigation (ProjectShell). Everything below renders inside AdminShell's
// <main>, so the project header/nav sit within the content column, visually
// distinct from — and below — the global left navigation.
//
// Scoped via the (workspace) route group so it wraps ONLY the workspace page,
// not the report routes at /research-projects/[id]/reports/* (which keep
// rendering their own AdminShell for now and are re-parented under the shell
// in a later step). Product Walkthrough is a separate route tree and never
// reaches this layout.
import { useParams } from "next/navigation";
import { AdminShell } from "@/app/components/AdminShell";
import { ProjectProvider } from "@/app/components/research-projects/ProjectProvider";
import { ProjectShell } from "@/app/components/research-projects/ProjectShell";

export default function ResearchProjectShellLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const id = params.id as string;
  return (
    <AdminShell>
      <ProjectProvider projectId={id}>
        <ProjectShell />
        {children}
      </ProjectProvider>
    </AdminShell>
  );
}
