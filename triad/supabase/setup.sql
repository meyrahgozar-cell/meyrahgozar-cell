-- ===========================================================================
--  TRIAD /// SETUP (schema + optional demo seed) — paste this whole file once.
-- ===========================================================================

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


-- ============================================================================
--  TRIAD /// OPTIONAL DEMO SEED
--  Run AFTER schema.sql. Deterministic, idempotent, safe to re-run.
--  Delete with:  supabase/seed-clean.sql  (or the in-app DB console)
-- ============================================================================

-- ------------------------------------------------------------------ traits
insert into public.mtx_traits (key, name, category, icon, color, description, polarity, weight, is_core, sort_order)
values
  ('kindness',      'Kindness',      'character', 'heart',   '#ff7bc6', 'Warmth offered without being asked.',        1, 1.2, true, 1),
  ('bravery',       'Bravery',       'character', 'flame',   '#ffb454', 'Acting despite the cost.',                   1, 1.1, true, 2),
  ('reliability',   'Reliability',   'work',      'shield',  '#5ef2d6', 'Promises kept when nobody is watching.',     1, 1.4, true, 3),
  ('curiosity',     'Curiosity',     'mind',      'compass', '#7aa2ff', 'Questions more than answers.',               1, 1.0, true, 4),
  ('humor',         'Humor',         'social',    'spark',   '#c39bff', 'Finds the angle nobody else sees.',          1, 0.8, true, 5),
  ('integrity',     'Integrity',     'character', 'scale',   '#8ef2a1', 'Consistency between word and act.',          1, 1.5, true, 6),
  ('focus',         'Focus',         'work',      'target',  '#4cc9f0', 'Depth of attention under pressure.',          1, 1.2, true, 7),
  ('empathy',       'Empathy',       'social',    'wave',    '#ff9a8b', 'Reads the room before the room speaks.',      1, 1.3, true, 8),
  ('candor',        'Candor',        'social',    'bolt',    '#ffe066', 'Says the true thing, gently.',                1, 1.1, true, 9),
  ('resilience',    'Resilience',    'character', 'mountain','#79f0d0', 'Returns to the work after the fall.',         1, 1.2, true, 10),
  ('ambition',      'Ambition',      'work',      'rocket',  '#ff6b6b', 'Pulls the horizon closer.',                   1, 0.9, true, 11),
  ('taste',         'Taste',         'mind',      'diamond', '#a8e6ff', 'Recognises the difference that matters.',     1, 0.7, true, 12),
  ('patience',      'Patience',      'character', 'hourglass','#b8c4ff','Holds the long line without fraying.',        1, 1.0, true, 13),
  ('presence',      'Presence',      'social',    'sun',     '#ffd28a', 'Changes the temperature of a room.',          1, 1.1, true, 14)
on conflict (key) do nothing;

-- ------------------------------------------------------------------ people
insert into public.people (full_name, slug, job_title, department, bio, tags, metadata)
values
  ('Adler Voss',     'adler-voss',     'Systems Architect', 'Platform',  'Draws boxes around chaos until it behaves.', array['architect','calm'],   '{"seed":"adler"}'::jsonb),
  ('Brontë Mara',    'bronte-mara',    'Product Lead',      'Product',   'Ships the smallest thing that changes the room.', array['product','decisive'], '{"seed":"bronte"}'::jsonb),
  ('Cyrus Ilan',     'cyrus-ilan',     'Staff Engineer',    'Platform',  'Owns the load-bearing code nobody wants to touch.', array['engineer'],       '{"seed":"cyrus"}'::jsonb),
  ('Dalia Ren',      'dalia-ren',      'Design Director',   'Design',    'Taste with a traceable audit trail.', array['design','taste'],               '{"seed":"dalia"}'::jsonb),
  ('Emil Sarto',     'emil-sarto',     'Data Scientist',    'Insights',  'Suspicious of every average.', array['data','skeptic'],                     '{"seed":"emil"}'::jsonb),
  ('Farah Nouri',    'farah-nouri',    'Engineering Manager','Platform', 'Unblocks people faster than blockers appear.', array['manager'],             '{"seed":"farah"}'::jsonb),
  ('Gideon Pike',    'gideon-pike',    'Security Lead',     'Security',  'Assumes the breach already started.', array['security','direct'],            '{"seed":"gideon"}'::jsonb),
  ('Hana Ito',       'hana-ito',       'Research Engineer', 'Labs',      'Prototypes in the direction of the future.', array['research','curious'],      '{"seed":"hana"}'::jsonb),
  ('Ivo Lenz',       'ivo-lenz',       'Growth Strategist', 'Growth',    'Finds the loop inside the funnel.', array['growth','bold'],                    '{"seed":"ivo"}'::jsonb),
  ('Juno Adeyemi',   'juno-adeyemi',   'Operations Lead',   'Ops',       'Makes the invisible machine run quietly.', array['ops','steady'],                '{"seed":"juno"}'::jsonb),
  ('Kai Sørensen',   'kai-sorensen',   'Staff Designer',    'Design',    'Prototypes with their hands, not slides.', array['design','maker'],              '{"seed":"kai"}'::jsonb),
  ('Lior Ashkenazi', 'lior-ashkenazi', 'AI Engineer',       'Labs',      'Turns prompts into product surface.', array['ai','builder'],                    '{"seed":"lior"}'::jsonb)
on conflict (slug) do nothing;

-- ------------------------------------------------------------------ scores
-- Deterministic value between 2.4 and 9.6 with per-ranker and per-target bias,
-- so consensus charts have structure instead of pure noise.
with t as (select id, key, sort_order from public.mtx_traits),
     p as (select id, full_name, row_number() over (order by full_name) as n from public.people),
     grid as (
       select t.id as trait_id, r.id as ranker_id, s.id as target_id,
              r.n as rn, s.n as sn, t.sort_order as to_
       from t cross join p r cross join p s
       where r.id <> s.id
     ),
     biased as (
       select g.*,
         5.9
         + ((g.rn % 3) - 1) * 0.55                       -- ranker generosity
         + ((g.sn % 4) - 1.5) * 0.35                     -- target halo
         + ((g.to_ % 5) - 2) * 0.18                      -- trait difficulty
         + (((hashtext(g.trait_id::text || g.ranker_id::text || g.target_id::text) & 2147483647) % 400) - 200) / 100.0
         as raw
       from grid g
     )
insert into public.mtx_scores (trait_id, ranker_person_id, target_person_id, value, confidence, source)
select trait_id, ranker_id, target_id,
       greatest(0.5, least(9.9, round(raw::numeric, 2))) as value,
       (0.55 + (((hashtext(ranker_id::text || ':' || target_id::text) & 2147483647) % 40) / 100.0))::numeric(4,2),
       'seed'
from biased
on conflict (trait_id, ranker_person_id, target_person_id) do nothing;

-- --------------------------------------------------------------- relations
insert into public.mtx_relations (person_id, other_id, kind, weight)
select a.id, b.id, 'peer', 1
from public.people a
join public.people b on a.id <> b.id
where ((hashtext(a.id::text || b.id::text) & 2147483647) % 100) < 22
on conflict (person_id, other_id, kind) do nothing;

-- ------------------------------------------------------------------- check
do $$
declare
  c_traits int; c_people int; c_scores int;
begin
  select count(*) into c_traits from public.mtx_traits;
  select count(*) into c_people from public.people;
  select count(*) into c_scores from public.mtx_scores;
  raise notice 'TRIAD seed -> traits: %, people: %, cube cells: %', c_traits, c_people, c_scores;
end;
$$;
