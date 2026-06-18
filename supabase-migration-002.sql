-- Migration 002: Phase 2 columns
-- Run in: supabase.com → your project → SQL Editor → New query → Run

alter table responses
  add column if not exists survey_id                 text,
  add column if not exists question_set_id           text,
  add column if not exists club                      text,
  add column if not exists competition               text,
  add column if not exists age_band                  text,
  add column if not exists gender                    text,
  add column if not exists device                    text,
  add column if not exists browser                   text,
  add column if not exists response_duration_seconds integer;
