-- sq-keys-app (client app, Aaron). Generated from CDC v3.1 annex B. Paste in Supabase SQL editor.
create table accounts (
  id uuid primary key default gen_random_uuid(),
  sq_ref text unique not null,
  status text not null check (status in ('created','awaiting_lawyer','ready_for_keys','creating_wallet','active','recovering')),
  wallet_address text unique,
  public_key text,
  exit_kit_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table consents (
  id bigserial primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  document text not null check (document in ('terms','risk','recovery','privacy')),
  version text not null,
  accepted_at timestamptz not null default now()
);
create table devices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  credential_id text unique not null,
  label text not null,
  prf_supported boolean not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create table invitations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  token_hash text unique not null,
  status text not null default 'pending' check (status in ('pending','accepted','expired','revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table mpc_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  kind text not null check (kind in ('dkg','recovery_dkg','sign','recovery_sweep')),
  request_ref uuid,
  status text not null default 'open' check (status in ('open','done','failed','expired')),
  round int not null default 0,
  signers int[],
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table tx_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  kind text not null check (kind in ('usdc_transfer','usdc_approve','ownership_proof')),
  to_address text,
  amount_base numeric(78,0),
  status text not null,
  outcome text check (outcome in ('AUTO','LAWYER','REFUSED')),
  reasons jsonb not null default '[]',
  intent_hash text,
  unsigned_tx jsonb,
  tx_hash text,
  valid_until timestamptz,
  approval_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table recoveries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  status text not null check (status in ('identity_pending','identity_verified','awaiting_approval_and_delay','executing','completed','cancelled','failed')),
  old_address text not null,
  new_address text,
  new_credential_id text,
  identity_verified_at timestamptz,
  release_after timestamptz,
  cancelled_by text check (cancelled_by in ('client','lawyer','system')),
  sweep_tx_hash text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table alerts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create table seen_nonces (nonce text primary key, seen_at timestamptz not null default now());
create index on tx_requests(account_id, created_at desc);

-- RLS on every table, NO policy: only the server (service_role) can read/write.
alter table accounts enable row level security;
alter table consents enable row level security;
alter table devices enable row level security;
alter table invitations enable row level security;
alter table mpc_sessions enable row level security;
alter table tx_requests enable row level security;
alter table recoveries enable row level security;
alter table alerts enable row level security;
alter table seen_nonces enable row level security;
