-- Deactivate / reactivate vendors. Safe to run more than once.
alter table vendor_master add column if not exists active boolean not null default true;
alter table vendor_master add column if not exists inactive_reason text;
alter table vendor_master add column if not exists inactive_by text;
alter table vendor_master add column if not exists inactive_at timestamptz;

alter table reviewer_actions drop constraint if exists reviewer_actions_action_check;
alter table reviewer_actions add constraint reviewer_actions_action_check
  check (action in ('APPROVE', 'REJECT', 'REQUEST_INFO', 'DEACTIVATE', 'REACTIVATE'));
