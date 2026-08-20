// Campaign preview grants — create / retrieve / revoke.
//
// Only an authenticated user authorised for the campaign may touch a grant.
// Authorisation reuses canAccess("campaign"), the same check the authenticated
// campaign routes apply, so this endpoint cannot become a second access model.
//
// The token is returned exactly ONCE, from POST. Only its hash is stored, so a
// later GET can describe a grant (expiry, usage, revocation) but can never
// reproduce a working link — regenerate instead.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { canAccess } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generatePreviewToken, hashPreviewToken, DEFAULT_GRANT_TTL_DAYS } from "@/lib/preview-grant";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } as const;

/** Resolve the campaign and confirm this session may administer its grants. */
async function authorise(req: NextRequest, id: string) {
  const session = await requireUser(req, ["admin", "publisher"]);
  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_id, survey_id, organisation_id:publisher_org_id, deleted_at")
    .eq("id", id)
    .maybeSingle();
  // Indistinguishable 404s: "no such campaign" and "not yours" look identical.
  if (!campaign || campaign.deleted_at) return { error: NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE }) };
  if (!(await canAccess(session, "campaign", campaign.id as string))) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE }) };
  }
  return { session, campaign };
}

/** Describe the current grant. Never returns a token. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let a; try { a = await authorise(req, id); } catch (err) { return err as Response; }
  if (a.error) return a.error;

  // Latest grant regardless of state, so the UI can tell "never created" from
  // "revoked" and from "expired" — three situations that need different words.
  const { data } = await supabaseAdmin
    .from("campaign_preview_grants")
    .select("id, expires_at, created_at, revoked_at, last_used_at, use_count")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false })
    .limit(1);

  const g = (data ?? [])[0];
  const status = !g ? "none"
    : g.revoked_at ? "revoked"
    : new Date(g.expires_at as string).getTime() <= Date.now() ? "expired"
    : "active";

  return NextResponse.json({
    status,
    grant: g ? {
      id: g.id, created_at: g.created_at, expires_at: g.expires_at,
      revoked_at: g.revoked_at, last_used_at: g.last_used_at, use_count: g.use_count,
    } : null,
    // The token is never retrievable. Regenerating is the only way to obtain one.
    token: null,
  }, { headers: NO_STORE });
}

/** Create or regenerate. Any previous active grant for this campaign is revoked,
 *  so a regenerated link immediately invalidates the one it replaces. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let a; try { a = await authorise(req, id); } catch (err) { return err as Response; }
  if (a.error) return a.error;
  const { session, campaign } = a;

  const body = await req.json().catch(() => ({}));
  const requestedDays = Number(body?.ttl_days);
  const ttlDays = Number.isFinite(requestedDays) && requestedDays > 0 && requestedDays <= 90
    ? Math.floor(requestedDays) : DEFAULT_GRANT_TTL_DAYS;

  await supabaseAdmin.from("campaign_preview_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("campaign_id", id).is("revoked_at", null);

  const token = generatePreviewToken();
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();

  const { data, error } = await supabaseAdmin.from("campaign_preview_grants").insert({
    campaign_id: campaign.id,
    // Frozen at creation, re-checked on every use.
    survey_id: campaign.survey_id ?? null,
    organisation_id: campaign.organisation_id ?? null,
    token_hash: hashPreviewToken(token),
    created_by: session!.workEmail,
    expires_at: expiresAt,
  }).select("id, created_at, expires_at").single();

  if (error || !data) {
    return NextResponse.json({ error: "Could not create a review link." }, { status: 500, headers: NO_STORE });
  }

  // The only time the token exists outside the recipient's clipboard.
  return NextResponse.json({
    grant: { id: data.id, created_at: data.created_at, expires_at: data.expires_at, last_used_at: null, use_count: 0 },
    token,
  }, { headers: NO_STORE });
}

/** Revoke every active grant for this campaign. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let a; try { a = await authorise(req, id); } catch (err) { return err as Response; }
  if (a.error) return a.error;

  const { error } = await supabaseAdmin.from("campaign_preview_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("campaign_id", id).is("revoked_at", null);
  if (error) return NextResponse.json({ error: "Could not revoke." }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ revoked: true }, { headers: NO_STORE });
}
