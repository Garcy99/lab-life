-- Private application tables. Only the Edge API's service role accesses them.
-- Execute through the project's SQL administration connection, never the client.
create table if not exists public.ll_boards (
  id text primary key,
  owner_id text not null unique,
  content jsonb not null,
  revision integer not null default 1 check (revision > 0),
  display_hash text,
  updated_at timestamptz not null default now()
);
create table if not exists public.ll_members (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.ll_boards(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  unique (board_id, email)
);
create index if not exists ll_members_email_board_idx on public.ll_members(email, board_id);
create table if not exists public.ll_screens (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.ll_boards(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  settings jsonb not null,
  token_hash text not null,
  enabled boolean not null default true,
  last_seen timestamptz
);
create index if not exists ll_screens_board_name_idx on public.ll_screens(board_id, name);
alter table public.ll_boards enable row level security;
alter table public.ll_members enable row level security;
alter table public.ll_screens enable row level security;
revoke all on public.ll_boards, public.ll_members, public.ll_screens from public, anon, authenticated;
grant select, insert, update, delete on public.ll_boards, public.ll_members, public.ll_screens to service_role;
-- No anon/authenticated policies: all authorization runs in the verified API.
-- The API lazily creates the private lab-life-media bucket with the Storage
-- API after an authorized image upload. Treat storage.* records as read-only.
-- Do not add public object policies for this bucket. Downloads go through API.
