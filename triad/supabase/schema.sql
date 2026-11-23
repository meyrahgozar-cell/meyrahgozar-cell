-- ============================================================================
--  TRIAD /// 3D RANKING MATRIX  --  database contract
--  Idempotent. Safe to run repeatedly in the Supabase SQL editor.
--
--  Conventions
--    * matrix tables are prefixed  mtx_       (>= 4 chars, isolated namespace)
--    * the AI model catalogue is intentionally unprefixed: openrouter_models
--    * reads are public, writes require an authenticated session
--    * every cell of the cube is one row in mtx_scores:
--          (trait, ranker_person, target_person) -> value
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- utilities
create or replace function public.mtx_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- mtx_traits
create table if not exists public.mtx_traits (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  name          text not null,
  category      text not null default 'general',
  description   text,
  icon          text not null default 'spark',
  color         text not null default '#5ef2d6',
  min_value     numeric not null default 0,
  max_value     numeric not null default 10,
  polarity      smallint not null default 1,
  weight        numeric not null default 1,
  is_core       boolean not null default false,
  sort_order    integer not null default 0,
  owner_id      uuid references auth.users(id) on delete set null,
  created_by    uuid references auth.users(id) on delete set null,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- mtx_scores
create table if not exists public.mtx_scores (
  id                 uuid primary key default gen_random_uuid(),
  trait_id           uuid not null references public.mtx_traits(id) on delete cascade,
  ranker_person_id   uuid not null references public.people(id) on delete cascade,
  target_person_id   uuid not null references public.people(id) on delete cascade,
  value              numeric not null,
  confidence         numeric not null default 0.75 check (confidence >= 0 and confidence <= 1),
  note               text,
  source             text not null default 'manual',
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint mtx_scores_no_self check (ranker_person_id <> target_person_id),
  constraint mtx_scores_unique_cell unique (trait_id, ranker_person_id, target_person_id)
);

create index if not exists mtx_scores_trait_idx  on public.mtx_scores (trait_id);
create index if not exists mtx_scores_ranker_idx on public.mtx_scores (ranker_person_id);
create index if not exists mtx_scores_target_idx on public.mtx_scores (target_person_id);

-- ------------------------------------------------------------ mtx_comments
create table if not exists public.mtx_comments (
  id               uuid primary key default gen_random_uuid(),
  trait_id         uuid references public.mtx_traits(id) on delete cascade,
  ranker_person_id uuid references public.people(id) on delete cascade,
  target_person_id uuid references public.people(id) on delete cascade,
  author_id        uuid references auth.users(id) on delete set null,
  body             text not null,
  created_at       timestamptz not null default now()
);

-- ------------------------------------------------------------ mtx_disputes
create table if not exists public.mtx_disputes (
  id               uuid primary key default gen_random_uuid(),
  score_id         uuid references public.mtx_scores(id) on delete cascade,
  trait_id         uuid references public.mtx_traits(id) on delete cascade,
  target_person_id uuid references public.people(id) on delete cascade,
  raised_by        uuid references auth.users(id) on delete set null,
  reason           text,
  status           text not null default 'open' check (status in ('open','accepted','rejected')),
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

-- ----------------------------------------------------------- mtx_relations
create table if not exists public.mtx_relations (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete cascade,
  other_id    uuid not null references public.people(id) on delete cascade,
  kind        text not null default 'peer',
  weight      numeric not null default 1,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint mtx_relations_no_self check (person_id <> other_id),
  constraint mtx_relations_unique unique (person_id, other_id, kind)
);

-- ------------------------------------------------------------ mtx_sessions
create table if not exists public.mtx_sessions (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users(id) on delete set null,
  ranker_person_id uuid references public.people(id) on delete set null,
  kind          text not null default 'deck',
  status        text not null default 'live' check (status in ('live','paused','done')),
  spec          jsonb not null default '{}'::jsonb,
  progress      jsonb not null default '{}'::jsonb,
  rated_count   integer not null default 0,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

-- --------------------------------------------------------------- mtx_views
create table if not exists public.mtx_views (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references auth.users(id) on delete cascade,
  name       text not null,
  mode       text not null default 'trait',
  config     jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------- mtx_ai_runs
create table if not exists public.mtx_ai_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  kind         text not null default 'chat',
  model_slug   text,
  prompt       text,
  response     text,
  reasoning    text,
  status       text not null default 'ok',
  tokens_in    integer not null default 0,
  tokens_out   integer not null default 0,
  latency_ms   integer,
  error        text,
  context      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- --------------------------------------------------------------- mtx_prefs
create table if not exists public.mtx_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  prefs      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------- mtx_events
create table if not exists public.mtx_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  kind       text not null,
  label      text,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists mtx_events_created_idx on public.mtx_events (created_at desc);

-- ------------------------------------------------------ openrouter_models
-- Unprefixed on purpose: shared catalogue of OpenRouter free models with the
-- full upstream payload kept in `raw`.
create table if not exists public.openrouter_models (
  id                      text primary key,
  canonical_slug          text,
  name                    text not null,
  provider                text,
  description             text,
  context_length          integer,
  max_completion_tokens   integer,
  architecture            jsonb not null default '{}'::jsonb,
  pricing                 jsonb not null default '{}'::jsonb,
  supported_parameters    jsonb not null default '[]'::jsonb,
  default_parameters      jsonb not null default '{}'::jsonb,
  top_provider            jsonb not null default '{}'::jsonb,
  modality                text,
  input_modalities        text[] not null default '{}',
  output_modalities       text[] not null default '{}',
  reasoning               jsonb,
  hugging_face_id         text,
  knowledge_cutoff        text,
  expiration_date         timestamptz,
  endpoints               jsonb not null default '[]'::jsonb,
  is_free                 boolean not null default true,
  is_moderated            boolean not null default false,
  is_curated              boolean not null default false,
  is_favorite             boolean not null default false,
  is_active               boolean not null default true,
  sort_order              integer not null default 0,
  first_seen_at           timestamptz not null default now(),
  last_synced_at          timestamptz not null default now(),
  raw                     jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------- triggers
drop trigger if exists mtx_traits_touch on public.mtx_traits;
create trigger mtx_traits_touch before update on public.mtx_traits
  for each row execute function public.mtx_touch_updated_at();

drop trigger if exists mtx_scores_touch on public.mtx_scores;
create trigger mtx_scores_touch before update on public.mtx_scores
  for each row execute function public.mtx_touch_updated_at();

-- ------------------------------------------------------------------- views
-- Consensus of every (trait, target) pair across all rankers.
create or replace view public.mtx_v_consensus
with (security_invoker = true) as
select
  s.trait_id,
  t.key            as trait_key,
  t.name           as trait_name,
  t.category       as trait_category,
  t.min_value,
  t.max_value,
  s.target_person_id,
  avg(s.value)::numeric(10,3)                                   as mean,
  coalesce(stddev_samp(s.value), 0)::numeric(10,3)              as spread,
  min(s.value)                                                  as min_value_given,
  max(s.value)                                                  as max_value_given,
  count(*)::int                                                 as raters,
  avg(s.confidence)::numeric(6,3)                               as confidence
from public.mtx_scores s
join public.mtx_traits t on t.id = s.trait_id
group by s.trait_id, t.key, t.name, t.category, t.min_value, t.max_value, s.target_person_id;

-- How each ranker deviates from the group, per trait.
create or replace view public.mtx_v_ranker_bias
with (security_invoker = true) as
select
  s.ranker_person_id,
  s.trait_id,
  count(*)::int                                        as cells,
  avg(s.value)::numeric(10,3)                           as ranker_mean,
  (select avg(x.value) from public.mtx_scores x where x.trait_id = s.trait_id)::numeric(10,3) as trait_mean,
  (avg(s.value) - (select avg(x.value) from public.mtx_scores x where x.trait_id = s.trait_id))::numeric(10,3) as bias
from public.mtx_scores s
group by s.ranker_person_id, s.trait_id;

-- --------------------------------------------------------------- RLS policy
alter table public.mtx_traits        enable row level security;
alter table public.mtx_scores        enable row level security;
alter table public.mtx_comments      enable row level security;
alter table public.mtx_disputes      enable row level security;
alter table public.mtx_relations     enable row level security;
alter table public.mtx_sessions      enable row level security;
alter table public.mtx_views         enable row level security;
alter table public.mtx_ai_runs       enable row level security;
alter table public.mtx_prefs         enable row level security;
alter table public.mtx_events        enable row level security;
alter table public.openrouter_models enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'mtx_traits','mtx_scores','mtx_comments','mtx_disputes','mtx_relations',
    'mtx_sessions','mtx_views','mtx_ai_runs','mtx_prefs','mtx_events','openrouter_models'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_write_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_write_del', t);

    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', t || '_write_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_write_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (true)', t || '_write_del', t);
  end loop;
end;
$$;

-- Public read must survive RLS on the aggregate views as well.
grant select on public.mtx_v_consensus  to anon, authenticated;
grant select on public.mtx_v_ranker_bias to anon, authenticated;
grant select on public.openrouter_models to anon, authenticated;
grant all on public.mtx_traits, public.mtx_scores, public.mtx_comments,
             public.mtx_disputes, public.mtx_relations, public.mtx_sessions,
             public.mtx_views, public.mtx_ai_runs, public.mtx_prefs
  to authenticated;
grant select on public.mtx_traits, public.mtx_scores, public.mtx_comments,
             public.mtx_disputes, public.mtx_relations, public.mtx_sessions,
             public.mtx_views, public.mtx_ai_runs, public.mtx_prefs
  to anon;
grant insert on public.mtx_events to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- --------------------------------------------------------------- analytics
-- One call returns the whole cube for a light client: useful for exports.
create or replace function public.mtx_export_cube()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'traits', coalesce((select jsonb_agg(row_to_json(t)) from public.mtx_traits t), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(row_to_json(s)) from public.mtx_scores s), '[]'::jsonb),
    'exported_at', now()
  );
$$;
grant execute on function public.mtx_export_cube() to anon, authenticated;
