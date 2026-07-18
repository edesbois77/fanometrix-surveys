-- Migration 119 — Search Strategy (Phase 1): retrieval planning on the search
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- The structured, human-editable retrieval plan derived from a Conversation
-- Search's Research Question (docs/search-strategy-blueprint.md). It lives ON the
-- search — an attribute of the evidence producer, NOT a new top-level object.
-- Phase 1 only GENERATES, STORES and EDITS the strategy; connectors do not
-- consume it yet, and the social_keywords path remains the collection fallback.
--
-- Shape (jsonb): { primary_entity{term,type,aliases[]}, context_entities[],
-- synonyms[], campaigns[], exclusions[], breadth('broad'|'balanced'|'strict'),
-- languages[], markets[], connector_hints{}, generated_at, edited }. Kept as
-- jsonb (not columns) because it is generated content that evolves with the
-- research, same as the AI classification and aspect synthesis.

ALTER TABLE social_searches
  ADD COLUMN IF NOT EXISTS search_strategy jsonb;

-- Rollback:
--   ALTER TABLE social_searches DROP COLUMN IF EXISTS search_strategy;
