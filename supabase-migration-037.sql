-- Migration 037: Extend users table with optional audience association fields.
-- These fields drive insight content-level access control: when an insight is
-- tagged "Dentsu", any user whose associated_agency = 'Dentsu' can see it.
-- All fields are nullable — existing accounts are unaffected.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS associated_agency    text,
  ADD COLUMN IF NOT EXISTS associated_brand     text,
  ADD COLUMN IF NOT EXISTS associated_publisher text,
  ADD COLUMN IF NOT EXISTS associated_projects  text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS associated_markets   text[] DEFAULT '{}';

COMMENT ON COLUMN users.associated_agency    IS 'Agency this user belongs to, e.g. Dentsu. Used for insight access matching.';
COMMENT ON COLUMN users.associated_brand     IS 'Brand/client this user is associated with, e.g. Carlsberg.';
COMMENT ON COLUMN users.associated_publisher IS 'Publisher this user is associated with, e.g. Football365.';
COMMENT ON COLUMN users.associated_projects  IS 'Projects this user is associated with, e.g. {UEFA EURO 2028}.';
COMMENT ON COLUMN users.associated_markets   IS 'Markets this user covers, e.g. {UK, Germany, Sweden}.';
