-- Migration 001: Add publisher and placement columns for MPU embed tracking
-- Run this in: supabase.com → your project → SQL Editor → New query → Run

alter table responses
  add column if not exists publisher text,
  add column if not exists placement text;
