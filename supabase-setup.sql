-- Run this once in the Supabase SQL Editor to create your responses table.
-- supabase.com → your project → SQL Editor → New query → paste this → Run

create table if not exists responses (
  id          uuid        default gen_random_uuid() primary key,
  campaign_id text        not null,
  q1          text,
  q2          text,
  q3          text,
  country     text,
  fan_segment text,
  created_at  timestamptz default now()
);

-- Allow anyone to insert a response (needed for the survey form)
alter table responses enable row level security;

create policy "Anyone can insert" on responses
  for insert with check (true);

-- Allow reading responses (needed for the dashboard)
create policy "Anyone can read" on responses
  for select using (true);
