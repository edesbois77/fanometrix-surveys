"use client";

// Product Walkthrough's detail page — the single-page, linear presentation
// experience. It now renders its own WalkthroughBody rather than sharing the
// real Research Project's WorkspaceBody (Step 1 of the Research Project Shell
// migration): the two are structurally independent, sharing only the data
// layer and section components. There is no cross-route mode-redirect — a
// Product Walkthrough opens here and stays here, and all of its report links
// remain inside the /product-walkthrough tree.
import { useParams } from "next/navigation";
import { WalkthroughBody } from "@/app/product-walkthrough/[id]/WalkthroughBody";

export default function ProductWalkthroughDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <WalkthroughBody projectId={id} />;
}
