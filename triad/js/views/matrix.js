// ---------------------------------------------------------------------------
// matrix.js view — the three stack views + the editable 2D slice.
// ---------------------------------------------------------------------------
import { h, clear, clamp, debounce } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { store } from '../core/store.js';
import { bus, EV } from '../core/bus.js';
import { go, setQuery } from '../core/nav.js';
import { avatar, traitChip, sectionHead, scoreChip, emptyState, pill } from '../ui/bits.js';
import { createStack } from '../ui/stack3d.js';
import { createMatrix } from '../ui/matrix.js';
import { fmtScore, fmtPct } from '../core/format.js';
import { sfx } from '../ui/sounds.js';
import { toast, modal, popover } from '../ui/overlay.js';
import { scoreColor, normalise } from '../core/math.js';

let activeStack = null;
let activeMatrix = null;
let gridMode = false;

export function matrixView({ params = {} } = {}) {
  const mode = ['trait', 'ranker', 'target'].includes(params.mode) ? params.mode : (store.selection.mode || store.prefs.defaultMode || 'trait');
  const pool = mode === 'trait' ? store.traits : store.people;
  let axisId = params.id || (mode === 'trait' ? store.selection.traitId : store.selection.personId) || pool[0]?.id;
  if (!pool.some(x => x.id === axisId)) axisId = pool[0]?.id;

  const root = h('div', { class: 'view__inner' });
  activeStack?.destroy();
  activeMatrix?.destroy();
  activeStack = null;
  activeMatrix = null;

  if (!store.people.length || !store.traits.length) {
    root.appendChild(emptyState({
      iconName: 'cube', title: 'Cube incomplete',
      text: 'A matrix needs people and traits. Install the library and add people first.',
      action: h('div', { class: 'flex gap-2' },
        h('button', { class: 'btn btn--primary', onClick: () => bus.emit('action:install-library') }, 'Install traits'),
        h('button', { class: 'btn', onClick: () => bus.emit('action:new-person') }, 'Add person'))
    }));
    return root;
  }

  // ------------------------------------------------------------------ header
  const head = h('div', { class: 'page-head' },
    h('div', { class: 'page-head__left' },
      h('div', { class: 'eyebrow' }, `slice · ${mode}-based`),
      h('h1', { class: 'page-title' }, 'The stacks', h('span', { class: 'sup' }, '3D'))
    ),
    h('div', { class: 'page-actions' },
      h('div', { class: 'btn-group' },
        h('button', { class: `btn ${mode === 'trait' ? 'is-active' : ''}`, onClick: () => switchMode('trait') }, icon('layers', { size: 12 }), 'Trait'),
        h('button', { class: `btn ${mode === 'ranker' ? 'is-active' : ''}`, onClick: () => switchMode('ranker') }, icon('user', { size: 12 }), 'Ranker'),
        h('button', { class: `btn ${mode === 'target' ? 'is-active' : ''}`, onClick: () => switchMode('target') }, icon('target', { size: 12 }), 'Target')
      ),
      h('button', { class: 'btn btn--sm', onClick: () => openAxisPicker() }, icon('list', { size: 12 }), 'Axes'),
      h('button', { class: 'btn btn--sm btn--ghost', onClick: () => bus.emit('action:ai-analyze') }, icon('ai', { size: 12 }), 'Ask AI')
    )
  );
  root.appendChild(head);

  // ------------------------------------------------------- axis chip selector
  const axisBar = h('div', { class: 'toolbar', style: { marginBottom: '12px', overflowX: 'auto', flexWrap: 'nowrap' } });
  const axisChips = h('div', { class: 'toolbar__group', style: { flexWrap: 'nowrap' } });
  axisBar.append(axisChips);
  root.appendChild(axisBar);
  renderAxisChips();

  function renderAxisChips() {
    clear(axisChips);
    axisChips.append(h('span', { class: 'eyebrow', style: { marginRight: '6px', whiteSpace: 'nowrap' } }, mode === 'trait' ? 'trait' : 'person'));
    for (const item of pool.slice(0, 24)) {
      const active = item.id === axisId;
      axisChips.appendChild(h('button', {
        class: `chip-btn ${active ? 'is-active' : ''}`,
        style: { whiteSpace: 'nowrap' },
        onClick: () => { axisId = item.id; selectAxis(); },
        title: item.name || item.fullName
      },
        mode === 'trait'
          ? icon(item.icon || 'spark', { size: 12 })
          : avatar(item, { size: 'sm' }),
        (item.name || item.fullName.split(' ')[0]).slice(0, 18)
      ));
    }
    if (pool.length > 24) {
      axisChips.appendChild(h('span', { class: 'pill' }, `+${pool.length - 24}`));
    }
  }

  // ------------------------------------------------------------------ stacks
  const stackHost = h('div', { id: 'stack-host' });
  root.appendChild(stackHost);
  mountStack();

  // 2D slice ---------------------------------------------------------------
  const matrixHost = h('div', { style: { marginTop: 'var(--s-5)' } });
  root.appendChild(matrixHost);
  mountMatrix();

  function itemsForStack() {
    if (mode === 'trait') {
      return store.traits.map(t => ({
        id: t.id,
        name: t.name,
        sub: `${t.category} · ×${Number(t.weight).toFixed(1)}`,
        axis: 'rankers → targets',
        axisSub: `${store.people.length} × ${store.people.length}`,
        rows: store.people.length,
        range: { min: t.min ?? 0, max: t.max ?? 10 },
        matrix: store.cube.traitMatrix(t.id),
        trait: t
      }));
    }
    if (mode === 'ranker') {
      return store.people.map(p => ({
        id: p.id,
        name: p.fullName,
        sub: p.jobTitle || p.department || 'ranker',
        axis: 'targets → traits',
        axisSub: `${Math.max(store.people.length - 1, 0)} × ${store.traits.length}`,
        rows: Math.max(store.people.length - 1, 0),
        range: { min: 0, max: 10 },
        matrix: store.cube.rankerMatrix(p.id),
        person: p
      }));
    }
    return store.people.map(p => ({
      id: p.id,
      name: p.fullName,
      sub: p.jobTitle || p.department || 'target',
      axis: 'rankers → traits',
      axisSub: `${Math.max(store.people.length - 1, 0)} × ${store.traits.length}`,
      rows: Math.max(store.people.length - 1, 0),
      range: { min: 0, max: 10 },
      matrix: store.cube.targetMatrix(p.id),
      person: p
    }));
  }

  function mountStack() {
    clear(stackHost);
    activeStack?.destroy();
    const items = itemsForStack();
    const startIndex = Math.max(0, items.findIndex(i => i.id === axisId));
    activeStack = createStack(stackHost, {
      mode,
      items,
      maxLayers: store.prefs.maxStackLayers || 14,
      inertia: store.prefs.inertia !== false,
      onFocus: (item) => {
        axisId = item.id;
        applySelection(item.id);
        renderAxisChips();
        activeMatrix?.setAxis(mode, item.id);
      },
      onOpen: (item) => openSliceModal(item),
      onFlat: () => { gridMode = true; mountGrid(); }
    });
    if (startIndex > 0) activeStack.focusIndex(startIndex, false);
  }

  function applySelection(id) {
    if (mode === 'trait') store.select({ mode, traitId: id, stackId: id });
    else store.select({ mode, personId: id, stackId: id });
  }

  function mountMatrix() {
    clear(matrixHost);
    activeMatrix?.destroy();
    activeMatrix = createMatrix({
      cube: store.cube,
      mode,
      axisId,
      heat: store.prefs.heat || 'value',
      editable: store.canWrite,
      onChange: async ({ traitId, rankerId, targetId, value, note, remove }) => {
        try {
          if (remove) {
            await store.deleteScore(traitId, rankerId, targetId);
          } else {
            await store.setScore({ traitId, rankerId, targetId, value, note });
          }
          activeStack?.redraw();
          bus.emit(EV.SCORE_SET, {});
        } catch (err) {
          toast({ kind: 'error', text: err.message });
        }
      },
      onHeaderClick: (item, kind) => {
        if (kind === 'person') go('people', { focus: item.id });
        else go('traits', { focus: item.id });
      }
    });
    matrixHost.appendChild(activeMatrix.el);
  }

  function mountGrid() {
    clear(stackHost);
    activeStack?.destroy();
    activeStack = null;
    const items = itemsForStack();
    const grid = h('div', { class: 'stack-shell', style: { height: 'auto', minHeight: '420px' } },
      h('div', { class: 'stack-hud' },
        h('div', { class: 'stack-hud__left' },
          h('div', { class: 'stack-hud__metric' }, h('b', {}, String(items.length)), h('span', {}, 'layers')),
          h('div', { class: 'stack-hud__metric' }, h('b', {}, mode), h('span', {}, 'axis'))
        ),
        h('div', { class: 'stack-hud__right' },
          h('button', { class: 'btn btn--sm btn--ghost', onClick: () => { gridMode = false; mountStack(); renderAxisChips(); } }, icon('cube', { size: 12 }), 'Back to 3D')
        )
      ),
      h('div', { class: 'stack-grid' },
        ...items.slice(0, 60).map(item => {
          const card = h('div', { class: `mini-table ${item.id === axisId ? 'is-active' : ''}`, onClick: () => { axisId = item.id; applySelection(item.id); renderAxisChips(); mountMatrix(); mountGrid(); } });
          const cv = h('canvas');
          card.append(cv, h('div', { class: 'mini-table__foot' }, h('b', {}, item.name), h('span', {}, item.sub)));
          requestAnimationFrame(() => drawMini(cv, item));
          return card;
        })
      )
    );
    stackHost.appendChild(grid);
  }

  function openSliceModal(item) {
    const body = h('div');
    const m = modal({
      title: `${mode === 'trait' ? 'Trait' : mode === 'ranker' ? 'Ranker' : 'Target'} · ${item.name}`,
      iconName: mode === 'trait' ? 'layers' : 'user',
      size: 'wide',
      body,
      flush: true
    });
    const mat = createMatrix({
      cube: store.cube,
      mode,
      axisId: item.id,
      editable: store.canWrite,
      onChange: async (payload) => {
        if (payload.remove) await store.deleteScore(payload.traitId, payload.rankerId, payload.targetId);
        else await store.setScore(payload);
        activeStack?.redraw();
      },
      onHeaderClick: (target, kind) => { m.close(); go(kind === 'person' ? 'people' : 'traits', { focus: target.id }); }
    });
    body.appendChild(mat.el);
    sfx.play('whoosh');
  }

  function openAxisPicker() {
    modal({
      title: `Pick a ${mode === 'trait' ? 'trait' : 'person'} stack`,
      iconName: 'list',
      size: 'sm',
      body: h('div', { class: 'axis-picker' },
        ...pool.map(item => h('button', {
          class: `axis-picker__item ${item.id === axisId ? 'is-active' : ''}`,
          onClick: () => { axisId = item.id; selectAxis(); }
        },
          mode === 'trait' ? icon(item.icon || 'spark', { size: 14 }) : avatar(item, { size: 'sm' }),
          h('b', {}, item.name || item.fullName),
          h('span', { class: 'mono' }, mode === 'trait' ? item.category : (item.department || '—'))
        ))
      )
    });
  }

  function selectAxis() {
    applySelection(axisId);
    renderAxisChips();
    activeMatrix?.setAxis(mode, axisId);
    const idx = itemsForStack().findIndex(i => i.id === axisId);
    if (activeStack && idx >= 0) activeStack.focusIndex(idx, false);
    if (gridMode) mountGrid();
    setQuery({ mode, id: axisId }, { replace: true });
    sfx.play('focus', { gain: 0.4 });
  }

  function switchMode(next) {
    go('matrix', { mode: next });
  }

  applySelection(axisId);

  const off = bus.on(EV.DATA_CHANGED, debounce((payload) => {
    if (payload?.reason === 'score') return;
    if (!document.body.contains(root)) { off(); return; }
    activeStack?.redraw();
  }, 300));
  bus.once(EV.ROUTE, () => { activeStack?.destroy(); activeMatrix?.destroy(); });

  return root;
}

function drawMini(cv, item) {
  const rect = cv.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = rect.width * dpr;
  cv.height = rect.width * 1.15 * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width, hh = rect.width * 1.15;
  ctx.fillStyle = 'rgba(5,8,13,1)';
  ctx.fillRect(0, 0, w, hh);
  const rows = item.matrix.rows || [];
  const cols = item.matrix.cols || [];
  const pad = 4;
  const cw = (w - pad * 2) / Math.max(cols.length, 1);
  const ch = (hh - pad * 2) / Math.max(rows.length, 1);
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols.length; c++) {
      const v = item.matrix.value(rows[r], cols[c]);
      if (v === null || v === undefined) {
        ctx.fillStyle = 'rgba(255,255,255,0.035)';
      } else {
        ctx.fillStyle = scoreColor(normalise(Number(v), item.range?.min ?? 0, item.range?.max ?? 10), 0.9);
      }
      ctx.fillRect(pad + c * cw + 0.5, pad + r * ch + 0.5, Math.max(cw - 1, 1), Math.max(ch - 1, 1));
    }
  }
}
