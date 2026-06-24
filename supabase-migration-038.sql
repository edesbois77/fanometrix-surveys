-- Migration 038: Insights — content-level access-controlled knowledge library.
-- Admins create insight items (reports, analyses, etc.) and tag them with
-- audience names. Users see only the insights whose tags match their account.

-- ── Enum types ────────────────────────────────────────────────────────────────

CREATE TYPE insight_content_type AS ENUM (
  'report',
  'market_analysis',
  'survey_results',
  'social_intelligence',
  'cheat_sheet',
  'dashboard',
  'download'
);

CREATE TYPE insight_status AS ENUM (
  'draft',
  'published',
  'archived'
);

CREATE TYPE insight_visibility AS ENUM (
  'public',        -- all logged-in users
  'admin_only',    -- admins only
  'restricted'     -- users whose fields match one or more audience tags
);

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE insights (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text        NOT NULL,
  subtitle           text,
  slug               text        NOT NULL UNIQUE,
  content_type       insight_content_type NOT NULL,
  status             insight_status       NOT NULL DEFAULT 'draft',
  published_at       timestamptz,
  summary            text,
  -- Flexible block array: [{type: 'heading'|'paragraph'|'image'|'quote', content: '...'}]
  content_blocks     jsonb       NOT NULL DEFAULT '[]',
  download_url       text,
  featured_image_url text,
  -- Audience tags: e.g. ['Dentsu', 'Carlsberg', 'UEFA EURO 2028', 'UK']
  -- Special values: 'public', 'admin_only' are handled via the visibility column,
  -- not via tags. Tags here are org/agency/brand/publisher/project/market names.
  tags               text[]      NOT NULL DEFAULT '{}',
  visibility         insight_visibility NOT NULL DEFAULT 'restricted',
  created_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_insights_status       ON insights(status);
CREATE INDEX idx_insights_content_type ON insights(content_type);
CREATE INDEX idx_insights_visibility   ON insights(visibility);
CREATE INDEX idx_insights_published_at ON insights(published_at DESC NULLS LAST);
CREATE INDEX idx_insights_tags         ON insights USING GIN(tags);

-- ── updated_at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_insights_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_insights_updated_at
  BEFORE UPDATE ON insights
  FOR EACH ROW EXECUTE FUNCTION update_insights_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- All access flows through supabaseAdmin (service role) in API routes,
-- which bypasses RLS by design. Anon key is denied.

ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

-- ── Seed: first Fanometrix report ─────────────────────────────────────────────

INSERT INTO insights (
  title,
  subtitle,
  slug,
  content_type,
  status,
  published_at,
  summary,
  content_blocks,
  visibility,
  tags,
  created_by
) VALUES (
  'Football as an Access Engine',
  'Understanding what football fans value and how brands can genuinely give back.',
  'football-as-an-access-engine',
  'report',
  'published',
  now(),
  'A Fanometrix report exploring what football fans truly value from brand partnerships — and how brands like Carlsberg can deliver meaningful access in the context of UEFA EURO 2028.',
  '[{"type":"paragraph","content":"This report draws on Fanometrix fan survey data to explore a central question: what do football fans actually want from the brands that sponsor the game they love? The answer, consistently, is access — to experiences, moments and connections that money alone cannot buy.\n\nFor Carlsberg and UEFA EURO 2028, the implications are significant. Fans across the UK, Germany, Sweden, India and China share a belief that brands earn their place in football by giving something genuine back. This report sets out what that looks like in practice, market by market, and identifies the white space where brand activity can be most impactful.\n\nContent to follow as the full report is completed."}]'::jsonb,
  'restricted',
  ARRAY['Dentsu', 'Carlsberg', 'UEFA EURO 2028', 'UK', 'Germany', 'Sweden', 'India', 'China'],
  'admin'
);
