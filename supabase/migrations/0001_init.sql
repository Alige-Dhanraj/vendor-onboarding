-- Vendor onboarding: schema
-- Run this once in the Supabase SQL editor (or `supabase db push`), then run supabase/seed.sql.
--
-- Security model for the MVP: there is no login, so the browser never talks to Supabase directly.
-- Row Level Security is ON for every table with NO public policies; all reads and writes go through
-- the Next.js server using the service-role key (which bypasses RLS and never reaches the browser).

create extension if not exists pgcrypto;

-- One vendor submission; a resubmission is a new row with version + 1.
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  vendor_ref text not null,
  version int not null default 1,
  scenario_id text,                    -- set when loaded from the demo sample picker
  form_data jsonb not null,
  created_at timestamptz not null default now(),
  unique (vendor_ref, version)
);

-- Uploaded files and what the AI read from them.
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  slot text not null,                  -- GST_CERTIFICATE | GST_DECLARATION | PAN_CARD | BANK_PROOF | EIN_NOTICE
  file_name text not null,
  storage_path text,                   -- path in the private 'vendor-documents' bucket
  mime_type text,
  size_bytes int,
  file_hash text,                      -- sha256 of the file; extraction is cached by this
  doc_type text,                       -- what the AI says the document is
  overall_confidence numeric,
  extracted jsonb,                     -- fields + confidence per field
  created_at timestamptz not null default now()
);
create index if not exists documents_submission_idx on documents(submission_id);

-- One execution of the process.
create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  run_number bigint generated always as identity,
  submission_id uuid not null references submissions(id) on delete cascade,
  status text not null default 'RUNNING',   -- RUNNING | COMPLETED | FAILED
  outcome text,                             -- APPROVED | PENDING | REJECTED
  internal_status text,                     -- APPROVED | PENDING_INFO | MANUAL_REVIEW | REJECTED
  review_flag boolean not null default false,
  review_resolved boolean not null default false,
  final_status text,                        -- set by a reviewer: APPROVED | REJECTED | PENDING_INFO
  headline text,
  ai_mode text,                             -- openai | offline
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms int
);
create index if not exists runs_submission_idx on runs(submission_id);
create index if not exists runs_started_idx on runs(started_at desc);

-- Stage-by-stage progress, polled by the live run view.
create table if not exists run_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references runs(id) on delete cascade,
  seq int not null,
  stage text not null,                 -- INTAKE | READ_DOCUMENTS | COMPLETE | VALID | CONSISTENT | CREDIBLE | DECIDE | COMMUNICATE
  state text not null,                 -- RUNNING | DONE | FLAGGED | FAILED | SKIPPED
  detail text,
  duration_ms int,
  at timestamptz not null default now()
);
create index if not exists run_events_run_idx on run_events(run_id, seq);

-- Every check, every run. Never overwritten: this is the audit log.
create table if not exists check_results (
  id bigint generated always as identity primary key,
  run_id uuid not null references runs(id) on delete cascade,
  check_id text not null,
  layer text not null,
  title text not null,
  status text not null,                -- PASS | FAIL | WARN | UNVERIFIED | SKIPPED
  severity text,                       -- HARD_STOP | REVIEW | FIXABLE | WARNING
  checked text,
  sources jsonb not null default '[]',
  rule text,
  reason text,
  next_action text,
  vendor_fix text,
  created_at timestamptz not null default now()
);
create index if not exists check_results_run_idx on check_results(run_id);

-- Every human decision on a flagged run. A reason is mandatory.
create table if not exists reviewer_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  action text not null check (action in ('APPROVE', 'REJECT', 'REQUEST_INFO')),
  reason text not null check (char_length(trim(reason)) >= 10),
  reviewer text not null default 'Procurement reviewer',
  created_at timestamptz not null default now()
);

-- Approved vendors. Bank accounts are stored only as a hash + last 4 digits.
create table if not exists vendor_master (
  id text primary key,                 -- VM-001 ...
  legal_name text not null,
  pan text,
  gstin text,
  bank_account_hash text not null,
  bank_last4 text not null,
  source_run_id uuid references runs(id) on delete set null,
  approved_at timestamptz not null default now()
);

-- Drafted vendor messages (draft-only: a person copies and sends them).
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  subject text not null,
  body text not null,
  analyst_summary text,
  generated_by text not null,          -- openai | template
  created_at timestamptz not null default now()
);

-- Internal blocklist.
create table if not exists blocklist (
  id uuid primary key default gen_random_uuid(),
  name text,
  pan text,
  bank_account_hash text,
  reason text not null
);

-- TEST REGISTRY: a clearly labelled stand-in for the GST portal. Never presented as the live portal.
create table if not exists test_registry (
  gstin text primary key,
  status text not null check (status in ('ACTIVE', 'CANCELLED')),
  legal_name text not null
);

-- Cache of AI results (document readings by file hash, name judgements by name pair).
create table if not exists ai_cache (
  key text primary key,
  value jsonb not null,
  model text,
  created_at timestamptz not null default now()
);

-- Row Level Security on, no public policies (server-only access).
alter table submissions enable row level security;
alter table documents enable row level security;
alter table runs enable row level security;
alter table run_events enable row level security;
alter table check_results enable row level security;
alter table reviewer_actions enable row level security;
alter table vendor_master enable row level security;
alter table messages enable row level security;
alter table blocklist enable row level security;
alter table test_registry enable row level security;
alter table ai_cache enable row level security;

-- Private bucket for uploaded documents (viewed through short-lived signed URLs).
insert into storage.buckets (id, name, public)
values ('vendor-documents', 'vendor-documents', false)
on conflict (id) do nothing;
