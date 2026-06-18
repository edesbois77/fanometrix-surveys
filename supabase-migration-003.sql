-- Migration 003: Surveys + Campaigns tables
-- Run in: supabase.com → your project → SQL Editor → New query → Run

-- ── Surveys ──────────────────────────────────────────────────────────────────
create table if not exists surveys (
  id                uuid        default gen_random_uuid() primary key,
  name              text        not null,
  description       text,
  questions         jsonb       not null default '[]',
  thank_you_title   text        not null default 'Thank you!',
  thank_you_body    text        not null default 'Your response has been recorded.',
  start_date        date,
  end_date          date,
  status            text        not null default 'draft'
                    check (status in ('draft','live','completed','archived')),
  is_template       boolean     not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table surveys enable row level security;
create policy "Anyone can read surveys"  on surveys for select using (true);
create policy "Anyone can insert surveys" on surveys for insert with check (true);
create policy "Anyone can update surveys" on surveys for update using (true);
create policy "Anyone can delete surveys" on surveys for delete using (true);

-- ── Campaigns ────────────────────────────────────────────────────────────────
create table if not exists campaigns (
  id                   uuid        default gen_random_uuid() primary key,
  campaign_id          text        not null unique,
  brand_name           text        not null,
  campaign_name        text        not null,
  campaign_description text,
  start_date           date,
  end_date             date,
  survey_id            uuid        references surveys(id) on delete set null,
  publishers           text[]      not null default '{}',
  status               text        not null default 'draft'
                       check (status in ('draft','live','completed','archived')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table campaigns enable row level security;
create policy "Anyone can read campaigns"   on campaigns for select using (true);
create policy "Anyone can insert campaigns" on campaigns for insert with check (true);
create policy "Anyone can update campaigns" on campaigns for update using (true);
create policy "Anyone can delete campaigns" on campaigns for delete using (true);
