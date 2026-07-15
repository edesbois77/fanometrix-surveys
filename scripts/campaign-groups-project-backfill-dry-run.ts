/**
 * Campaign Groups → Research Project backfill, DRY RUN ONLY.
 * Phase 1 of the Campaign Groups project-scoping work — writes nothing.
 *
 * For every existing campaign_group:
 *   - if every current member campaign shares one non-null research_project_id
 *     → report it as "would assign" that project
 *   - if members span more than one project, or any member has no project
 *     → report it as "leave unscoped, flag for manual review"
 *   - if the group has no members at all → report separately (nothing to infer)
 *
 * Usage: npx tsx scripts/campaign-groups-project-backfill-dry-run.ts
 */
import fs from "fs";
import path from "path";

// tsx doesn't auto-load .env.local the way `next dev` does — load it by hand
// so supabaseAdmin (which reads process.env directly) has real credentials.
const envPath = path.join(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

import { supabaseAdmin } from "../lib/supabase-admin";

async function main() {
  const [{ data: groups }, { data: members }, { data: campaigns }, { data: projects }] = await Promise.all([
    supabaseAdmin.from("campaign_groups").select("id, group_id, name, status"),
    supabaseAdmin.from("campaign_group_members").select("group_id, campaign_id"),
    supabaseAdmin.from("campaigns").select("id, campaign_id, research_project_id"),
    supabaseAdmin.from("research_projects").select("id, project_name, topic, research_mode"),
  ]);

  const projectById = new Map((projects ?? []).map(p => [p.id, p]));
  const campaignById = new Map((campaigns ?? []).map(c => [c.id, c]));

  const membersByGroup = new Map<string, string[]>();
  for (const m of members ?? []) {
    const list = membersByGroup.get(m.group_id) ?? [];
    list.push(m.campaign_id);
    membersByGroup.set(m.group_id, list);
  }

  const wouldAssign: { group: string; slug: string; status: string; projectName: string; memberCount: number }[] = [];
  const flagged: { group: string; slug: string; status: string; reason: string; memberCount: number }[] = [];
  const empty: { group: string; slug: string; status: string }[] = [];

  for (const g of groups ?? []) {
    const memberIds = membersByGroup.get(g.id) ?? [];
    if (memberIds.length === 0) {
      empty.push({ group: g.name, slug: g.group_id, status: g.status });
      continue;
    }

    const projectIds = new Set<string | null>();
    for (const cid of memberIds) {
      const campaign = campaignById.get(cid);
      projectIds.add(campaign?.research_project_id ?? null);
    }

    if (projectIds.size === 1 && !projectIds.has(null)) {
      const soleProjectId = [...projectIds][0] as string;
      const project = projectById.get(soleProjectId);
      wouldAssign.push({
        group: g.name,
        slug: g.group_id,
        status: g.status,
        projectName: project ? (project.topic || project.project_name) : `(unknown project ${soleProjectId})`,
        memberCount: memberIds.length,
      });
    } else if (projectIds.has(null) && projectIds.size === 1) {
      flagged.push({ group: g.name, slug: g.group_id, status: g.status, reason: "all members have no research_project_id", memberCount: memberIds.length });
    } else if (projectIds.has(null)) {
      flagged.push({ group: g.name, slug: g.group_id, status: g.status, reason: `members span ${projectIds.size - 1} project(s) plus some with no project`, memberCount: memberIds.length });
    } else {
      flagged.push({ group: g.name, slug: g.group_id, status: g.status, reason: `members span ${projectIds.size} different projects`, memberCount: memberIds.length });
    }
  }

  console.log(`\nTotal campaign_groups: ${groups?.length ?? 0}\n`);

  console.log(`── Would auto-assign (${wouldAssign.length}) ──────────────────────────`);
  for (const r of wouldAssign) {
    console.log(`  "${r.group}" (${r.slug}, ${r.status}, ${r.memberCount} members) → ${r.projectName}`);
  }

  console.log(`\n── Flagged for manual review, left unscoped (${flagged.length}) ──────`);
  for (const r of flagged) {
    console.log(`  "${r.group}" (${r.slug}, ${r.status}, ${r.memberCount} members) — ${r.reason}`);
  }

  console.log(`\n── No members, nothing to infer (${empty.length}) ─────────────────────`);
  for (const r of empty) {
    console.log(`  "${r.group}" (${r.slug}, ${r.status})`);
  }

  console.log("\nDRY RUN ONLY — no rows were changed.\n");
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
