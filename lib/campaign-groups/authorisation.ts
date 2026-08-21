// ── Who may operate campaign groups ──────────────────────────────────────────
//
// Campaign groups are a campaign OPERATION tool, not a reporting surface. The
// platform already states who may operate campaigns: middleware.ts gates
// `/campaigns`, `/campaign-groups`, `/api/campaign-groups` and `/api/surveys`
// behind ADMIN_AND_PUBLISHER_PREFIXES — admin and publisher only, with
// brand/agency working through Insights/Dashboard instead.
//
// The Studio group routes live under `/api/studio/...`, which that prefix list
// does not cover, so they must state the SAME policy themselves. Without this,
// an agency-role user in the owning organisation was refused every legacy
// campaign surface yet could still enumerate groupable campaigns and publish
// configuration revisions directly against the Studio API.
//
// Organisation scope is enforced separately and independently, per route, from
// the session's Active Organisation (never from the request body). Both gates
// apply: the right role AND the right organisation.
import type { UserRole } from "@/lib/auth";

export const OPERATE_CAMPAIGNS: UserRole[] = ["admin", "publisher"];
