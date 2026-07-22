// Commissioning → Overview handoff (Slice 3). The invisible transition depends on
// the Overview rendering the AGREED understanding instantly — with no fetch-delay
// flash — so the conversation appears to simply grow into the workspace rather than
// reload into a new page.
//
// When the engagement is agreed and the Research Project is created, the created
// project is stashed here (a plain in-memory module singleton, which survives the
// client-side navigation because the JS runtime is not reloaded). The Overview's
// ProjectProvider seeds itself from this on first render, shows the understanding
// immediately, then hydrates the full project in the background and clears the
// stash. Read is non-destructive so React's dev double-mount is safe.
import type { ResearchProject } from "@/app/components/research-projects/ProjectProvider";

const store = new Map<string, ResearchProject>();

export function stashCommissioned(project: ResearchProject): void {
  store.set(project.id, project);
}

export function getCommissioned(id: string): ResearchProject | null {
  return store.get(id) ?? null;
}

export function clearCommissioned(id: string): void {
  store.delete(id);
}
