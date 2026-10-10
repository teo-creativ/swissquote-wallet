-- sq-keys-mock (Swissquote mock, Théotime). Generated from CDC v3.1 annex B. Paste in Supabase SQL editor.
create table clients (client_id text primary key, sq_ref uuid unique not null default gen_random_uuid(), name text not null, password_hash text not null, kyc_status text not null, kyc_checked_at timestamptz, cash_chf numeric not null, identity_outcome text not null default 'pass' check (identity_outcome in ('pass','fail')));
create table wallet_links (client_id text not null references clients(client_id), address text unique not null, linked_at timestamptz not null default now());
create table ownership_proofs (id bigserial primary key, client_id text not null, address text not null, message text not null, signature text not null, method text not null, verified boolean not null, created_at timestamptz not null default now());
create table transfers (id bigserial primary key, client_id text not null, address text not null, amount_usdc numeric not null, tx_hash text, created_at timestamptz not null default now());
create table gas_drips (id bigserial primary key, address text not null, amount_wei numeric not null, tx_hash text, created_at timestamptz not null default now());
create table sanctioned_addresses (address text primary key, list_version text not null);
create table compliance_alerts (id bigserial primary key, account text, target text, reason text, created_at timestamptz not null default now());
create table calls (id bigserial primary key, client_id text, reason text, created_at timestamptz not null default now());
create table identity_checks (recovery_id uuid primary key, client_id text not null references clients(client_id), outcome text, identity_verified_at timestamptz, release_after timestamptz, cancelled_at timestamptz, used_at timestamptz, old_address text, created_at timestamptz not null default now());
create table shares (client_id text not null, generation int not null default 1, party_id int not null default 2, public_key text not null, address text not null, keyshare_enc bytea not null, nonce bytea not null, key_version int not null, status text not null default 'active', created_at timestamptz not null default now(), primary key (client_id, generation));
create table node_sessions (session_id uuid primary key, client_id text not null, kind text not null, state_enc bytea not null, nonce bytea not null, round int not null default 0, extra jsonb, expires_at timestamptz not null);
create table audit_log (id bigserial primary key, ts timestamptz not null default now(), action text not null, payload jsonb not null, prev_hash text not null, entry_hash text unique not null);
create table seen_nonces (nonce text primary key, seen_at timestamptz not null default now());

-- RLS on every table, NO policy: only the server (service_role) can read/write.
alter table clients enable row level security;
alter table wallet_links enable row level security;
alter table ownership_proofs enable row level security;
alter table transfers enable row level security;
alter table gas_drips enable row level security;
alter table sanctioned_addresses enable row level security;
alter table compliance_alerts enable row level security;
alter table calls enable row level security;
alter table identity_checks enable row level security;
alter table shares enable row level security;
alter table node_sessions enable row level security;
alter table audit_log enable row level security;
alter table seen_nonces enable row level security;
