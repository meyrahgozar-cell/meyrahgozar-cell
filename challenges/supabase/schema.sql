-- ============================================================================
--  ترازو (Tarazoo) — چالش گروهی کاهش وزن
--  این فایل را یک بار در Supabase → SQL Editor اجرا کنید.
--  همه‌ی جدول‌ها با پیشوند weight_ ساخته می‌شوند.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table if not exists public.weight_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  gender text check (gender in ('female', 'male')),
  height_cm numeric(5, 1),
  birth_year int,
  activity_level text default 'light',
  target_bmi numeric(4, 1),
  city text,
  role text not null default 'member' check (role in ('member', 'admin')),
  avatar_tone text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ rounds
create table if not exists public.weight_rounds (
  id uuid primary key default gen_random_uuid(),
  round_key text not null unique,
  title text not null,
  starts_on date not null,
  ends_on date not null,
  fee integer not null default 250000,
  status text not null default 'running' check (status in ('open', 'running', 'settled')),
  prize_pool integer not null default 0,
  seed bigint not null default 1,
  winner_user_id uuid references auth.users (id) on delete set null,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- pledges
create table if not exists public.weight_pledges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  round_id uuid not null references public.weight_rounds (id) on delete cascade,
  start_weight numeric(5, 1) not null check (start_weight between 25 and 350),
  promised_weight numeric(5, 1) not null check (promised_weight between 25 and 350),
  target_bmi numeric(4, 1),
  promise_kg numeric(5, 1) not null,
  created_at timestamptz not null default now(),
  constraint weight_pledges_unique unique (user_id, round_id)
);

-- ----------------------------------------------------------------- entries
create table if not exists public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  round_id uuid not null references public.weight_rounds (id) on delete cascade,
  entry_date date not null,
  shamsi_date text,
  weight numeric(5, 1) not null check (weight between 25 and 350),
  measure_hour int check (measure_hour between 0 and 23),
  stomach text check (stomach in ('empty', 'light', 'full')),
  note text default '',
  created_at timestamptz not null default now(),
  constraint weight_entries_daily_unique unique (user_id, entry_date)
);

-- ---------------------------------------------------------------- payments
create table if not exists public.weight_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  round_id uuid not null references public.weight_rounds (id) on delete cascade,
  amount integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded')),
  method text,
  ref text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint weight_payments_unique unique (user_id, round_id)
);

-- ------------------------------------------------------------- settlements
create table if not exists public.weight_settlements (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.weight_rounds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  final_weight numeric(5, 1),
  promised_weight numeric(5, 1),
  chance int not null default 1 check (chance >= 0),
  compliant boolean not null default false,
  won boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- notes
create table if not exists public.weight_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  round_id uuid references public.weight_rounds (id) on delete cascade,
  kind text,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- indexes
create index if not exists weight_entries_user_idx on public.weight_entries (user_id, entry_date desc);
create index if not exists weight_entries_round_idx on public.weight_entries (round_id);
create index if not exists weight_pledges_round_idx on public.weight_pledges (round_id);
create index if not exists weight_payments_round_idx on public.weight_payments (round_id);
create index if not exists weight_settlements_round_idx on public.weight_settlements (round_id);

-- ------------------------------------------------------- helper: is admin?
create or replace function public.weight_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.weight_profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ---------------------------------------------------- auto-create profile
create or replace function public.weight_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.weight_profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists weight_on_auth_user_created on auth.users;
create trigger weight_on_auth_user_created
  after insert on auth.users
  for each row execute function public.weight_handle_new_user();

-- ============================================================================
--  دسترسی‌ها (RLS)
-- ============================================================================
alter table public.weight_profiles enable row level security;
alter table public.weight_rounds enable row level security;
alter table public.weight_pledges enable row level security;
alter table public.weight_entries enable row level security;
alter table public.weight_payments enable row level security;
alter table public.weight_settlements enable row level security;
alter table public.weight_notes enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.weight_profiles, public.weight_rounds, public.weight_pledges,
  public.weight_entries, public.weight_payments, public.weight_settlements to anon, authenticated;
grant insert, update, delete on public.weight_profiles, public.weight_rounds, public.weight_pledges,
  public.weight_entries, public.weight_payments, public.weight_settlements, public.weight_notes
  to authenticated;
grant select, insert, update, delete on public.weight_notes to authenticated;

-- profiles -------------------------------------------------------------------
drop policy if exists weight_profiles_read on public.weight_profiles;
create policy weight_profiles_read on public.weight_profiles
  for select to anon, authenticated using (true);

drop policy if exists weight_profiles_insert on public.weight_profiles;
create policy weight_profiles_insert on public.weight_profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists weight_profiles_update on public.weight_profiles;
create policy weight_profiles_update on public.weight_profiles
  for update to authenticated
  using (auth.uid() = id or public.weight_is_admin())
  with check (auth.uid() = id or public.weight_is_admin());

drop policy if exists weight_profiles_delete on public.weight_profiles;
create policy weight_profiles_delete on public.weight_profiles
  for delete to authenticated using (auth.uid() = id or public.weight_is_admin());

-- rounds ---------------------------------------------------------------------
drop policy if exists weight_rounds_read on public.weight_rounds;
create policy weight_rounds_read on public.weight_rounds
  for select to anon, authenticated using (true);

drop policy if exists weight_rounds_insert on public.weight_rounds;
create policy weight_rounds_insert on public.weight_rounds
  for insert to authenticated with check (true);

drop policy if exists weight_rounds_update on public.weight_rounds;
create policy weight_rounds_update on public.weight_rounds
  for update to authenticated using (public.weight_is_admin()) with check (public.weight_is_admin());

-- pledges --------------------------------------------------------------------
drop policy if exists weight_pledges_read on public.weight_pledges;
create policy weight_pledges_read on public.weight_pledges
  for select to anon, authenticated using (true);

drop policy if exists weight_pledges_insert on public.weight_pledges;
create policy weight_pledges_insert on public.weight_pledges
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists weight_pledges_update on public.weight_pledges;
create policy weight_pledges_update on public.weight_pledges
  for update to authenticated
  using (auth.uid() = user_id or public.weight_is_admin())
  with check (auth.uid() = user_id or public.weight_is_admin());

drop policy if exists weight_pledges_delete on public.weight_pledges;
create policy weight_pledges_delete on public.weight_pledges
  for delete to authenticated using (auth.uid() = user_id or public.weight_is_admin());

-- entries --------------------------------------------------------------------
drop policy if exists weight_entries_read on public.weight_entries;
create policy weight_entries_read on public.weight_entries
  for select to anon, authenticated using (true);

drop policy if exists weight_entries_insert on public.weight_entries;
create policy weight_entries_insert on public.weight_entries
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists weight_entries_update on public.weight_entries;
create policy weight_entries_update on public.weight_entries
  for update to authenticated
  using (auth.uid() = user_id or public.weight_is_admin())
  with check (auth.uid() = user_id or public.weight_is_admin());

drop policy if exists weight_entries_delete on public.weight_entries;
create policy weight_entries_delete on public.weight_entries
  for delete to authenticated using (auth.uid() = user_id or public.weight_is_admin());

-- payments -------------------------------------------------------------------
drop policy if exists weight_payments_read on public.weight_payments;
create policy weight_payments_read on public.weight_payments
  for select to anon, authenticated using (true);

drop policy if exists weight_payments_insert on public.weight_payments;
create policy weight_payments_insert on public.weight_payments
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists weight_payments_update on public.weight_payments;
create policy weight_payments_update on public.weight_payments
  for update to authenticated
  using (auth.uid() = user_id or public.weight_is_admin())
  with check (auth.uid() = user_id or public.weight_is_admin());

drop policy if exists weight_payments_delete on public.weight_payments;
create policy weight_payments_delete on public.weight_payments
  for delete to authenticated using (public.weight_is_admin());

-- settlements ----------------------------------------------------------------
drop policy if exists weight_settlements_read on public.weight_settlements;
create policy weight_settlements_read on public.weight_settlements
  for select to anon, authenticated using (true);

drop policy if exists weight_settlements_write on public.weight_settlements;
create policy weight_settlements_write on public.weight_settlements
  for insert to authenticated with check (public.weight_is_admin());

drop policy if exists weight_settlements_update on public.weight_settlements;
create policy weight_settlements_update on public.weight_settlements
  for update to authenticated using (public.weight_is_admin()) with check (public.weight_is_admin());

-- notes ----------------------------------------------------------------------
drop policy if exists weight_notes_rw on public.weight_notes;
create policy weight_notes_rw on public.weight_notes
  for all to authenticated
  using (auth.uid() = user_id or public.weight_is_admin())
  with check (auth.uid() = user_id or public.weight_is_admin());

-- ============================================================================
--  بعد از ثبت‌نام اولین کاربر، او را مدیر دوره کنید:
--
--  update public.weight_profiles
--     set role = 'admin'
--   where id = (select id from auth.users order by created_at asc limit 1);
--
--  اگر می‌خواهید ثبت‌نام بدون تأیید ایمیل باشد:
--  Authentication → Providers → Email → "Confirm email" را خاموش کنید.
-- ============================================================================
