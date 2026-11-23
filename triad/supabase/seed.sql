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
