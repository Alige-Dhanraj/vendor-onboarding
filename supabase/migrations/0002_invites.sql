-- Vendor invite links, and the test registry entry for the new sample vendor. Safe to run more than once.
create table if not exists invites (
  token text primary key,
  vendor_ref text,
  contact_name text not null,
  contact_email text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table invites enable row level security;

insert into test_registry (gstin, status, legal_name) values
  ('27AABCP5521K1ZD', 'ACTIVE', 'Pune Packaging Solutions Pvt Ltd')
on conflict (gstin) do nothing;
