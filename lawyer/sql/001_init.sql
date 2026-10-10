-- sq-keys-lawyer (lawyer portal, Téo creates the project). Generated from CDC v3.1 annex B. Paste in Supabase SQL editor.
create table lawyers (id uuid primary key default gen_random_uuid(), display_name text not null, firm text, created_at timestamptz not null default now());
create table lawyer_passkeys (
  id uuid primary key default gen_random_uuid(),
  lawyer_id uuid not null references lawyers(id) on delete cascade,
  credential_id text unique not null,
  public_key text not null,
  counter bigint not null default 0,
  transports text[],
  created_at timestamptz not null default now()
);
create table clients (
  id uuid primary key default gen_random_uuid(),
  sq_ref text unique not null,
  lawyer_id uuid references lawyers(id),
  display_name text not null,
  status text not null check (status in ('invited','accepted','active','revoked')),
  wallet_address text unique,
  created_at timestamptz not null default now()
);
create table invitations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  accepted_at timestamptz
);
create table webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  purpose text not null, subject text, challenge text not null,
  expires_at timestamptz not null
);
create table policies (
  client_id uuid primary key references clients(id) on delete cascade,
  version int not null default 1,
  per_tx_cap_base numeric(78,0) not null default 5000000,
  daily_cap_base numeric(78,0) not null default 10000000,
  hourly_count int not null default 3,
  daily_count int not null default 6,
  new_recipient_requires_lawyer boolean not null default true,
  max_pending_approvals int not null default 5,
  auto_decision_ttl_seconds int not null default 120,
  lawyer_decision_ttl_seconds int not null default 1800,
  request_ttl_seconds int not null default 172800,
  updated_at timestamptz not null default now()
);
create table recipients (
  client_id uuid not null references clients(id) on delete cascade,
  address text not null,
  status text not null check (status in ('approved','revoked')),
  approved_at timestamptz not null default now(),
  primary key (client_id, address)
);
create table approved_apps (address text primary key, name text not null);
create table sanctioned_addresses (address text primary key, list_version text not null);
create table policy_state (client_id uuid primary key references clients(id) on delete cascade, state_version int not null default 0);
create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  kind text not null check (kind in ('transfer','approve','recovery','exit')),
  external_ref text not null,
  intent jsonb not null,
  intent_hash text not null,
  reasons jsonb not null default '[]',
  status text not null default 'pending' check (status in ('pending','approved','refused','expired','cancelled')),
  expires_at timestamptz not null,
  decided_at timestamptz,
  decided_by uuid references lawyers(id),
  assertion_hash text,
  created_at timestamptz not null default now()
);
create table decisions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  request_ref text not null,
  approval_request_id uuid references approval_requests(id),
  intent_hash text not null,
  outcome text not null check (outcome in ('AUTO','LAWYER','LAWYER_APPROVED','REFUSED')),
  status text not null check (status in ('PENDING','ACTIVE','USED','EXPIRED','CANCELLED','REFUSED')),
  amount_base numeric(78,0),
  policy_version int not null,
  reasons jsonb not null default '[]',
  valid_until timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create table share_uses (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid unique not null references decisions(id),
  session_id uuid not null,
  digest text not null,
  used_at timestamptz not null default now()
);
create table shares (
  client_id uuid not null references clients(id) on delete cascade,
  generation int not null default 1,
  party_id int not null,
  public_key text not null,
  address text not null,
  keyshare_enc bytea not null, nonce bytea not null, key_version int not null,
  status text not null default 'active' check (status in ('pending','active','obsolete')),
  created_at timestamptz not null default now(),
  primary key (client_id, generation)
);
create table node_sessions (
  session_id uuid primary key, client_id uuid not null,
  kind text not null check (kind in ('dkg','sign')),
  state_enc bytea not null, nonce bytea not null,
  round int not null default 0, extra jsonb,
  expires_at timestamptz not null
);
create table recovery_cases (
  recovery_id uuid primary key, client_id uuid not null references clients(id),
  old_address text not null, new_address text,
  status text not null, release_after timestamptz, lawyer_decision text,
  created_at timestamptz not null default now()
);
create table exit_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  to_address text not null, token_hash text not null,
  status text not null default 'pending', release_after timestamptz,
  used_at timestamptz, created_at timestamptz not null default now()
);
create table audit_log (
  id bigserial primary key,
  ts timestamptz not null default now(),
  actor text not null, action text not null, client_id uuid,
  payload jsonb not null,
  prev_hash text not null, entry_hash text not null unique
);
create table seen_nonces (nonce text primary key, seen_at timestamptz not null default now());

-- RLS on every table, NO policy: only the server (service_role) can read/write.
alter table lawyers enable row level security;
alter table lawyer_passkeys enable row level security;
alter table clients enable row level security;
alter table invitations enable row level security;
alter table webauthn_challenges enable row level security;
alter table policies enable row level security;
alter table recipients enable row level security;
alter table approved_apps enable row level security;
alter table sanctioned_addresses enable row level security;
alter table policy_state enable row level security;
alter table approval_requests enable row level security;
alter table decisions enable row level security;
alter table share_uses enable row level security;
alter table shares enable row level security;
alter table node_sessions enable row level security;
alter table recovery_cases enable row level security;
alter table exit_requests enable row level security;
alter table audit_log enable row level security;
alter table seen_nonces enable row level security;

-- TODO (Aaron): functions commit_decision(...) and consume_decision(...) described in CDC 8.5 / B.2 (not written yet).
