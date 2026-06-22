-- Migration 035: Football taxonomy — topics and subtopics for AI classification
-- Seeded with the Fanometrix V2 football taxonomy. Can be extended via admin.

CREATE TABLE IF NOT EXISTS social_taxonomy (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  topic       text  NOT NULL,
  subtopic    text,             -- null = top-level topic entry
  sort_order  integer NOT NULL DEFAULT 0,
  UNIQUE (topic, subtopic)
);

INSERT INTO social_taxonomy (topic, subtopic, sort_order) VALUES
  -- Topics only (subtopic = null)
  ('Transfers',          null, 1),
  ('Ticketing',          null, 2),
  ('Matchday Experience',null, 3),
  ('Streaming',          null, 4),
  ('Merchandise',        null, 5),
  ('Sponsorship',        null, 6),
  ('Food & Drink',       null, 7),
  ('Travel',             null, 8),
  ('Players',            null, 9),
  ('Managers',           null, 10),
  ('Ownership',          null, 11),
  ('Women''s Football',  null, 12),
  ('Community',          null, 13),
  ('Grassroots',         null, 14),
  ('Competitions',       null, 15),
  ('Facilities',         null, 16),
  ('Accessibility',      null, 17),
  ('Broadcasting',       null, 18),
  ('Fan Rewards',        null, 19),

  -- Ticketing subtopics
  ('Ticketing', 'Pricing',      1),
  ('Ticketing', 'Availability', 2),
  ('Ticketing', 'Membership',   3),
  ('Ticketing', 'Hospitality',  4),

  -- Matchday subtopics
  ('Matchday Experience', 'Atmosphere', 1),
  ('Matchday Experience', 'Food',       2),
  ('Matchday Experience', 'Safety',     3),
  ('Matchday Experience', 'Transport',  4),

  -- Sponsorship subtopics
  ('Sponsorship', 'Activations',       1),
  ('Sponsorship', 'Rewards',           2),
  ('Sponsorship', 'Brand Perception',  3),
  ('Sponsorship', 'Advertising',       4),

  -- Streaming subtopics
  ('Streaming', 'Cost',           1),
  ('Streaming', 'Quality',        2),
  ('Streaming', 'Availability',   3),
  ('Streaming', 'Accessibility',  4),

  -- Women''s Football subtopics
  ('Women''s Football', 'Participation',  1),
  ('Women''s Football', 'Accessibility',  2),
  ('Women''s Football', 'Visibility',     3),
  ('Women''s Football', 'Investment',     4)

ON CONFLICT (topic, subtopic) DO NOTHING;

ALTER TABLE social_taxonomy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_taxonomy" ON social_taxonomy USING (false);
