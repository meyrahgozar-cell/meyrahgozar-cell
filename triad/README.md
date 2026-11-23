# TRIAD /// 3D SCORING MATRIX

A three-dimensional ranking and scoring matrix. People score people across traits — the
result is a cube, and the UI lets you slice that cube three different ways.

Vanilla JS, no build step, no framework. Supabase for auth + Postgres. OpenRouter (free
models) for the AI layer, called directly from the browser with a key that never leaves
localStorage.

```
 node server.mjs        →  http://localhost:3013
```

---

## 1. Run it

```bash
npm install          # only for the bundled supabase-js source; the app itself is static
npm start            # node server.mjs (default port 3013)
```

Open `http://localhost:3013`. The app boots in **local mode** with a generated demo cube
(12 people, 24 traits, 3 168 cells) so every view is alive before any database exists.

The repo already vendors the Supabase UMD build at `vendor/supabase.js`, so runtime needs
no package manager at all.

---

## 2. Database

The publishable key cannot create tables (Postgres permissions, by design), so run the
SQL once in **Supabase → SQL Editor**:

1. `supabase/setup.sql` — schema **and** demo seed in one paste (recommended), or
2. `supabase/schema.sql` then `supabase/seed.sql` separately.

Inside the app: **Settings → Data → Console** shows live table status, and copies or
downloads the same SQL.

### What gets created

| table | role |
|---|---|
| `mtx_traits` | one row per dimension (stack in the property-based view) |
| `mtx_scores` | **the cube cell**: `(trait, ranker_person, target_person) → value` |
| `mtx_sessions` | rating sessions (deck runs) |
| `mtx_comments` | cell annotations |
| `mtx_disputes` | contested cells raised for review |
| `mtx_relations` | social graph between people |
| `mtx_views` | saved matrix configurations |
| `mtx_ai_runs` | AI call log (prompt, response, reasoning, latency) |
| `mtx_prefs` | per-user preferences |
| `mtx_events` | activity feed |
| `openrouter_models` | **unprefixed on purpose** — full OpenRouter free-model catalogue |
| `mtx_v_consensus` / `mtx_v_ranker_bias` | aggregate views |
| `mtx_export_cube()` | RPC returning the whole cube as JSON |

`people` and `profiles` already exist in the project and are used as-is. `meraj_models`
is also probed at runtime: if the signed-in user can read it, those models are merged into
the picker alongside the OpenRouter catalogue.

Reads are public; writes require an authenticated session (RLS on every table).
Sign up with email — the project has autoconfirm enabled, so no inbox round trip.

---

## 3. The cube

```
value = mtx_scores[trait][ranker][target]
```

Three slices, all reachable from **Matrix**:

| view | stacks (layers) | table inside each stack |
|---|---|---|
| **Trait** | one per trait | rankers (rows) × targets (cols) |
| **Ranker** | one per person, as scorer | targets (rows) × traits (cols) |
| **Target** | one per person, as scored | rankers (rows) × traits (cols) |

Each layer is a canvas heatmap rendered inside a CSS-3D stack: drag to orbit, wheel for
depth, `E` to explode, `R` to reset, click to focus, double-click to open the full table.

---

## 4. Features

**Matrix** — 3D stack engine with inertia, explode, depth rail, camera gizmo · editable 2D
slice with heat/divergence/confidence colouring, keyboard cell navigation, `+`/`−`
nudging, notes, CSV export, transpose, cell size, self-cell masking.

**Deck** — swipe or keyboard scoring, spring physics, value dial, per-trait progress,
undo, session summary, sound + vibration on commit.

**Hub** — composite leaderboard, contested cells, distributions, telemetry.

**People / Traits** — full CRUD against `people` and `mtx_traits`, library installer
(96 traits in 8 categories), profile drawer with radar, per-trait given/received table,
reliability grades.

**Insights** — weighted composite, 3-component PCA embedding in a draggable 3D scatter,
consensus heatmap, ranker agreement matrix (Pearson), polarisation index, treemap of
weight mass, dispute queue, full statistics table, AI narration.

**Compare** — radar overlay, per-trait head-to-head, reciprocity A→B vs B→A, AI verdict.

**AI Lab** — OpenRouter key (local only), 400+ model catalogue filtered to free, streaming
chat with visible reasoning, temperature/top-p/max-tokens/reasoning-effort, eight agent
prompts (auditor, narrator, trait designer, profiler, anomaly hunter, deck planner,
dispute brief, head-to-head judge), context inspector. Without a key an offline analyst
answers from the aggregate statistics so the UI never dead-ends.

**Sound** — everything is synthesised with WebAudio: the two-glasses clink (inharmonic
partials + contact noise + synthetic plate reverb) fires on every score commit; whooshes
on navigation, chimes on save, a riser on explode, ticks while dragging. Haptics via
`navigator.vibrate`. Soundboard in Settings.

**Shell** — command palette (⌘K), keyboard map (`?`), inspector dock, source switcher
(local / cloud / auto), import/export, DB console, accent + density + motion prefs.

---

## 5. Files

```
index.html            shell markup, boot screen
server.mjs            zero-dependency static server
styles/               tokens, base, layout, stack, matrix, charts, deck, panels, chat, fx, responsive
js/core/              dom, bus, math (cube engine), store, api (supabase), localdb, seed, auth, router, nav, format, config
js/ui/                icons, sounds, overlay, bits, charts, stack3d, matrix, deck, ai, palette, authui, shell, fx
js/views/             hub, matrix, deck, people, traits, insights, compare, lab, settings
data/                 trait library (96), OpenRouter free-model catalogue
supabase/             schema.sql, seed.sql, setup.sql
scripts/check.mjs     syntax + import-graph check (npm run check)
```

`npm run check` parses every module and verifies that every named import actually exists
in its target file — cheap substitute for a bundler.

---

## 6. Notes

- The API key is stored in `localStorage` and sent only to `openrouter.ai`. There is no
  proxy. Remove it from **AI Lab → Key → Remove**.
- Local mode persists to `localStorage` (`triad.local.v1`). **Settings → Data → Push
  local → cloud** migrates the demo cube into Postgres once a session exists.
- `scripts/check.mjs` is the only build-time tool; there is no transpiler.
