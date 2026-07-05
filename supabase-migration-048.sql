-- Migration 048: Dynamic Creative Gallery — Theme / Sub-theme / Design
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Lets admins author new creative Designs (colour/gradient variants of the
-- existing Timer layout) in the Creative Gallery, save them under a Theme
-- and Sub-theme, and have them appear dynamically in the Research Project
-- and Campaigns pickers — no code deploy needed. The existing 8 built-in
-- designs + "Fanometrix Default" (Classic Survey) stay hardcoded in
-- lib/creative-designs.ts; this table holds only newly-authored ones.
--
-- theme: fixed 4-value classification (matches the research_projects.study_type
-- CHECK-constraint precedent — a stable, curated list, not a lookup table).
--
-- sub_theme vs publisher_id: exactly one is set, enforced by the CHECK below.
-- sub_theme (freeform text) is used for fanometrix/brand/tournament themes.
-- publisher_id (FK) is used for the publisher theme, resolved live to the
-- publisher's current name at read time — never a copied string, so a
-- publisher rename never orphans a design's sub-theme label.
--
-- builder_state stores the full raw colour/gradient inputs (the same shape
-- as the Creative Gallery's existing, previously-localStorage-only
-- BuilderState) as the single source of truth; the full render palette is
-- derived from it deterministically via lib/creative-theme-builder.ts, not
-- stored redundantly.

CREATE TABLE IF NOT EXISTS creative_designs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text        NOT NULL UNIQUE,
  name          text        NOT NULL,
  theme         text        NOT NULL CHECK (theme IN ('fanometrix','brand','tournament','publisher')),
  sub_theme     text,
  publisher_id  uuid REFERENCES publishers(id) ON DELETE SET NULL,
  builder_state jsonb       NOT NULL,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CHECK ((theme = 'publisher') = (publisher_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_creative_designs_theme ON creative_designs (theme);

ALTER TABLE creative_designs ENABLE ROW LEVEL SECURITY;

-- Service-role only — same pattern as publishers/research_projects. All
-- reads (including the Research Project/Campaigns pickers) and writes go
-- through supabaseAdmin in the API layer, never the anon key directly.
CREATE POLICY "deny_all_anon" ON creative_designs USING (false);
