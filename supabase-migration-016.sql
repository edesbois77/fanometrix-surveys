-- Migration 016: Campaign Groups
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Campaign Groups bundle multiple campaigns into one embed code.
-- Responses remain linked to the specific campaign served, not the group.

-- ── Campaign groups ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    text        NOT NULL UNIQUE,   -- slug used in embed URLs
  name        text        NOT NULL,
  description text,
  publisher   text,
  status      text        NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'live', 'paused', 'closed', 'archived')),
  rotation    text        NOT NULL DEFAULT 'equal'
              CHECK (rotation IN ('equal', 'weighted', 'priority')),
  start_date  date,
  end_date    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaign_groups ENABLE ROW LEVEL SECURITY;

-- Public read so the embed endpoint (anon key) can resolve groups
CREATE POLICY "Anyone can read campaign_groups"
  ON campaign_groups FOR SELECT USING (true);

-- ── Campaign group members ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_group_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid        NOT NULL REFERENCES campaign_groups(id) ON DELETE CASCADE,
  campaign_id uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  weight      integer     NOT NULL DEFAULT 1,  -- used for weighted rotation
  priority    integer     NOT NULL DEFAULT 0,  -- lower = higher priority
  added_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, campaign_id)
);

ALTER TABLE campaign_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read campaign_group_members"
  ON campaign_group_members FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_group_members_group
  ON campaign_group_members (group_id);
