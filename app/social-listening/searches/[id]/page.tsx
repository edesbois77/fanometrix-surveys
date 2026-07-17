"use client";

// Standalone Conversation Search detail — the global management view's editor.
// Thin shell: AdminShell chrome + the shared SearchDetailBody (the exact same
// component the in-project route mounts). The only thing this route adds is
// reading ?returnTo= so a search opened via a legacy project deep-link can send
// the user back to that project; everything else lives in the shared body.
import { use, Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AdminShell } from "@/app/components/AdminShell";
import { SearchDetailBody } from "./SearchDetailBody";

// Isolated so only this leaf needs the useSearchParams() Suspense boundary.
function ReturnToReader({ onReturnTo }: { onReturnTo: (projectId: string | null) => void }) {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  useEffect(() => { onReturnTo(returnTo); }, [returnTo, onReturnTo]);
  return null;
}

export default function SearchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [returnTo, setReturnTo] = useState<string | null>(null);

  const backHref = returnTo ? `/research-projects/${returnTo}?returned=1` : "/social-listening/searches";
  const backLabel = returnTo ? "← Back to Research Project" : "← Searches";

  return (
    <AdminShell>
      <Suspense fallback={null}>
        <ReturnToReader onReturnTo={setReturnTo} />
      </Suspense>
      <SearchDetailBody id={id} backHref={backHref} backLabel={backLabel} />
    </AdminShell>
  );
}
