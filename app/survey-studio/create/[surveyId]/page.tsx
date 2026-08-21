// Survey Studio → Create workspace for a specific Survey (Phase 0).
// A thin server component: it resolves the Survey ID from the path and the
// active stage from `?stage=` (both async in this Next.js), then hands off to
// the client CreateWorkspace. Keeping stage in the query (not a nested route)
// means the Survey ID always stays in the path and the five tabs need no extra
// route tree. Auth/org-scoping is enforced by /api/surveys/[id] the workspace
// reads — this page adds no second access model.
import { CreateWorkspace } from "@/app/components/studio/create/CreateWorkspace";
import { isStageKey, DEFAULT_STAGE } from "@/app/components/studio/create/create-stages";
import { campaignGroupsStudioEnabled } from "@/lib/campaign-groups/flag";

export default async function SurveyStudioCreateWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ surveyId: string }>;
  searchParams: Promise<{ stage?: string | string[] }>;
}) {
  const { surveyId } = await params;
  const sp = await searchParams;
  const raw = Array.isArray(sp.stage) ? sp.stage[0] : sp.stage;
  const stage = isStageKey(raw) ? raw : DEFAULT_STAGE;

  // Resolved on the SERVER and handed down as a plain boolean, mirroring
  // /survey-studio/manage. The flag carries no NEXT_PUBLIC_ prefix, so neither
  // its value nor its NAME reaches the client bundle — the browser is told only
  // the answer. Availability is never inferred from a 404: a request can fail
  // for reasons that have nothing to do with the rollout, and treating those as
  // "feature off" would let an unrelated outage silently hide the interface.
  return (
    <CreateWorkspace
      surveyId={surveyId}
      stage={stage}
      campaignGroupsEnabled={campaignGroupsStudioEnabled()}
    />
  );
}
