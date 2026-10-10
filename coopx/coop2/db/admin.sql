-- =====================================================================
--  coop2 · roles, sessions, admin API
--  Run once in the Supabase SQL editor (safe to re-run).
--  All browser access goes through the functions below; tables are
--  locked (RLS on, no policies, no direct grants).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

-- ---------------------------------------------------------------- members
alter table public.members add column if not exists password_hash text;
alter table public.members add column if not exists last_login_at timestamptz;

alter table public.members drop constraint if exists members_role_check;
alter table public.members add  constraint members_role_check check (role in ('member', 'admin', 'superadmin'));
alter table public.members drop constraint if exists members_national_id_check;
alter table public.members add  constraint members_national_id_check check (national_id ~ '^[0-9]{10}$');

-- exactly one superadmin at most
create unique index if not exists members_single_superadmin on public.members ((true)) where role = 'superadmin';

alter table public.payments    drop constraint if exists payments_member_id_fkey;
alter table public.payments    add  constraint payments_member_id_fkey    foreign key (member_id) references public.members(id) on delete cascade;
alter table public.obligations drop constraint if exists obligations_member_id_fkey;
alter table public.obligations add  constraint obligations_member_id_fkey foreign key (member_id) references public.members(id) on delete cascade;
alter table public.suggestions drop constraint if exists suggestions_member_id_fkey;
alter table public.suggestions add  constraint suggestions_member_id_fkey foreign key (member_id) references public.members(id) on delete set null;
alter table public.audit_log   drop constraint if exists audit_log_actor_id_fkey;
alter table public.audit_log   add  constraint audit_log_actor_id_fkey    foreign key (actor_id)  references public.members(id) on delete set null;

create index if not exists payments_member_idx     on public.payments (member_id);
create index if not exists obligations_member_idx  on public.obligations (member_id);
create index if not exists suggestions_member_idx  on public.suggestions (member_id);
create index if not exists audit_log_created_idx   on public.audit_log (created_at desc);

-- ---------------------------------------------------------------- sessions
create table if not exists public.app_sessions (
  id           bigint generated always as identity primary key,
  member_id    bigint not null references public.members(id) on delete cascade,
  token_hash   text   not null unique,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index if not exists app_sessions_member_idx on public.app_sessions (member_id);

create table if not exists public.app_login_attempts (
  id           bigint generated always as identity primary key,
  national_id  text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists app_login_attempts_idx on public.app_login_attempts (national_id, attempted_at desc);

-- ---------------------------------------------------------------- helpers (private schema, not exposed)
create or replace function private.digits(p text) returns text language sql immutable as $f$
  select regexp_replace(translate(coalesce(p, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^0-9]', '', 'g')
$f$;

create or replace function private.token_hash(p text) returns text language sql immutable as $f$
  select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex')
$f$;

create or replace function private.touch_updated_at() returns trigger language plpgsql as $f$
begin new.updated_at := now(); return new; end
$f$;
drop trigger if exists import_configs_touch on public.import_configs;
create trigger import_configs_touch before update on public.import_configs
  for each row execute function private.touch_updated_at();

-- members: normalise id, hash password, enforce who may touch whom
create or replace function private.members_guard() returns trigger
language plpgsql security definer set search_path = public, extensions as $f$
declare
  actor_role text   := nullif(current_setting('app.role', true), '');
  actor_id   bigint := nullif(current_setting('app.actor_id', true), '')::bigint;
  transfer   boolean := coalesce(current_setting('app.transfer', true), '') = '1';
begin
  if tg_op in ('INSERT', 'UPDATE') then
    new.national_id := private.digits(new.national_id);
    if new.password_initial is not null and
       (tg_op = 'INSERT' or new.password_initial is distinct from old.password_initial or new.password_hash is null) then
      new.password_hash := crypt(new.password_initial, gen_salt('bf', 10));
    end if;
  end if;

  if actor_role is not null and not transfer then          -- called through the API (not the SQL editor)
    if tg_op = 'INSERT' then
      if new.role = 'superadmin' then raise sqlstate 'PT403' using message = 'use_transfer'; end if;
      if new.role <> 'member' and actor_role <> 'superadmin' then raise sqlstate 'PT403' using message = 'forbidden_role'; end if;
    elsif tg_op = 'UPDATE' then
      if new.role is distinct from old.role then
        if actor_role <> 'superadmin' then raise sqlstate 'PT403' using message = 'forbidden_role'; end if;
        if old.role = 'superadmin' or new.role = 'superadmin' then raise sqlstate 'PT403' using message = 'use_transfer'; end if;
      end if;
      if actor_role = 'admin' and old.role <> 'member' and old.id is distinct from actor_id then
        raise sqlstate 'PT403' using message = 'forbidden_target';
      end if;
    else
      if old.role = 'superadmin' or old.id is not distinct from actor_id then raise sqlstate 'PT403' using message = 'protected_member'; end if;
      if actor_role = 'admin' and old.role <> 'member' then raise sqlstate 'PT403' using message = 'forbidden_target'; end if;
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$f$;
drop trigger if exists members_guard_trg on public.members;
create trigger members_guard_trg before insert or update or delete on public.members
  for each row execute function private.members_guard();

-- session -> member (raises 401), also pins the actor for triggers
create or replace function private.actor(p_token text) returns public.members
language plpgsql security definer set search_path = public, extensions as $f$
declare s public.app_sessions; m public.members;
begin
  select * into s from public.app_sessions where token_hash = private.token_hash(p_token) and expires_at > now();
  if not found then raise sqlstate 'PT401' using message = 'unauthorized'; end if;
  select * into m from public.members where id = s.member_id;
  if not found then raise sqlstate 'PT401' using message = 'unauthorized'; end if;
  if s.last_seen_at < now() - interval '1 minute' then
    update public.app_sessions set last_seen_at = now() where id = s.id;
  end if;
  perform set_config('app.actor_id', m.id::text, true);
  perform set_config('app.role', m.role, true);
  perform set_config('app.session_id', s.id::text, true);
  return m;
end
$f$;

create or replace function private.require_admin(p_token text) returns public.members
language plpgsql security definer set search_path = public, extensions as $f$
declare m public.members := private.actor(p_token);
begin
  if m.role not in ('admin', 'superadmin') then raise sqlstate 'PT403' using message = 'forbidden'; end if;
  return m;
end
$f$;

create or replace function private.require_super(p_token text) returns public.members
language plpgsql security definer set search_path = public, extensions as $f$
declare m public.members := private.actor(p_token);
begin
  if m.role <> 'superadmin' then raise sqlstate 'PT403' using message = 'forbidden'; end if;
  return m;
end
$f$;

create or replace function private.audit(a public.members, p_action text, p_table text, p_details jsonb default null)
returns void language sql security definer set search_path = public as $f$
  insert into public.audit_log (actor_id, actor_name, action, target_table, details)
  values (a.id, btrim(a.first_name || ' ' || a.last_name), p_action, p_table, p_details)
$f$;

create or replace function private.mask(j jsonb) returns jsonb language sql immutable as $f$
  select coalesce(jsonb_object_agg(e.k, case when e.k like 'password%' then to_jsonb('***'::text) else e.v end), '{}'::jsonb)
    from jsonb_each(j) as e(k, v)
$f$;

create or replace function private.public_member(m public.members) returns jsonb language sql immutable as $f$
  select jsonb_build_object(
    'id', m.id, 'first_name', m.first_name, 'last_name', m.last_name, 'national_id', m.national_id,
    'mobile', m.mobile, 'email', m.email, 'parent_company', m.parent_company,
    'membership_status', m.membership_status, 'cooperative', m.cooperative,
    'total_paid', m.total_paid, 'debt', m.debt, 'score', m.score, 'role', m.role, 'created_at', m.created_at)
$f$;

-- which tables the generic API may touch, and how
create or replace function private.table_cfg(p_table text, a public.members, p_write boolean default false) returns jsonb
language plpgsql immutable as $f$
declare cfg jsonb;
begin
  cfg := case p_table
    when 'members'        then '{"hidden":["password_hash"],"write":true}'::jsonb
    when 'payments'       then '{"hidden":[],"write":true}'::jsonb
    when 'obligations'    then '{"hidden":[],"write":true}'::jsonb
    when 'suggestions'    then '{"hidden":[],"write":true}'::jsonb
    when 'import_configs' then '{"hidden":[],"write":true}'::jsonb
    when 'audit_log'      then '{"hidden":[],"write":false,"super":true}'::jsonb
    else null end;
  if cfg is null then raise sqlstate 'PT404' using message = 'unknown_table'; end if;
  if coalesce((cfg->>'super')::boolean, false) and a.role <> 'superadmin' then raise sqlstate 'PT403' using message = 'forbidden_table'; end if;
  if p_write and not (cfg->>'write')::boolean then raise sqlstate 'PT403' using message = 'read_only_table'; end if;
  return cfg;
end
$f$;

create or replace function private.table_columns(p_table text, p_hidden text[] default '{}') returns jsonb
language sql stable security definer set search_path = public, pg_catalog as $f$
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', a.attname,
      'type', format_type(a.atttypid, a.atttypmod),
      'base', t.typname,
      'nullable', not a.attnotnull,
      'default', pg_get_expr(d.adbin, d.adrelid),
      'identity', case a.attidentity when 'a' then 'always' when 'd' then 'default' else null end,
      'pk', exists (select 1 from pg_constraint c where c.conrelid = a.attrelid and c.contype = 'p' and a.attnum = any (c.conkey)),
      'unique', exists (select 1 from pg_constraint c where c.conrelid = a.attrelid and c.contype in ('u', 'p') and c.conkey = array[a.attnum])
                or exists (select 1 from pg_index i where i.indrelid = a.attrelid and i.indisunique and i.indpred is null and i.indkey::int2[] = array[a.attnum]),
      'fk', (select jsonb_build_object('table', fc.relname, 'column', fa.attname)
               from pg_constraint c
               join pg_class fc on fc.oid = c.confrelid
               join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
              where c.conrelid = a.attrelid and c.contype = 'f' and c.conkey = array[a.attnum] limit 1)
    ) order by a.attnum), '[]'::jsonb)
  from pg_attribute a
  join pg_class cl on cl.oid = a.attrelid
  join pg_namespace n on n.oid = cl.relnamespace
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname = 'public' and cl.relname = p_table
    and a.attnum > 0 and not a.attisdropped and a.attname <> all (p_hidden)
$f$;

create or replace function private.col_type(p_table text, p_col text) returns text
language sql stable security definer set search_path = public, pg_catalog as $f$
  select format_type(a.atttypid, a.atttypmod)
    from pg_attribute a
   where a.attrelid = format('public.%I', p_table)::regclass and a.attname = p_col and a.attnum > 0 and not a.attisdropped
$f$;

-- row writers shared by single edits and batch apply
create or replace function private.do_insert(a public.members, p_table text, p_row jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare
  cfg jsonb := private.table_cfg(p_table, a, true);
  hidden text[] := array(select jsonb_array_elements_text(cfg->'hidden'));
  meta jsonb := private.table_columns(p_table, hidden);
  k text; cols text[] := '{}'; res jsonb;
begin
  if jsonb_typeof(p_row) is distinct from 'object' then raise sqlstate 'PT400' using message = 'bad_row'; end if;
  for k in select jsonb_object_keys(p_row) loop
    if not exists (select 1 from jsonb_array_elements(meta) c where c->>'name' = k) then
      raise sqlstate 'PT400' using message = 'unknown_column: ' || k;
    end if;
    if exists (select 1 from jsonb_array_elements(meta) c where c->>'name' = k and c->>'identity' = 'always') then
      raise sqlstate 'PT400' using message = 'identity_column: ' || k;
    end if;
    cols := cols || k;
  end loop;
  if cardinality(cols) = 0 then
    execute format('insert into public.%I as t default values returning to_jsonb(t) - %L::text[]', p_table, hidden) into res;
  else
    execute format('insert into public.%1$I as t (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) returning to_jsonb(t) - %3$L::text[]',
                   p_table, (select string_agg(format('%I', c), ', ') from unnest(cols) c), hidden)
      using p_row into res;
  end if;
  return res;
end
$f$;

create or replace function private.do_update(a public.members, p_table text, p_id bigint, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare
  cfg jsonb := private.table_cfg(p_table, a, true);
  hidden text[] := array(select jsonb_array_elements_text(cfg->'hidden'));
  meta jsonb := private.table_columns(p_table, hidden);
  k text; cols text[] := '{}'; res jsonb; old jsonb; before jsonb := '{}'; after jsonb := '{}';
begin
  if jsonb_typeof(p_patch) is distinct from 'object' then raise sqlstate 'PT400' using message = 'bad_row'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if not exists (select 1 from jsonb_array_elements(meta) c where c->>'name' = k) then
      raise sqlstate 'PT400' using message = 'unknown_column: ' || k;
    end if;
    if k = 'id' or exists (select 1 from jsonb_array_elements(meta) c where c->>'name' = k and c->>'identity' = 'always') then
      raise sqlstate 'PT400' using message = 'immutable_column: ' || k;
    end if;
    cols := cols || k;
  end loop;
  if cardinality(cols) = 0 then raise sqlstate 'PT400' using message = 'empty_patch'; end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_table) using p_id into old;
  if old is null then raise sqlstate 'PT404' using message = 'not_found'; end if;
  execute format('update public.%1$I as t set %2$s from jsonb_populate_record(null::public.%1$I, $1) as r where t.id = $2 returning to_jsonb(t)',
                 p_table, (select string_agg(format('%1$I = r.%1$I', c), ', ') from unnest(cols) c))
    using p_patch, p_id into res;
  foreach k in array cols loop
    if (old->k) is distinct from (res->k) then
      before := before || jsonb_build_object(k, case when k = any (hidden) or k like 'password%' then to_jsonb('***'::text) else old->k end);
      after  := after  || jsonb_build_object(k, case when k = any (hidden) or k like 'password%' then to_jsonb('***'::text) else res->k end);
    end if;
  end loop;
  return jsonb_build_object('row', res - hidden, 'before', before, 'after', after);
end
$f$;

create or replace function private.do_delete(a public.members, p_table text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare
  cfg jsonb := private.table_cfg(p_table, a, true);
  hidden text[] := array(select jsonb_array_elements_text(cfg->'hidden'));
  res jsonb;
begin
  execute format('delete from public.%I t where t.id = $1 returning to_jsonb(t) - %L::text[]', p_table, hidden) using p_id into res;
  if res is null then raise sqlstate 'PT404' using message = 'not_found'; end if;
  return res;
end
$f$;

-- ================================================================= PUBLIC API
-- ---------------------------------------------------------------- session
create or replace function public.app_login(p_national_id text, p_password text, p_remember boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $f$
declare nid text := private.digits(p_national_id); m public.members; tok text; exp timestamptz; fails int; last_fail timestamptz;
begin
  delete from public.app_login_attempts where attempted_at < now() - interval '1 day';
  delete from public.app_sessions where expires_at < now() - interval '7 days';
  select count(*), max(attempted_at) into fails, last_fail
    from public.app_login_attempts where national_id = nid and attempted_at > now() - interval '10 minutes';
  if fails >= 8 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts',
                              'retry_after', greatest(1, ceil(extract(epoch from (last_fail + interval '10 minutes' - now())))::int));
  end if;
  select * into m from public.members where national_id = nid;
  if not found or m.password_hash is null or m.password_hash <> crypt(coalesce(p_password, ''), m.password_hash) then
    insert into public.app_login_attempts (national_id) values (nid);
    return jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  end if;
  delete from public.app_login_attempts where national_id = nid;
  if m.role = 'member' and m.membership_status = 'انصرافی اولیه' then
    return jsonb_build_object('ok', false, 'error', 'membership_cancelled');
  end if;
  tok := encode(gen_random_bytes(32), 'hex');
  exp := now() + case when p_remember then interval '30 days' else interval '12 hours' end;
  insert into public.app_sessions (member_id, token_hash, expires_at) values (m.id, private.token_hash(tok), exp);
  update public.members set last_login_at = now() where id = m.id;
  perform private.audit(m, 'login', null, null);
  return jsonb_build_object('ok', true, 'token', tok, 'expires_at', exp, 'user', private.public_member(m));
end
$f$;

create or replace function public.app_logout(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
begin
  delete from public.app_sessions where token_hash = private.token_hash(p_token);
  return jsonb_build_object('ok', true);
end
$f$;

-- ---------------------------------------------------------------- member area
create or replace function public.app_me(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.actor(p_token);
begin return private.public_member(a); end
$f$;

create or replace function public.app_my_payments(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.actor(p_token);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'payment_date', p.payment_date, 'description', p.description)
                                    order by p.payment_date desc, p.id desc), '[]'::jsonb)
            from public.payments p where p.member_id = a.id);
end
$f$;

create or replace function public.app_my_obligations(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.actor(p_token);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'amount', o.amount, 'due_date', o.due_date, 'description', o.description)
                                    order by o.due_date, o.id), '[]'::jsonb)
            from public.obligations o where o.member_id = a.id);
end
$f$;

create or replace function public.app_scoreboard(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.actor(p_token);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'first_name', m.first_name, 'last_name', m.last_name, 'score', m.score)
                                    order by m.score desc nulls last, m.id), '[]'::jsonb)
            from public.members m);
end
$f$;

create or replace function public.app_submit_suggestion(p_token text, p_content text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.actor(p_token); c text := btrim(coalesce(p_content, ''));
begin
  if c = '' or char_length(c) > 5000 then raise sqlstate 'PT400' using message = 'bad_content'; end if;
  insert into public.suggestions (member_id, full_name, content) values (a.id, btrim(a.first_name || ' ' || a.last_name), c);
  return jsonb_build_object('ok', true);
end
$f$;

-- ---------------------------------------------------------------- admin: overview
create or replace function public.admin_overview(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.require_admin(p_token); res jsonb;
begin
  res := jsonb_build_object(
    'members',     (select count(*) from public.members),
    'admins',      (select count(*) from public.members where role in ('admin', 'superadmin')),
    'payments',    (select jsonb_build_object('count', count(*), 'sum', coalesce(sum(amount), 0)) from public.payments),
    'obligations', (select jsonb_build_object('count', count(*), 'sum', coalesce(sum(amount), 0)) from public.obligations),
    'suggestions', (select count(*) from public.suggestions),
    'total_paid',  (select coalesce(sum(total_paid), 0) from public.members),
    'debt',        (select coalesce(sum(debt), 0) from public.members),
    'latest_suggestions', (select coalesce(jsonb_agg(s), '[]'::jsonb) from (
        select id, full_name, left(content, 140) as content, created_at from public.suggestions order by id desc limit 5) s));
  if a.role = 'superadmin' then
    res := res || jsonb_build_object(
      'sessions', (select count(*) from public.app_sessions where expires_at > now()),
      'recent_audit', (select coalesce(jsonb_agg(l), '[]'::jsonb) from (
          select id, actor_name, action, target_table, created_at from public.audit_log order by id desc limit 8) l));
  end if;
  return res;
end
$f$;

-- ---------------------------------------------------------------- admin: generic table API
create or replace function public.db_tables(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.require_admin(p_token); t text; cfg jsonb; res jsonb := '[]'; cnt bigint;
begin
  foreach t in array array['members', 'payments', 'obligations', 'suggestions', 'import_configs', 'audit_log'] loop
    if t = 'audit_log' and a.role <> 'superadmin' then continue; end if;
    cfg := private.table_cfg(t, a);
    execute format('select count(*) from public.%I', t) into cnt;
    res := res || jsonb_build_array(jsonb_build_object(
      'name', t, 'rows', cnt, 'write', (cfg->>'write')::boolean,
      'columns', private.table_columns(t, array(select jsonb_array_elements_text(cfg->'hidden')))));
  end loop;
  return res;
end
$f$;

create or replace function public.db_select(p_token text, p_table text, p_opts jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare
  a public.members := private.require_admin(p_token);
  cfg jsonb := private.table_cfg(p_table, a);
  hidden text[] := array(select jsonb_array_elements_text(cfg->'hidden'));
  v_limit int := least(greatest(coalesce(nullif(p_opts->>'limit', '')::int, 50), 1), 5000);
  v_offset int := greatest(coalesce(nullif(p_opts->>'offset', '')::int, 0), 0);
  v_search text := nullif(btrim(p_opts->>'search'), '');
  v_dir text := case when lower(coalesce(p_opts #>> '{order,dir}', 'asc')) = 'desc' then 'desc' else 'asc' end;
  v_ocol text := p_opts #>> '{order,col}';
  colnames text[]; with_member boolean; join_sql text := ''; sel_sql text; where_sql text := 'true'; order_sql text;
  f jsonb; fcol text; fop text; fval jsonb; ftype text; fexpr text; fcmp text; parts text[] := '{}'; sparts text[];
  total bigint; rows_json jsonb;
begin
  colnames := array(select c->>'name' from jsonb_array_elements(private.table_columns(p_table, hidden)) c);
  with_member := ('member_id' = any (colnames)) and coalesce((p_opts->>'with_member')::boolean, false);
  if with_member then join_sql := ' left join public.members m on m.id = t.member_id'; end if;

  sel_sql := case when with_member
    then format('(to_jsonb(t) - %L::text[]) || jsonb_build_object(''member_name'', btrim(coalesce(m.first_name, '''') || '' '' || coalesce(m.last_name, '''')), ''member_national_id'', m.national_id)', hidden)
    else format('(to_jsonb(t) - %L::text[])', hidden) end;

  if v_search is not null then
    sparts := array(select format('coalesce(t.%I::text, '''')', c) from unnest(colnames) c);
    if with_member then
      sparts := sparts || array['coalesce(m.first_name, '''')', 'coalesce(m.last_name, '''')', 'coalesce(m.national_id, '''')'];
    end if;
    parts := parts || format('(%s) ilike %L', array_to_string(sparts, ' || '' '' || '),
                             '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%');
  end if;

  for f in select * from jsonb_array_elements(coalesce(p_opts->'filters', '[]'::jsonb)) loop
    fcol := f->>'col'; fop := coalesce(f->>'op', 'eq'); fval := f->'val';
    if fcol = any (colnames) then
      ftype := private.col_type(p_table, fcol); fexpr := format('t.%I', fcol);
    elsif with_member and fcol = 'member_name' then
      ftype := 'text'; fexpr := 'btrim(coalesce(m.first_name, '''') || '' '' || coalesce(m.last_name, ''''))';
    elsif with_member and fcol = 'member_national_id' then
      ftype := 'text'; fexpr := 'm.national_id';
    else
      raise sqlstate 'PT400' using message = 'unknown_column: ' || coalesce(fcol, '');
    end if;
    fcmp := case fop when 'eq' then '=' when 'neq' then '<>' when 'gt' then '>' when 'gte' then '>=' when 'lt' then '<' when 'lte' then '<=' else null end;
    if fcmp is not null then
      parts := parts || format('%s %s %L::%s', fexpr, fcmp, fval #>> '{}', ftype);
    elsif fop = 'like' then
      parts := parts || format('%s::text ilike %L', fexpr, '%' || replace(replace(replace(coalesce(fval #>> '{}', ''), '\', '\\'), '%', '\%'), '_', '\_') || '%');
    elsif fop = 'in' then
      parts := parts || format('%s = any (%L::text[]::%s[])', fexpr, array(select jsonb_array_elements_text(fval)), ftype);
    elsif fop = 'null' then
      parts := parts || format('%s is null', fexpr);
    elsif fop = 'notnull' then
      parts := parts || format('%s is not null', fexpr);
    else
      raise sqlstate 'PT400' using message = 'unknown_op: ' || fop;
    end if;
  end loop;
  if cardinality(parts) > 0 then where_sql := array_to_string(parts, ' and '); end if;

  if v_ocol is null then order_sql := 't.id';
  elsif v_ocol = any (colnames) then order_sql := format('t.%I %s nulls last, t.id', v_ocol, v_dir);
  elsif with_member and v_ocol = 'member_name' then order_sql := format('m.last_name %1$s, m.first_name %1$s, t.id', v_dir);
  elsif with_member and v_ocol = 'member_national_id' then order_sql := format('m.national_id %s, t.id', v_dir);
  else raise sqlstate 'PT400' using message = 'unknown_column: ' || v_ocol;
  end if;

  execute format('select count(*) from public.%I t%s where %s', p_table, join_sql, where_sql) into total;
  execute format('select coalesce(jsonb_agg(x.j order by x.rn), ''[]''::jsonb) from (select %s as j, row_number() over (order by %s) as rn from public.%I t%s where %s order by %s limit %s offset %s) x',
                 sel_sql, order_sql, p_table, join_sql, where_sql, order_sql, v_limit, v_offset) into rows_json;
  return jsonb_build_object('rows', rows_json, 'total', total);
end
$f$;

create or replace function public.db_insert(p_token text, p_table text, p_row jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.require_admin(p_token); res jsonb;
begin
  res := private.do_insert(a, p_table, p_row);
  perform private.audit(a, 'insert', p_table, jsonb_build_object('id', res->'id'));
  return res;
end
$f$;

create or replace function public.db_update(p_token text, p_table text, p_id bigint, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.require_admin(p_token); res jsonb;
begin
  res := private.do_update(a, p_table, p_id, p_patch);
  perform private.audit(a, 'update', p_table, jsonb_build_object('id', p_id, 'before', res->'before', 'after', res->'after'));
  return res->'row';
end
$f$;

create or replace function public.db_delete(p_token text, p_table text, p_ids jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.require_admin(p_token); i jsonb; n int := 0; snap jsonb := '[]'; r jsonb;
begin
  if jsonb_typeof(p_ids) is distinct from 'array' then raise sqlstate 'PT400' using message = 'bad_ids'; end if;
  for i in select * from jsonb_array_elements(p_ids) loop
    r := private.do_delete(a, p_table, (i #>> '{}')::bigint);
    n := n + 1;
    if n <= 20 then snap := snap || jsonb_build_array(private.mask(r)); end if;
  end loop;
  perform private.audit(a, 'delete', p_table, jsonb_build_object('count', n, 'rows', snap));
  return jsonb_build_object('deleted', n);
end
$f$;

create or replace function public.db_apply(p_token text, p_table text, p_ops jsonb, p_label text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare
  a public.members := private.require_admin(p_token);
  o jsonb; i int := 0; ins int := 0; upd int := 0; del int := 0; op text;
  v_state text; v_msg text; v_detail text;
begin
  if jsonb_typeof(p_ops) is distinct from 'array' then raise sqlstate 'PT400' using message = 'bad_ops'; end if;
  if jsonb_array_length(p_ops) > 20000 then raise sqlstate 'PT400' using message = 'too_many_ops'; end if;
  for o in select * from jsonb_array_elements(p_ops) loop
    i := i + 1; op := o->>'op';
    begin
      if op = 'insert' then perform private.do_insert(a, p_table, o->'row'); ins := ins + 1;
      elsif op = 'update' then perform private.do_update(a, p_table, (o->>'id')::bigint, o->'patch'); upd := upd + 1;
      elsif op = 'delete' then perform private.do_delete(a, p_table, (o->>'id')::bigint); del := del + 1;
      else raise sqlstate 'PT400' using message = 'unknown_op';
      end if;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail;
      raise exception 'op %: % (%)', i, v_msg, op
        using errcode = case when v_state like 'PT%' then v_state else 'PT422' end, detail = v_detail;
    end;
  end loop;
  perform private.audit(a, 'apply', p_table, jsonb_build_object('label', p_label, 'inserted', ins, 'updated', upd, 'deleted', del));
  return jsonb_build_object('inserted', ins, 'updated', upd, 'deleted', del);
end
$f$;

create or replace function public.db_lookup(p_token text, p_table text, p_column text, p_values jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare
  a public.members := private.require_admin(p_token);
  cfg jsonb := private.table_cfg(p_table, a);
  hidden text[] := array(select jsonb_array_elements_text(cfg->'hidden'));
  res jsonb;
begin
  if not exists (select 1 from jsonb_array_elements(private.table_columns(p_table, hidden)) c where c->>'name' = p_column) then
    raise sqlstate 'PT400' using message = 'unknown_column: ' || coalesce(p_column, '');
  end if;
  execute format('select coalesce(jsonb_object_agg(s.k, s.ids), ''{}''::jsonb) from (select t.%1$I::text as k, jsonb_agg(t.id order by t.id) as ids from public.%2$I t where t.%1$I::text = any (select jsonb_array_elements_text($1)) group by 1) s',
                 p_column, p_table) using p_values into res;
  return res;
end
$f$;

-- ---------------------------------------------------------------- superadmin
create or replace function public.admin_set_role(p_token text, p_member_id bigint, p_role text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.require_super(p_token); m public.members;
begin
  if p_role not in ('member', 'admin', 'superadmin') then raise sqlstate 'PT400' using message = 'bad_role'; end if;
  select * into m from public.members where id = p_member_id;
  if not found then raise sqlstate 'PT404' using message = 'not_found'; end if;
  if p_role = 'superadmin' then
    if m.id = a.id then return jsonb_build_object('ok', true); end if;
    perform set_config('app.transfer', '1', true);
    update public.members set role = 'admin' where id = a.id;
    update public.members set role = 'superadmin' where id = m.id;
    perform set_config('app.transfer', '', true);
    perform private.audit(a, 'transfer', 'members', jsonb_build_object('to', m.id));
  else
    if m.id = a.id then raise sqlstate 'PT403' using message = 'use_transfer'; end if;
    update public.members set role = p_role where id = m.id;
    perform private.audit(a, 'role', 'members', jsonb_build_object('id', m.id, 'role', p_role));
  end if;
  return jsonb_build_object('ok', true);
end
$f$;

create or replace function public.db_schema(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.require_super(p_token); t record; res jsonb := '[]'; cnt bigint;
begin
  for t in select c.relname as name, c.relrowsecurity as rls, pg_total_relation_size(c.oid) as size, c.oid
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' order by c.relname loop
    execute format('select count(*) from public.%I', t.name) into cnt;
    res := res || jsonb_build_array(jsonb_build_object(
      'name', t.name, 'rows', cnt, 'size', t.size, 'rls', t.rls,
      'columns', private.table_columns(t.name, '{}'),
      'indexes', (select coalesce(jsonb_agg(jsonb_build_object('name', indexname, 'def', indexdef) order by indexname), '[]'::jsonb)
                    from pg_indexes where schemaname = 'public' and tablename = t.name),
      'constraints', (select coalesce(jsonb_agg(jsonb_build_object('name', conname, 'type', contype, 'def', pg_get_constraintdef(oid)) order by conname), '[]'::jsonb)
                        from pg_constraint where conrelid = t.oid)));
  end loop;
  return jsonb_build_object(
    'version', version(),
    'tables', res,
    'functions', (select coalesce(jsonb_agg(jsonb_build_object('name', p.proname, 'args', pg_get_function_identity_arguments(p.oid)) order by p.proname), '[]'::jsonb)
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and (p.proname like 'app\_%' or p.proname like 'admin\_%' or p.proname like 'db\_%')));
end
$f$;

create or replace function public.db_sql(p_token text, p_sql text) returns json
language plpgsql security definer set search_path = public, extensions as $f$
declare
  a public.members := private.require_super(p_token);
  q text := btrim(coalesce(p_sql, ''), E' \n\t\r;');
  t0 timestamptz := clock_timestamp(); res json := '[]'::json; n bigint := 0; cols json := '[]'::json; v_state text; v_msg text;
begin
  if q = '' then raise sqlstate 'PT400' using message = 'empty_sql'; end if;
  perform set_config('statement_timeout', '20000', true);
  begin
    if q ~* '^(select|values|table|show)\M' and position(';' in q) = 0 then
      execute format('select coalesce(json_agg(row_to_json(q)), ''[]''::json) from (%s) q', q) into res;
      n := json_array_length(res);
      if n > 0 then select coalesce(json_agg(k), '[]'::json) into cols from json_object_keys(res->0) k; end if;
    else
      execute q;
      get diagnostics n = row_count;
    end if;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    perform private.audit(a, 'sql_error', null, jsonb_build_object('sql', left(q, 2000), 'error', v_msg));
    return json_build_object('ok', false, 'error', v_msg, 'sqlstate', v_state,
                             'ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
  end;
  perform private.audit(a, 'sql', null, jsonb_build_object('sql', left(q, 2000), 'rows', n));
  return json_build_object('ok', true, 'columns', cols, 'rows', res, 'rowcount', n,
                           'ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
end
$f$;

create or replace function public.db_sessions(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.require_super(p_token);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id, 'member_id', s.member_id, 'name', btrim(m.first_name || ' ' || m.last_name), 'role', m.role,
            'created_at', s.created_at, 'last_seen_at', s.last_seen_at, 'expires_at', s.expires_at,
            'current', s.id = nullif(current_setting('app.session_id', true), '')::bigint) order by s.last_seen_at desc), '[]'::jsonb)
            from public.app_sessions s join public.members m on m.id = s.member_id where s.expires_at > now());
end
$f$;

create or replace function public.db_revoke_session(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.require_super(p_token); n int;
begin
  delete from public.app_sessions where id = p_id;
  get diagnostics n = row_count;
  perform private.audit(a, 'revoke', 'app_sessions', jsonb_build_object('id', p_id));
  return jsonb_build_object('revoked', n);
end
$f$;

create or replace function public.db_empty_table(p_token text, p_table text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.require_super(p_token); n bigint;
begin
  if p_table not in ('members', 'payments', 'obligations', 'suggestions', 'import_configs') then
    raise sqlstate 'PT403' using message = 'read_only_table';
  end if;
  if p_table = 'members' then
    delete from public.members where role = 'member';
  else
    execute format('delete from public.%I', p_table);
  end if;
  get diagnostics n = row_count;
  perform private.audit(a, 'empty', p_table, jsonb_build_object('deleted', n));
  return jsonb_build_object('deleted', n);
end
$f$;

create or replace function public.db_backup(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $f$
declare a public.members := private.require_super(p_token); t text; res jsonb := '{}'; rows_json jsonb; hidden text[];
begin
  foreach t in array array['members', 'payments', 'obligations', 'suggestions', 'import_configs', 'audit_log'] loop
    hidden := array(select jsonb_array_elements_text(private.table_cfg(t, a)->'hidden'));
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - %L::text[] order by x.id), ''[]''::jsonb) from public.%I x', hidden, t) into rows_json;
    res := res || jsonb_build_object(t, rows_json);
  end loop;
  perform private.audit(a, 'backup', null, null);
  return jsonb_build_object('generated_at', now(), 'tables', res);
end
$f$;

-- ---------------------------------------------------------------- lock down
do $f$
declare r record;
begin
  for r in select pol.policyname, pol.tablename from pg_policies pol where pol.schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;
end
$f$;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on schema private from public, anon, authenticated;

do $f$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'app\_%' or p.proname like 'admin\_%' or p.proname like 'db\_%') loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to anon, authenticated, service_role', r.sig);
  end loop;
end
$f$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
--  First superadmin (run once, with your own details):
--
--  insert into public.members (first_name, last_name, national_id, password_initial, role)
--  values ('FIRST', 'LAST', '0000000000', 'PASSWORD', 'superadmin');
--
--  or promote an existing member:
--  update public.members set role = 'superadmin' where national_id = '0000000000';
-- ---------------------------------------------------------------------
