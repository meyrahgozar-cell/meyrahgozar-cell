// ---------------------------------------------------------------------------
// main-actions.js — cross-view actions: export, import, DB console, AI runs.
// ---------------------------------------------------------------------------
import { h, download, copyText, clear } from './core/dom.js';
import { icon } from './ui/icons.js';
import { store } from './core/store.js';
import { bus, EV } from './core/bus.js';
import { go } from './core/nav.js';
import { modal, toast, confirm, busyOverlay } from './ui/overlay.js';
import { TABLES, SUPABASE_URL } from './core/config.js';
import { remote } from './core/api.js';
import { sfx } from './ui/sounds.js';
import { oneShot, buildContext, contextToPrompt, hasKey, extractJSON, renderMarkdownLite, aiSettings } from './ui/ai.js';

// ------------------------------------------------------------------- export
export function exportCubeJSON() {
  const payload = {
    ...store.cube.exportJSON(),
    source: store.mode,
    prefs: store.prefs
  };
  download(`triad-cube-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
  sfx.play('chime', { gain: 0.5 });
  toast({ kind: 'ok', text: 'Cube exported' });
}

export function exportCubeCSV() {
  const traits = store.traits;
  const header = ['trait', 'ranker', 'target', 'value', 'confidence', 'source'];
  const rows = store.scores.map(s => {
    const t = traits.find(x => x.id === s.traitId);
    const r = store.people.find(x => x.id === s.rankerId);
    const g = store.people.find(x => x.id === s.targetId);
    return [t?.name || '', r?.fullName || '', g?.fullName || '', s.value, s.confidence ?? '', s.source || ''];
  });
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  download(`triad-cube-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
  toast({ kind: 'ok', text: 'CSV exported' });
}

export function importCubeFile() {
  const input = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const ok = await confirm({
        title: 'Import cube?',
        text: `${json.people?.length || 0} people · ${json.traits?.length || 0} traits · ${json.scores?.length || 0} cells`,
        confirmLabel: 'Import'
      });
      if (!ok) return;
      await store.importCube(json);
      toast({ kind: 'ok', text: 'Cube imported' });
      bus.emit(EV.DATA_CHANGED, { reason: 'import' });
    } catch (err) {
      toast({ kind: 'error', text: `Import failed: ${err.message}` });
    } finally {
      input.remove();
    }
  });
  input.click();
}

// --------------------------------------------------------------- db console
let schemaCache = null;
async function fetchSchema() {
  if (schemaCache) return schemaCache;
  try {
    const res = await fetch('supabase/schema.sql');
    schemaCache = res.ok ? await res.text() : '';
  } catch { schemaCache = ''; }
  return schemaCache;
}

async function fetchSeed() {
  try {
    const res = await fetch('supabase/seed.sql');
    return res.ok ? await res.text() : '';
  } catch { return ''; }
}

export async function openDbConsole() {
  const body = h('div', { class: 'grid gap-4' });
  const m = modal({
    title: 'Database console',
    iconName: 'database',
    size: 'lg',
    body,
    flush: false
  });

  const schema = await fetchSchema();
  const seed = await fetchSeed();
  const counts = store.probe?.counts || {};
  const probe = store.probe || { ok: false, missing: [] };

  body.append(
    h('div', { class: 'flex items-center gap-2 wrap' },
      h('span', { class: `pill ${store.mode === 'cloud' ? 'pill--accent' : ''}` }, store.mode),
      h('span', { class: `pill ${probe.ok ? 'pill--good' : 'pill--bad'}` }, probe.ok ? 'schema present' : 'schema missing'),
      h('span', { class: 'pill' }, `${(store.probe?.missing || []).length} missing`),
      h('div', { style: { flex: 1 } }),
      h('a', { class: 'btn btn--sm', href: `${SUPABASE_URL.replace('.supabase.co', '.supabase.co')}`, target: '_blank', rel: 'noopener' }, SUPABASE_URL.replace('https://', ''))
    ),
    h('div', { class: 'db-grid' },
      ...Object.values(TABLES).filter(t => t.startsWith('mtx_') || t === 'openrouter_models' || t === 'people').map(table => {
        const count = counts[table];
        const missing = (probe.missing || []).includes(table);
        return h('div', { class: 'db-item' },
          h('i', { class: missing ? 'missing' : count === null || count === undefined ? 'unknown' : 'ok' }),
          h('b', {}, table),
          h('span', {}, missing ? 'missing' : count === null || count === undefined ? '—' : String(count))
        );
      })
    ),
    h('div', { class: 'auth-note' },
      icon('info', { size: 13 }),
      h('span', {}, `Run schema.sql in the Supabase SQL editor for this project, then seed.sql for demo data. The anon key cannot create tables — that is a deliberate Postgres permission.`)
    ),
    h('div', { class: 'flex gap-2 wrap' },
      h('button', {
        class: 'btn btn--sm btn--primary',
        onClick: async () => {
          const ok = await copyText(schema || '');
          toast({ kind: ok ? 'ok' : 'error', text: ok ? 'Schema copied' : 'Copy failed' });
        }
      }, icon('copy', { size: 12 }), 'Copy schema'),
      h('button', { class: 'btn btn--sm', onClick: () => download('schema.sql', schema, 'text/plain') }, icon('download', { size: 12 }), 'Download schema'),
      h('button', {
        class: 'btn btn--sm',
        onClick: async () => { const ok = await copyText(seed || ''); toast({ kind: ok ? 'ok' : 'error', text: ok ? 'Seed copied' : 'Copy failed' }); }
      }, icon('copy', { size: 12 }), 'Copy seed'),
      h('button', {
        class: 'btn btn--sm',
        onClick: async () => {
          const label = busyOverlay('Probing supabase');
          try {
            store.probe = await remote.probe();
            toast({ kind: 'ok', text: store.probe.ok ? 'All matrix tables found' : `Missing ${store.probe.missing.length} tables` });
            m.close();
            openDbConsole();
          } catch (err) { toast({ kind: 'error', text: err.message }); }
          finally { label.close(); }
        }
      }, icon('refresh', { size: 12 }), 'Re-probe'),
      h('div', { style: { flex: 1 } }),
      h('button', {
        class: 'btn btn--sm', onClick: async () => {
          try {
            const data = await remote.exportCube();
            download('cloud-cube.json', JSON.stringify(data, null, 2), 'application/json');
            toast({ kind: 'ok', text: 'Cloud cube exported via RPC' });
          } catch (err) { toast({ kind: 'error', text: err.message }); }
        }
      }, icon('cloud', { size: 12 }), 'RPC export')
    ),
    h('div', { class: 'code-block' },
      h('div', { class: 'code-block__head' },
        h('span', {}, 'supabase/schema.sql'),
        h('button', { class: 'btn btn--sm btn--ghost', onClick: () => copyText(schema) }, icon('copy', { size: 11 }), 'copy')
      ),
      h('pre', {}, (schema || '-- schema.sql not found').slice(0, 6000))
    )
  );
  return m;
}

// ------------------------------------------------------------------- AI runs
export async function aiBrief() {
  const ctx = buildContext(store.cube);
  const m = modal({
    title: 'AI brief',
    iconName: 'ai',
    size: 'md',
    body: h('div', { class: 'grid gap-3' },
      h('div', { class: 'ai-typing' }, h('i'), h('i'), h('i')),
      h('div', { class: 'msg__bubble' }, '…')
    ),
    footer: h('div', { class: 'flex gap-2' },
      h('button', { class: 'btn btn--sm btn--ghost', onClick: () => go('lab') }, 'Open lab'),
      h('button', { class: 'btn btn--sm', onClick: () => m.close() }, 'Close')
    )
  });
  const out = m.body.querySelector('.msg__bubble');
  out.textContent = '';
  try {
    const res = await oneShot({
      kind: 'brief',
      prompt: 'Write the executive brief for this cube: headline signal, strongest person and why, most contested pair, thinnest coverage, and one decision. Five short paragraphs, numbers inline.',
      context: contextToPrompt(ctx),
      stream: true,
      onDelta: (chunk) => { if (chunk) out.textContent += chunk; }
    });
    out.innerHTML = renderMarkdownLite(res.text || '(empty)');
    sfx.play('glassSoft');
  } catch (err) {
    out.textContent = `Failed: ${err.message}`;
  }
  if (!hasKey()) toast({ kind: 'warn', text: 'Offline analyst used — add a key in AI Lab for real models' });
}

export async function aiAnalyzeSelection() {
  const sel = store.selection;
  const ctx = buildContext(store.cube);
  const trait = sel.traitId ? store.cube.traitById.get(sel.traitId) : null;
  const person = sel.personId ? store.cube.personById.get(sel.personId) : null;
  const prompt = trait && person
    ? `Analyse the ${trait.name} scores for ${person.fullName} against the whole cube. What is unusual, what is missing, and what would change the conclusion?`
    : trait
      ? `Analyse the ${trait.name} stack: who scores high, who scores low, how wide is disagreement, and what does it mean?`
      : person
        ? `Analyse ${person.fullName}: received profile, what they give others, and the biggest asymmetry.`
        : 'Summarise the cube and name the three most important patterns.';

  const m = modal({
    title: 'Analysis',
    iconName: 'ai',
    size: 'md',
    body: h('div', { class: 'grid gap-3' }, h('div', { class: 'msg__bubble' }, '…'))
  });
  const out = m.body.querySelector('.msg__bubble');
  out.textContent = '';
  try {
    const res = await oneShot({ prompt, kind: 'analyze', context: contextToPrompt(ctx), stream: true, onDelta: c => { if (c) out.textContent += c; } });
    out.innerHTML = renderMarkdownLite(res.text || '(empty)');
  } catch (err) { out.textContent = `Failed: ${err.message}`; }
}

export async function aiGenerateTraits() {
  const ctx = buildContext(store.cube);
  const m = modal({
    title: 'Generate traits',
    iconName: 'wand',
    size: 'md',
    body: h('div', { class: 'grid gap-3' }, h('div', { class: 'msg__bubble' }, 'Thinking about orthogonal dimensions…'))
  });
  const out = m.body.querySelector('.msg__bubble');
  try {
    const res = await oneShot({
      kind: 'traits',
      prompt: 'Generate 6 new scoring traits for this group that are orthogonal to the existing ones. Return ONLY a JSON array of objects with keys name, key, category, description, polarity (1 or -1), weight (0.5-1.5). Categories: character, work, mind, social, leadership, craft, energy, risk.',
      context: contextToPrompt(ctx),
      stream: false
    });
    const parsed = extractJSON(res.text);
    if (!Array.isArray(parsed) || !parsed.length) {
      out.textContent = res.text || 'Model returned no JSON.';
      return;
    }
    out.innerHTML = '';
    out.appendChild(h('div', { class: 'eyebrow mb-2' }, `${parsed.length} proposals`));
    for (const t of parsed) {
      out.appendChild(h('div', { class: 'list-row' },
        h('div', { class: 'list-row__main' }, h('b', {}, t.name || t.key), h('span', {}, `${t.category || 'general'} · ×${t.weight ?? 1}`)),
        h('button', {
          class: 'btn btn--sm',
          onClick: async (e) => {
            try {
              await store.addTrait({
                name: t.name, key: t.key, category: t.category, description: t.description,
                polarity: t.polarity ?? 1, weight: t.weight ?? 1, color: '#5ef2d6', icon: 'spark'
              });
              e.currentTarget.textContent = 'added';
              e.currentTarget.classList.add('is-active');
              sfx.play('glassSoft');
            } catch (err) { toast({ kind: 'error', text: err.message }); }
          }
        }, 'Add')
      ));
    }
    out.appendChild(h('button', {
      class: 'btn btn--sm btn--primary mt-2',
      onClick: async () => {
        let n = 0;
        for (const t of parsed) {
          try {
            await store.addTrait({ name: t.name, key: t.key, category: t.category, description: t.description, polarity: t.polarity ?? 1, weight: t.weight ?? 1, color: '#5ef2d6', icon: 'spark' });
            n++;
          } catch { /* duplicate keys */ }
        }
        toast({ kind: 'ok', text: `${n} traits added` });
        sfx.play('milestone');
        m.close();
      }
    }, `Add all ${parsed.length}`));
  } catch (err) {
    out.textContent = `Failed: ${err.message}`;
  }
}

// -------------------------------------------------------------- bus wiring
export function installGlobalActions() {
  bus.on('action:export-json', exportCubeJSON);
  bus.on('action:export-csv', exportCubeCSV);
  bus.on('action:import-json', importCubeFile);
  bus.on('action:db-console', () => openDbConsole());
  bus.on('action:ai-key', () => go('lab'));
  bus.on('action:ai-brief', aiBrief);
  bus.on('action:ai-analyze', aiAnalyzeSelection);
  bus.on('action:ai-traits', aiGenerateTraits);
  bus.on('action:push-cloud', async () => {
    const busy = busyOverlay('Pushing local cube');
    try {
      const n = await store.pushLocalToCloud();
      toast({ kind: 'ok', text: `${n} cells pushed to cloud` });
      sfx.play('success');
    } catch (err) {
      toast({ kind: 'error', text: err.message });
    } finally { busy.close(); }
  });
  bus.on('action:pull-cloud', async () => {
    try { await store.pullCloudToLocal(); toast({ kind: 'ok', text: 'Cloud cube copied locally' }); }
    catch (err) { toast({ kind: 'error', text: err.message }); }
  });
  bus.on('action:install-library', async () => {
    try {
      const n = await store.installTraitLibrary();
      toast({ kind: 'ok', text: `${n} traits installed` });
      bus.emit(EV.DATA_CHANGED, { reason: 'library' });
    } catch (err) { toast({ kind: 'error', text: err.message }); }
  });
  bus.on('action:new-person', () => go('people'));
  bus.on('action:new-trait', () => go('traits'));
  bus.on('action:state', () => {
    verifyState();
  });
}

export function verifyState() {
  const issues = [];
  if (!store.people.length) issues.push('no people');
  if (!store.traits.length) issues.push('no traits');
  if (!store.scores.length) issues.push('no scores');
  const payload = `mode=${store.mode} people=${store.people.length} traits=${store.traits.length} scores=${store.scores.length} key=${hasKey()} model=${aiSettings.config.model}`;
  toast({ kind: issues.length ? 'warn' : 'ok', title: 'State', text: `${payload}${issues.length ? ` · ${issues.join(', ')}` : ''}` });
}
