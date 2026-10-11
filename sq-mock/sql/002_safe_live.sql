-- sq-keys-mock (Swissquote mock, P3 node, sponsor), live mode with a Safe 2-of-3 smart account (not MPC). Paste AFTER 001_init.sql. Safe to run twice.
-- P3 private key: AES-256-GCM with SQ_SHARE_ENC_KEY, stored in shares.keyshare_enc (+ nonce, key_version). Never in clear.
-- Simulated here (pill in every UI): Swissquote login, identity check, bank account. Real: everything below.

-- The Safe of each client, as known by Swissquote (public data).
create table if not exists safe_accounts (
  sq_ref text primary key,
  safe_address text unique,
  p1_address text,
  p2_address text,
  p3_address text,
  salt_nonce text,
  deploy_tx_hash text,
  created_at timestamptz not null default now()
);

-- Sponsored gas: every deployment and execution is recorded, caps are counted from here.
create table if not exists sponsor_actions (
  id bigserial primary key,
  kind text not null check (kind in ('deploy','exec')),
  sq_ref text,
  safe_address text,
  tx_hash text,
  created_at timestamptz not null default now()
);
create index if not exists sponsor_actions_day on sponsor_actions(kind, created_at desc);
create index if not exists sponsor_actions_safe on sponsor_actions(safe_address, kind, created_at desc);

-- Recovery: what is being swapped, who approved. identity_checks (001) keeps the identity result and the delay.
alter table identity_checks add column if not exists safe_address text;
alter table identity_checks add column if not exists new_owner_address text;
alter table identity_checks add column if not exists safe_tx_hash text;
alter table identity_checks add column if not exists p3_signed_at timestamptz;
alter table identity_checks add column if not exists executed_tx_hash text;

-- What the operator did in the console (identity outcome, ...). The "next check: fail" switch really changes stored state.
create table if not exists operator_actions (
  id bigserial primary key,
  action text not null,
  client_id text,
  recovery_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Bank transfers made from the demo wallet: the real USDC transaction.
alter table transfers add column if not exists sq_ref text;

alter table safe_accounts enable row level security;
alter table sponsor_actions enable row level security;
alter table operator_actions enable row level security;
alter table identity_checks enable row level security;
alter table transfers enable row level security;
