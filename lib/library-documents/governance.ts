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
  // Set when visibility is "project" — the single project this document is bound
  // to. It can only be attached there (least privilege). Null falls back to org.
  scope_project_id?: string | null;
};

/** The identity + org attachments of a project — its id plus the three ways it
 *  belongs to an organisation (supabase-migration-057). */
export type ProjectOrgContext = {
  id: string;
  brand_org_id: string | null;
  agency_org_id: string | null;
  publisher_org_ids: string[] | null;
};

// Exposure scopes, widest-last. A permission of rank R authorises every scope of
// rank ≤ R. project(0) ⊂ organisation(1) ⊂ internal(2) ⊂ platform(3).
const SCOPE_RANK: Record<string, number> = { project: 0, organisation: 1, internal: 2, platform: 3 };

/** True when a document is confined to a single owning organisation — usable only
 *  inside that organisation's projects, never in or informing another org's work.
 *  ("Project Only" with a bound project is handled separately, as an even tighter,
 *  single-engagement scope.) Only meaningful once an owning organisation is set. */
export function isOrgRestricted(doc: GovernedDocument): boolean {
  return !!doc.owner_org_id && (
    doc.confidentiality === "nda_restricted" ||
    doc.visibility === "organisation" ||
    (doc.visibility === "project" && !doc.scope_project_id)   // Project Only w/o a bound project → org scope
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
 *  used within) a project.
 *  - "Project Only" bound to an engagement → only that project (least privilege).
 *  - Otherwise org-restricted → only projects belonging to the owning organisation.
 *  - Otherwise → attaches freely.
 *  This stops a confidential/NDA document reaching a project it doesn't belong to. */
export function canAttachDocumentToProject(doc: GovernedDocument, project: ProjectOrgContext): boolean {
  if (doc.visibility === "project" && doc.scope_project_id) {
    return project.id === doc.scope_project_id;
  }
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
// The field label already says "AI Access" — the options mirror Visibility.
export const AI_ACCESS_LABEL: Record<AIAccess, string> = {
  project: "Project", organisation: "Organisation", internal: "Internal", platform: "Platform",
};

export const OWNERS = Object.keys(OWNER_LABEL) as DocumentOwner[];
export const CONFIDENTIALITIES: DocumentConfidentiality[] = ["public", "internal", "confidential", "nda_restricted"];
export const VISIBILITIES = Object.keys(VISIBILITY_LABEL) as DocumentVisibility[];
export const LEARNING_PERMISSIONS = Object.keys(LEARNING_LABEL) as LearningPermission[];
export const AI_ACCESSES = Object.keys(AI_ACCESS_LABEL) as AIAccess[];

// ── Plain-language help: one line per FIELD, one line per OPTION ──────────────
export const GOVERNANCE_FIELD_HELP = {
  owner: "Who legally owns the original document.",
  confidentiality: "How sensitive the document is, and how strictly it's handled.",
  visibility: "Who can view and attach this document.",
  learning_permission: "Can insights from this document contribute to future Fanometrix intelligence?",
  ai_access: "Which AI assistants are permitted to analyse this document.",
  owner_org_id: "The organisation that owns this document.",
} as const;

export const OWNER_DESC: Record<DocumentOwner, string> = {
  fanometrix: "Created or commissioned by Fanometrix.",
  organisation: "Owned by a client or agency.",
  publisher: "Owned by a publisher partner.",
  licensed_partner: "Owned by a third-party research provider (e.g. GWI, Nielsen, Mintel).",
  public: "Publicly available research.",
};
export const CONFIDENTIALITY_DESC: Record<DocumentConfidentiality, string> = {
  public: "Publicly available — no handling restrictions.",
  internal: "Fanometrix-internal only.",
  confidential: "Sensitive — restricted handling.",
  nda_restricted: "Under NDA — locked to the owning organisation and never learned from.",
};
export const VISIBILITY_DESC: Record<DocumentVisibility, string> = {
  project: "Visible only within this research project.",
  organisation: "Visible to projects belonging to the owning organisation.",
  internal: "Visible only to Fanometrix users.",
  platform: "Available throughout Fanometrix where permissions allow.",
};
export const LEARNING_DESC: Record<LearningPermission, string> = {
  no_learning: "Never contributes to future Fanometrix intelligence.",
  anonymous: "Only anonymous patterns may contribute.",
  aggregated: "May contribute to benchmarks and aggregated intelligence.",
  platform: "May contribute fully to Platform Intelligence.",
};
export const AI_ACCESS_DESC: Record<AIAccess, string> = {
  project: "Only this project's AI may analyse it.",
  organisation: "AI within the owning organisation's projects.",
  internal: "Fanometrix internal AI assistants.",
  platform: "Any Fanometrix AI, platform-wide.",
};

// ── Recommended presets — enterprise users think "this is an NDA document",
//    not in five independent dimensions. A preset configures all of them at once
//    (owner-org is still chosen separately for organisation-owned presets). ─────
export type GovernancePreset = {
  key: string; label: string; description: string; requiresOrg?: boolean;
  values: Pick<GovernedDocument, "owner" | "confidentiality" | "visibility" | "learning_permission" | "ai_access">;
};
export const GOVERNANCE_PRESETS: GovernancePreset[] = [
  {
    key: "public_research", label: "Public Research",
    description: "Publicly available research — usable and shareable across the platform.",
    values: { owner: "public", confidentiality: "public", visibility: "platform", learning_permission: "platform", ai_access: "platform" },
  },
  {
    key: "fanometrix_research", label: "Fanometrix Research",
    description: "Created or commissioned by Fanometrix — internal, and feeds platform intelligence.",
    values: { owner: "fanometrix", confidentiality: "internal", visibility: "internal", learning_permission: "platform", ai_access: "internal" },
  },
  {
    key: "client_confidential", label: "Client Confidential", requiresOrg: true,
    description: "Owned by a client or agency — confidential to this engagement, never contributes to platform learning. Promote visibility to Organisation to reuse it across the org's projects.",
    values: { owner: "organisation", confidentiality: "confidential", visibility: "project", learning_permission: "no_learning", ai_access: "organisation" },
  },
  {
    key: "nda_restricted", label: "NDA Restricted", requiresOrg: true,
    description: "Under NDA — locked to the owning organisation's projects, never learned from, never leaves.",
    values: { owner: "organisation", confidentiality: "nda_restricted", visibility: "project", learning_permission: "no_learning", ai_access: "project" },
  },
  {
    key: "licensed_research", label: "Licensed Research",
    description: "Third-party licensed data (e.g. GWI, Nielsen, Mintel) — usable across Fanometrix projects, but never contributes to platform learning.",
    values: { owner: "licensed_partner", confidentiality: "confidential", visibility: "internal", learning_permission: "no_learning", ai_access: "internal" },
  },
];

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
  scope_project_id: null,
};
