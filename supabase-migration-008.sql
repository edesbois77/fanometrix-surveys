-- Migration 008: Auth users table
-- Run this in the Supabase SQL Editor before deploying auth.
-- Requires pgcrypto extension (enabled by default on Supabase).

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  username             text         UNIQUE NOT NULL,
  hashed_password      text         NOT NULL,
  role                 text         NOT NULL CHECK (role IN ('admin', 'brand', 'agency', 'publisher')),
  organisation_name    text         NOT NULL DEFAULT '',
  organisation_type    text         NOT NULL DEFAULT '',
  allowed_campaign_ids text[]       NOT NULL DEFAULT '{}',
  allowed_publisher_ids text[]      NOT NULL DEFAULT '{}',
  is_active            boolean      NOT NULL DEFAULT true,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Deny all access via the anon/authenticated keys.
-- The service role (used server-side) bypasses RLS automatically.
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_anon" ON users
  USING (false);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SEED ACCOUNTS
-- Passwords hashed with bcrypt (cost 10) via pgcrypto.
-- bcryptjs on the server can verify these $2a$ hashes.
--
-- DEFAULT PASSWORDS (change after first login):
--   tfc_admin        → Fanometrix2026!
--   carlsberg_client → Carlsberg2026!
--   dentsu_agency    → Dentsu2026!
--   fotmob_partner   → Fotmob2026!
-- ============================================================
INSERT INTO users (username, hashed_password, role, organisation_name, organisation_type, allowed_campaign_ids, allowed_publisher_ids)
VALUES
  (
    'tfc_admin',
    crypt('Fanometrix2026!', gen_salt('bf', 10)),
    'admin',
    'Fanometrix',
    'platform',
    '{}',
    '{}'
  ),
  (
    'carlsberg_client',
    crypt('Carlsberg2026!', gen_salt('bf', 10)),
    'brand',
    'Carlsberg',
    'brand',
    '{}',
    '{}'
  ),
  (
    'dentsu_agency',
    crypt('Dentsu2026!', gen_salt('bf', 10)),
    'agency',
    'Dentsu',
    'agency',
    '{}',
    '{}'
  ),
  (
    'fotmob_partner',
    crypt('Fotmob2026!', gen_salt('bf', 10)),
    'publisher',
    'FotMob',
    'publisher',
    '{}',
    '{FotMob}'
  );
