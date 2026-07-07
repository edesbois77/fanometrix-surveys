# Organisation Model

This is the canonical reference for how Organisations, Users, Roles, Permissions, and Access Grants work in Fanometrix, and how Campaigns, Research Projects, and Insights relate to them. It reflects the User Management v2 redesign (migrations 052 through 062).

## Why this exists

Before this redesign, "organisation" was a free-text string in four different places (`users.organisation_name`, `campaigns.publisher`/`brand_name`, `campaign_groups.publisher`/`brand_name`, `research_projects.publishers[]`/`brand_name`), with no referential integrity. Access control was three separate, inconsistent mechanisms bolted onto the `users` row over time. Permissions were baked into a 7 day JWT with no revocation.

Organisations are now a first-class table that every other entity references by foreign key, authorization is checked live against the database on every request, and there is a single, polymorphic grant mechanism for fine-grained access.

## Organisations

Table: `organisations` (migration 052).

```
id, name, type ('publisher' | 'agency' | 'brand' | 'internal'), status ('active' | 'disabled'),
created_at, updated_at, deleted_at, deleted_by
```

Every publisher, agency, brand, and Fanometrix's own internal org is a row here. `type` is fixed at creation and drives which pickers an organisation appears in. `status = 'disabled'` blocks every non-admin user belonging to that organisation from authenticating (see `lib/auth-server.ts`); admins are exempt so a disabled internal org can never lock out the whole platform.

Managed at `/organisations` (admin only), backed by `app/api/organisations/route.ts` and `[id]/route.ts`. `GET` is open to all authenticated roles (a lean `{id, name, type, status}` shape for non-admins, full detail + user count for admins) since every creation form across the app needs to populate its organisation pickers. Mutations are admin-only. Deletes are soft (`deleted_at`), guarded against organisations with active users unless `force` is passed.

## Users

Table: `users` (v2 columns added in migration 054).

```
id, first_name, last_name, work_email (login identifier), job_title,
role ('admin' | 'publisher' | 'agency' | 'brand'),
organisation_id -> organisations(id),
access_scope ('organisation_wide' | 'selected'),
status ('pending_invitation' | 'active' | 'disabled'),
last_login_at, password_changed_at, created_by, legacy_username
```

`work_email` is the login identifier (case-insensitive). `legacy_username` is kept only as a historical reference — never used for authentication. Managed at `/user-management` (admin only), backed by `app/api/users/route.ts` and `[id]/route.ts`.

A **Publisher-role user is always locked to their own organisation**: the Create/Edit User form disables the organisation picker for publisher accounts, and every creation API (Campaigns, Campaign Groups, Research Projects, Surveys, Users) re-applies that lock server-side regardless of what the client sends — client-side disabling alone is never treated as enforcement.

### Status lifecycle

`pending_invitation` (account created, never logged in) → `active` (set on first successful login) → `disabled` (blocks all API access immediately, checked on every request, not just at login).

## Roles

Unchanged from the pre-existing model: `admin`, `publisher`, `agency`, `brand`. Role is a coarse gate (which route prefixes and API groups a user can reach at all — see `middleware.ts` and each route's `requireUser(req, [...roles])` call); Access Scope and Access Grants below are the fine-grained layer within what a role permits.

## Authorization: identity vs. authority

- **`lib/auth.ts`** (Edge-safe) — `getSession()` verifies the JWT and returns identity only: `sub`, `role`, `forcePasswordChange`. Used exclusively by `middleware.ts` for coarse, non-authoritative route redirects. The JWT is never trusted for permissions.
- **`lib/auth-server.ts`** (Node-only) — `requireUser(req, allowedRoles?)` is the authoritative check on every API route. It verifies the JWT for identity, then does a **live database lookup** joining `users` to `organisations` for current role, organisation, organisation status, access scope, and account status. Rejects immediately if the account isn't `active` or its organisation is `disabled`.

This means disabling a user or their organisation, or changing their role or access, takes effect on their very next request — not on next login. The cost is one extra DB lookup per protected request, judged acceptable at current scale versus the alternative of stale JWT-encoded permissions.

## Access Scope and Permission Hierarchy

Every non-admin user has an `access_scope`:

- **`organisation_wide`** — sees every resource belonging to their own organisation, resolved live via the `*_org_id` foreign keys described below. This is the default, and the only option for publisher-role users (labeled "Publisher-wide" in the UI).
- **`selected`** — sees only resources explicitly granted to them, via `user_access_grants`.

The Permission Hierarchy, in inheritance order:

```
Research Project → Campaign Group → Campaign → Insight/Report
```

A grant on a parent cascades to its children (a grant on a Research Project makes every Campaign under it visible; a grant on a Campaign Group makes its member Campaigns visible), but Campaign Groups do not inherit from Research Projects — a group's relationship to a project is indirect (via its member campaigns' own `research_project_id`), so a project-level grant does not itself surface a group. Insights are a flat, independent level; they don't hang off the other three.

All of this logic lives in **`lib/access.ts`**:

- `visibleResourceIds(user, resourceType)` — returns `string[] | null` for list endpoints; `null` means unrestricted (admins).
- `canAccess(user, resourceType, resourceId)` — single-resource check for detail-fetch routes.

`resourceType` is one of `research_project | campaign_group | campaign | insight`.

## user_access_grants — the Assign Access mechanism

Table: `user_access_grants` (migration 056).

```
id, user_id -> users(id), resource_type ('research_project' | 'campaign_group' | 'campaign' | 'insight'),
resource_id, created_at, created_by
```

Deliberately **polymorphic** (one table, `resource_type` + `resource_id`) rather than a separate join table per resource type. This is what makes a single universal "Assign Access" search picker possible, and what lets the same mechanism extend to new resource types later (Dashboards, Exports, Conversation Intelligence) without new tables or new query paths — see Future Extension Points below.

There is **no permission-template concept** (e.g. a reusable "Publisher Admin" bundle) by design for V1. A user's effective access is always the direct combination of `role` + `access_scope` + their own `user_access_grants` rows.

The picker itself is backed by `app/api/access-search/route.ts`, which flattens Research Projects, Campaign Groups, Campaigns, and Insights into one searchable, typed list (`value = "resource_type:uuid"`), with keywords built from each resource's resolved organisation names, tags, and countries — never from the legacy free-text fields (see below).

## Campaign / Research Project ownership

Table: `campaigns`, `campaign_groups` (organisation FKs added in migration 057):

```
publisher_org_id -> organisations(id)
brand_org_id     -> organisations(id)
agency_org_id    -> organisations(id)
```

Table: `research_projects` (migration 057):

```
publisher_org_ids uuid[]           -- array of organisations(id); a project can target several publishers
brand_org_id      -> organisations(id)
agency_org_id     -> organisations(id)
```

These replaced the free-text `publisher`, `brand_name` (and `publishers text[]` on Research Projects) columns, which were dropped entirely in migration 062 once every read across the app was migrated to resolve names from the FK columns instead (verified against live data to produce byte-identical display strings before the drop). `lib/naming.ts`'s name/slug generators still take plain strings — call sites resolve `organisation.name` from the `*_org_id` before calling them.

**Organisation-wide visibility** for these three resource types is computed directly against these columns (`lib/access.ts`'s `orgWideResourceIds`): a campaign or campaign group is visible if the user's organisation matches its publisher, brand, or agency; a research project is visible if the user's organisation matches its brand/agency, or appears anywhere in its `publisher_org_ids` array.

Server-side enforcement: every creation/update API for these three resource types re-applies the publisher-lock (`if (session.role === "publisher") { safe.publisher_org_id = session.organisationId }`) regardless of client payload, mirroring the UI's disabled picker.

## Insight visibility

Insights (table `insights`, includes both "insight" and "report" content types) are **not yet** on the organisation-FK model — they carry free-text audience tags, authored as organisation names, and are matched case-insensitively:

- Admins see everything.
- Non-admins only see `status = 'published'` insights.
- `visibility = 'public'` → every logged-in user.
- `visibility = 'admin_only'` → admins only.
- `visibility = 'restricted'`:
  - Organisation-wide users match if their own organisation's name appears in the insight's tags.
  - Selected-access users match only via an explicit `user_access_grants` row (`resource_type = 'insight'`) on that exact insight.

This logic lives in `lib/insights-access.ts` (`canAccessInsight`, `filterInsights`). It replaced four separate legacy matching schemes (`associated_agency`/`associated_brand`/`associated_publisher`/`associated_projects`/`associated_markets`) with this one. The project/market "recurring tag" matching those fields provided doesn't have a direct equivalent today — the same reach is achieved by granting specific insights via Assign Access instead of a standing tag rule. Bringing Insights fully onto the organisation-FK model (an `organisation_id` column instead of tag matching) is a candidate future extension.

## Future extension points

- **New grantable resource types** (Dashboards, Exports, Conversation Intelligence, etc.): add the type to `user_access_grants.resource_type`'s CHECK constraint, add a case to `lib/access.ts`'s `orgWideResourceIds`/`selectedResourceIds`, and add it to `app/api/access-search/route.ts`'s flattened option list. No new tables needed.
- **Insights onto the organisation-FK model**: replace tag-matching in `lib/insights-access.ts` with an `insights.organisation_id` (or similar) column, once insight authorship is ready to move off free-text tags.
- **Permission templates**: deliberately deferred for V1 (see the original planning discussion). If reused access bundles become common, the natural home is a `permission_templates` table whose rows expand into `user_access_grants` inserts at assignment time, not a change to the grant mechanism itself.
- **Campaign Groups inheriting from Research Projects**: currently a group's visibility does not cascade from a project-level grant, only from a direct group grant or its member campaigns. If that's ever needed, `campaign_groups` would need its own `research_project_id`, or the inheritance rule in `lib/access.ts` extended to look through member campaigns.
