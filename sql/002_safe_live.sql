-- sq-keys-app (client app), live mode with a Safe 2-of-3 smart account (not MPC). Paste AFTER 001_init.sql. Safe to run twice.
-- The private key P1 never reaches this database: it lives wrapped in the browser (IndexedDB).

-- The three Safe owners (public addresses only) and the deployment of the account.
alter table accounts add column if not exists p1_address text;
alter table accounts add column if not exists p2_address text;
alter table accounts add column if not exists p3_address text;
alter table accounts add column if not exists salt_nonce text;
alter table accounts add column if not exists deploy_tx_hash text;
alter table accounts add column if not exists deployed_at timestamptz;
alter table accounts add column if not exists lawyer_status text not null default 'none'
  check (lawyer_status in ('none','invited','accepted'));
alter table accounts add column if not exists lawyer_name text;
alter table accounts add column if not exists display_name text;
alter table accounts add column if not exists lawyer_accepted_at timestamptz;

-- The device that holds P1 (an owner address per passkey, so that recovery can swap it).
alter table devices add column if not exists owner_address text;

-- Transfers: the Safe transaction that was built, the P1 signature (a signature is not a secret) and the lawyer request.
alter table tx_requests add column if not exists safe_tx_hash text;
alter table tx_requests add column if not exists safe_nonce numeric(78,0);
alter table tx_requests add column if not exists p1_signature text;
alter table tx_requests add column if not exists lawyer_request_id text;
alter table tx_requests add column if not exists p1_signer text;
-- 'out' = sent from the wallet, 'in' = deposit from the Swissquote account.
alter table tx_requests add column if not exists direction text not null default 'out' check (direction in ('out','in'));

-- Recovery by swapOwner (same Safe address).
alter table recoveries add column if not exists new_owner_address text;
alter table recoveries add column if not exists safe_tx_hash text;
alter table recoveries add column if not exists sq_recovery_id text;
alter table recoveries add column if not exists swap_tx_hash text;
alter table recoveries add column if not exists lawyer_status text not null default 'pending'
  check (lawyer_status in ('pending','approved','refused'));

create index if not exists tx_requests_safe_tx_hash on tx_requests(safe_tx_hash);
create index if not exists recoveries_account on recoveries(account_id, created_at desc);

-- Unused in Safe mode (kept so that 001 stays valid).
comment on table mpc_sessions is 'Unused in Safe mode. MPC (DKLs23) is the documented target, not implemented.';

-- RLS stays on, no policy: only the server (service_role) reads and writes.
alter table accounts enable row level security;
alter table devices enable row level security;
alter table tx_requests enable row level security;
alter table recoveries enable row level security;
