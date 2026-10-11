-- sq-keys-lawyer (lawyer portal and P2 node), live mode with a Safe 2-of-3 smart account (not MPC). Paste AFTER 001_init.sql. Safe to run twice.
-- P2 private key: AES-256-GCM with LAWYER_SHARE_ENC_KEY, stored in shares.keyshare_enc (+ nonce, key_version). Never in clear.

-- WebAuthn: a stable user handle per lawyer so that a second registration never creates a duplicate credential.
alter table lawyers add column if not exists webauthn_user_id text unique;
alter table lawyers add column if not exists email text;
alter table lawyer_passkeys add column if not exists device_type text;
alter table lawyer_passkeys add column if not exists backed_up boolean;
alter table lawyer_passkeys add column if not exists last_used_at timestamptz;
alter table invitations add column if not exists used_at timestamptz;
alter table invitations add column if not exists pending_lawyer_id uuid references lawyers(id);
alter table webauthn_challenges add column if not exists used_at timestamptz;

-- Transfers: what the node rebuilt itself, and the P2 signature produced after approval (a signature is not a secret).
alter table approval_requests add column if not exists safe_address text;
alter table approval_requests add column if not exists to_address text;
alter table approval_requests add column if not exists amount_base numeric(78,0);
alter table approval_requests add column if not exists safe_nonce numeric(78,0);
alter table approval_requests add column if not exists safe_tx_hash text;
alter table approval_requests add column if not exists p2_signature text;
alter table approval_requests add column if not exists decision text check (decision in ('approve','refuse'));
alter table approval_requests add column if not exists assertion jsonb;
alter table decisions add column if not exists safe_tx_hash text;
alter table decisions add column if not exists p2_signature text;

-- Recovery and exit rebuild the Safe transaction on the node.
alter table recovery_cases add column if not exists safe_address text;
alter table recovery_cases add column if not exists new_owner_address text;
alter table recovery_cases add column if not exists safe_tx_hash text;
alter table recovery_cases add column if not exists p2_signature text;
alter table recovery_cases add column if not exists assertion_hash text;
alter table exit_requests add column if not exists safe_tx_hash text;
alter table exit_requests add column if not exists p2_signature text;
alter table exit_requests add column if not exists assertion_hash text;

-- Policy changes are versioned and journaled.
create table if not exists policy_versions (
  client_id uuid not null references clients(id) on delete cascade,
  version int not null,
  policy jsonb not null,
  changed_by uuid references lawyers(id),
  assertion_hash text,
  created_at timestamptz not null default now(),
  primary key (client_id, version)
);
alter table policy_versions enable row level security;

create index if not exists approval_requests_client on approval_requests(client_id, status, created_at desc);
create index if not exists audit_log_client on audit_log(client_id, id desc);

-- Atomic one-shot use of a decision (CDC 8.5): the first caller wins, a second call gets zero rows.
create or replace function consume_decision(p_decision uuid) returns boolean language plpgsql as $$
declare n int;
begin
  update decisions set status = 'USED', used_at = now()
   where id = p_decision and status = 'ACTIVE' and (valid_until is null or valid_until > now());
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function consume_decision(uuid) from public, anon, authenticated;

alter table shares enable row level security;
alter table lawyers enable row level security;
alter table lawyer_passkeys enable row level security;
alter table invitations enable row level security;
alter table webauthn_challenges enable row level security;
alter table approval_requests enable row level security;
alter table decisions enable row level security;
alter table recovery_cases enable row level security;
alter table exit_requests enable row level security;
