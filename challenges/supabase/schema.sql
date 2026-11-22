-- ============================================================================
--  چالش گروهی کاهش وزن — اسکیمای افزودنی
--  این فایل روی اسکیمای موجود پروژه ساخته می‌شود و هیچ جدول یا داده‌ای را
--  حذف یا بازنویسی نمی‌کند.
--
--  داده‌ی موجود که چالش از آن استفاده می‌کند:
--    profiles        → نام نمایشی، قد، سن، جنسیت، مدیر بودن، نمایش عمومی BMI
--    user_weights    → همه‌ی وزن‌های ثبت‌شده (وزن فعلی، وزن شروع، تاریخچه)
--    daily_logs      → وضعیت معده‌ی هر ثبت وزن (item_type = 'weight_stomach')
--    app_settings    → سهم اشتراک دوره (کلید challenge_fee)
--
--  جدول‌های جدید فقط دفتر خود چالش‌اند: تعهد، پرداخت و تسویه.
--  یک بار در Supabase → SQL Editor اجرا کنید.
-- ============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ pledges
create table if not exists public.challenge_pledges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  round_key text not null,
  start_weight numeric(5, 1) not null check (start_weight between 25 and 350),
  promised_weight numeric(5, 1) not null check (promised_weight between 25 and 350),
  promise_kg numeric(5, 1) not null,
  created_at timestamptz not null default now(),
  constraint challenge_pledges_unique unique (user_id, round_key)
);

-- ----------------------------------------------------------------- payments
create table if not exists public.challenge_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  round_key text not null,
  amount integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded')),
  method text,
  ref text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint challenge_payments_unique unique (user_id, round_key)
);

-- -------------------------------------------------------------- settlements
create table if not exists public.challenge_settlements (
  id uuid primary key default gen_random_uuid(),
  round_key text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  final_weight numeric(5, 1),
  promised_weight numeric(5, 1),
  chance int not null default 1 check (chance >= 0),
  compliant boolean not null default false,
  won boolean not null default false,
  created_at timestamptz not null default now(),
  constraint challenge_settlements_unique unique (round_key, user_id)
);

create index if not exists challenge_pledges_round_idx on public.challenge_pledges (round_key);
create index if not exists challenge_payments_round_idx on public.challenge_payments (round_key);
create index if not exists challenge_settlements_round_idx on public.challenge_settlements (round_key);

-- سهم اشتراک پیش‌فرض؛ اگر قبلاً مقدار دیگری گذاشته‌اید تغییر نمی‌کند
insert into public.app_settings (key, value)
values ('challenge_fee', 250000)
on conflict (key) do nothing;

-- ------------------------------------------------------- helper: is admin?
create or replace function public.challenge_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin
  );
$$;

-- ============================================================================
--  دسترسی‌ها (RLS) — فقط سیاست‌های جدید اضافه می‌شوند
-- ============================================================================

alter table public.challenge_pledges enable row level security;
alter table public.challenge_payments enable row level security;
alter table public.challenge_settlements enable row level security;

grant select on public.challenge_pledges, public.challenge_payments, public.challenge_settlements
  to anon, authenticated;
grant insert, update, delete on public.challenge_pledges, public.challenge_payments
  to authenticated;
grant insert, update, delete on public.challenge_settlements to authenticated;

-- pledges --------------------------------------------------------------------
drop policy if exists challenge_pledges_read on public.challenge_pledges;
create policy challenge_pledges_read on public.challenge_pledges
  for select to anon, authenticated using (true);

drop policy if exists challenge_pledges_insert on public.challenge_pledges;
create policy challenge_pledges_insert on public.challenge_pledges
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists challenge_pledges_update on public.challenge_pledges;
create policy challenge_pledges_update on public.challenge_pledges
  for update to authenticated
  using (auth.uid() = user_id or public.challenge_is_admin())
  with check (auth.uid() = user_id or public.challenge_is_admin());

drop policy if exists challenge_pledges_delete on public.challenge_pledges;
create policy challenge_pledges_delete on public.challenge_pledges
  for delete to authenticated using (auth.uid() = user_id or public.challenge_is_admin());

-- payments -------------------------------------------------------------------
drop policy if exists challenge_payments_read on public.challenge_payments;
create policy challenge_payments_read on public.challenge_payments
  for select to anon, authenticated using (true);

drop policy if exists challenge_payments_insert on public.challenge_payments;
create policy challenge_payments_insert on public.challenge_payments
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists challenge_payments_update on public.challenge_payments;
create policy challenge_payments_update on public.challenge_payments
  for update to authenticated
  using (auth.uid() = user_id or public.challenge_is_admin())
  with check (auth.uid() = user_id or public.challenge_is_admin());

drop policy if exists challenge_payments_delete on public.challenge_payments;
create policy challenge_payments_delete on public.challenge_payments
  for delete to authenticated using (public.challenge_is_admin());

-- settlements -----------------------------------------------------------------
drop policy if exists challenge_settlements_read on public.challenge_settlements;
create policy challenge_settlements_read on public.challenge_settlements
  for select to anon, authenticated using (true);

drop policy if exists challenge_settlements_write on public.challenge_settlements;
create policy challenge_settlements_write on public.challenge_settlements
  for insert to authenticated with check (public.challenge_is_admin());

drop policy if exists challenge_settlements_update on public.challenge_settlements;
create policy challenge_settlements_update on public.challenge_settlements
  for update to authenticated
  using (public.challenge_is_admin()) with check (public.challenge_is_admin());

-- ============================================================================
--  جدول‌های موجود: خواندن لازم برای جدول چالش
--  (سیاست‌های قبلی دست‌نخورده می‌مانند؛ سیاست‌های RLS با OR ترکیب می‌شوند.)
-- ============================================================================

grant select on public.profiles, public.user_weights, public.daily_logs, public.app_settings
  to anon, authenticated;
grant insert, update, delete on public.user_weights, public.daily_logs to authenticated;

-- profiles: نام، قد، سن و جنسیت همه برای جدول لازم است
drop policy if exists challenge_profiles_read on public.profiles;
create policy challenge_profiles_read on public.profiles
  for select to authenticated using (true);

-- user_weights: وزن شروع/فعلی همه‌ی شرکت‌کننده‌ها
drop policy if exists challenge_weights_read on public.user_weights;
create policy challenge_weights_read on public.user_weights
  for select to authenticated using (true);

drop policy if exists challenge_weights_write on public.user_weights;
create policy challenge_weights_write on public.user_weights
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists challenge_weights_update on public.user_weights;
create policy challenge_weights_update on public.user_weights
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists challenge_weights_delete on public.user_weights;
create policy challenge_weights_delete on public.user_weights
  for delete to authenticated using (auth.uid() = user_id);

-- daily_logs: فقط وضعیت معده‌ی ثبت‌های خود کاربر
drop policy if exists challenge_logs_own on public.daily_logs;
create policy challenge_logs_own on public.daily_logs
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- app_settings: خواندن سهم اشتراک برای همه، نوشتن فقط مدیر
drop policy if exists challenge_settings_read on public.app_settings;
create policy challenge_settings_read on public.app_settings
  for select to authenticated using (true);

drop policy if exists challenge_settings_write on public.app_settings;
create policy challenge_settings_write on public.app_settings
  for all to authenticated
  using (public.challenge_is_admin()) with check (public.challenge_is_admin());

-- ============================================================================
--  نکته‌ها:
--   • مدیر دوره کسی است که در profiles ستون is_admin = true داشته باشد:
--       update public.profiles set is_admin = true
--        where id = (select id from auth.users order by created_at asc limit 1);
--   • سهم اشتراک هر دوره از app_settings خوانده می‌شود:
--       update public.app_settings set value = 300000 where key = 'challenge_fee';
--   • اگر می‌خواهید ثبت‌نام بدون تأیید ایمیل باشد:
--       Authentication → Providers → Email → Confirm email = off
-- ============================================================================
