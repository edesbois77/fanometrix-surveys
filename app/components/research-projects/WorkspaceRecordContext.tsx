"use client";

// A tiny context that lets a record opened *inside* a Research Project
// (a survey, conversation search or document) tell the project page header what
// its name is, so the breadcrumb can read
//   Research Projects › Overview › Research › Survey Research › Carlsberg Survey
// without the header needing to know how to fetch that record.
//
// The mounted record body calls setRecordLabel(name) on load (and clears it on
// unmount); ProjectPageHeader reads recordLabel for the final crumb. Provided
// once by the (workspace) layout. Outside a project (the standalone modules),
// there is no provider — the default no-op setter makes the same body safe to
// mount there too, so the editor stays a single component in both contexts.
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type WorkspaceRecordCtx = {
  recordLabel: string | null;
  setRecordLabel: (label: string | null) => void;
};

const Ctx = createContext<WorkspaceRecordCtx>({
  recordLabel: null,
  setRecordLabel: () => {},
});

export function WorkspaceRecordProvider({ children }: { children: ReactNode }) {
  const [recordLabel, setState] = useState<string | null>(null);
  // Stable identity so a consuming body can safely use it as an effect dep.
  const setRecordLabel = useCallback((label: string | null) => setState(label), []);
  return <Ctx.Provider value={{ recordLabel, setRecordLabel }}>{children}</Ctx.Provider>;
}

export function useWorkspaceRecord() {
  return useContext(Ctx);
}
