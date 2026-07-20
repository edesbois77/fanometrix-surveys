// Document Governance — the single source of truth for what may be done with a
// library document (docs/governance-model.md). Every product that touches a
// document — Research Library, Research Projects, AI assistants, Football
// Intelligence, the Knowledge Graph, benchmarks, platform learning — MUST route
// its access decision through the functions here rather than re-implementing the
// rules. That is what makes governance an architectural property, not a per-
// feature policy (Chapter 8: "Trust is established through architecture").
//
// The model separates three independent concepts, exactly as the platform
// architecture prescribes:
//   • Ownership   — who owns the source (never transferred by uploading it)
//   • Learning    — whether observations may strengthen platform intelligence
//   • Exposure    — where the document, and AI over it, may appear
//
// Defaults are trust-first: nothing reaches another organisation or the platform
// without explicit permission.

export type DocumentOwner = "fanometrix" | "organisation" | "publisher" | "licensed_partner" | "public";
export type DocumentConfidentiality = "public" | "internal" | "confidential" | "nda_restricted";
export type DocumentVisibility = "project" | "organisation" | "internal" | "platform";
export type LearningPermission = "no_learning" | "anonymous" | "aggregated" | "platform";
export type AIAccess = "project" | "organisation" | "internal" | "platform";

/** The governance-bearing fields of a document. Any row with these columns can
 *  be evaluated — the functions never need the file itself. */
export type GovernedDocument = {
  owner: DocumentOwner;
  owner_org_id: string | null;
  confidentiality: DocumentConfidentiality;
  visibility: DocumentVisibility;
  learning_permission: LearningPermission;
  ai_access: AIAccess;
};

/** The org attachments of a project — the three ways a project belongs to an
 *  organisation (supabase-migration-057). */
export type ProjectOrgContext = {
  brand_org_id: string | null;
  agency_org_id: string | null;
  publisher_org_ids: string[] | null;
};

// Exposure scopes, widest-last. A permission of rank R authorises every scope of
// rank ≤ R. project(0) ⊂ organisation(1) ⊂ internal(2) ⊂ platform(3).
const SCOPE_RANK: Record<string, number> = { project: 0, organisation: 1, internal: 2, platform: 3 };

/** True when a document is confined to a single owning organisation — i.e. it may
 *  only ever be used inside that organisation's projects, and must never appear in
 *  or inform any other organisation's work. Driven by confidentiality + visibility
 *  and only meaningful once an owning organisation is set. */
export function isOrgRestricted(doc: GovernedDocument): boolean {
  return !!doc.owner_org_id && (
    doc.confidentiality === "nda_restricted" ||
    doc.visibility === "organisation" ||
    doc.visibility === "project"
  );
}

/** Does this project belong to the given organisation (as brand, agency or
 *  publisher)? */
export function projectBelongsToOrg(project: ProjectOrgContext, orgId: string): boolean {
  return project.brand_org_id === orgId
    || project.agency_org_id === orgId
    || (project.publisher_org_ids ?? []).includes(orgId);
}

/** ENFORCEMENT POINT 1 — attach. Whether a document may be attached to (and thus
 *  used within) a project. Org-restricted documents may only attach to projects
 *  belonging to their owning organisation; everything else attaches freely. This
 *  is what stops an NDA-restricted document reaching another client's project. */
export function canAttachDocumentToProject(doc: GovernedDocument, project: ProjectOrgContext): boolean {
  if (!isOrgRestricted(doc)) return true;
  return projectBelongsToOrg(project, doc.owner_org_id!);
}

/** ENFORCEMENT POINT 2 — library visibility. Whether a document may appear in a
 *  library view for a given viewer. `viewer` is an organisation id, or "operator"
 *  for Fanometrix's own admins (who manage every document). Org-restricted docs
 *  only ever surface for their owning org; internal docs are operator-only;
 *  platform/public docs surface for everyone. */
export function documentVisibleToViewer(doc: GovernedDocument, viewer: string | "operator"): boolean {
  if (viewer === "operator") return true;                          // Fanometrix admins manage everything
  if (doc.owner_org_id && doc.owner_org_id === viewer) return true; // your own org's documents
  if (doc.visibility === "platform" || doc.confidentiality === "public") return true;
  return false;                                                     // internal / other-org / restricted → hidden
}

/** ENFORCEMENT POINT 3 — platform learning. Whether observations from this
 *  document may EVER strengthen platform intelligence (Knowledge Objects,
 *  benchmarks, Football Intelligence, cross-project learning). NDA-restricted and
 *  no-learning documents never can. Every future platform-learning feature must
 *  gate on this before ingesting a document. */
export function canDocumentContributeToLearning(doc: GovernedDocument): boolean {
  return doc.confidentiality !== "nda_restricted" && doc.learning_permission !== "no_learning";
}

/** ENFORCEMENT POINT 4 — AI access. Whether an AI assistant operating at a given
 *  exposure scope may read this document. Per-project analysis (scope "project")
 *  is always permitted for a document already attached to that project; an
 *  organisation / internal / platform assistant must have matching ai_access. */
export function canAIReadDocument(doc: GovernedDocument, scope: AIAccess): boolean {
  return (SCOPE_RANK[doc.ai_access] ?? 0) >= (SCOPE_RANK[scope] ?? 0);
}

// ── Human-readable labels (shared by UI) ─────────────────────────────────────
export const OWNER_LABEL: Record<DocumentOwner, string> = {
  fanometrix: "Fanometrix", organisation: "Organisation", publisher: "Publisher",
  licensed_partner: "Licensed Partner", public: "Public",
};
export const CONFIDENTIALITY_LABEL: Record<DocumentConfidentiality, string> = {
  public: "Public", internal: "Internal", confidential: "Confidential", nda_restricted: "NDA Restricted",
};
export const VISIBILITY_LABEL: Record<DocumentVisibility, string> = {
  project: "Project Only", organisation: "Organisation", internal: "Internal", platform: "Platform",
};
export const LEARNING_LABEL: Record<LearningPermission, string> = {
  no_learning: "No Learning", anonymous: "Anonymous Learning", aggregated: "Aggregated Learning", platform: "Platform Learning",
};
export const AI_ACCESS_LABEL: Record<AIAccess, string> = {
  project: "Project AI", organisation: "Organisation AI", internal: "Internal AI", platform: "Platform AI",
};

export const OWNERS = Object.keys(OWNER_LABEL) as DocumentOwner[];
export const VISIBILITIES = Object.keys(VISIBILITY_LABEL) as DocumentVisibility[];
export const LEARNING_PERMISSIONS = Object.keys(LEARNING_LABEL) as LearningPermission[];
export const AI_ACCESSES = Object.keys(AI_ACCESS_LABEL) as AIAccess[];

const isIn = <T extends string>(vals: T[]) => (v: unknown): v is T => typeof v === "string" && (vals as string[]).includes(v);
export const isOwner = isIn(OWNERS);
export const isVisibility = isIn(VISIBILITIES);
export const isLearningPermission = isIn(LEARNING_PERMISSIONS);
export const isAIAccess = isIn(AI_ACCESSES);

/** The trust-first defaults applied to a fresh upload (mirrors the DB column
 *  defaults in migration 124). A document leaks nowhere until someone widens it. */
export const GOVERNANCE_DEFAULTS: GovernedDocument = {
  owner: "fanometrix", owner_org_id: null, confidentiality: "internal",
  visibility: "internal", learning_permission: "no_learning", ai_access: "internal",
};
