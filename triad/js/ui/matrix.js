// ---------------------------------------------------------------------------
// matrix.js — the 2D slice renderer + inline cell editor.
// ---------------------------------------------------------------------------
import { h, clamp, round, clear, download } from '../core/dom.js';
import { icon } from './icons.js';
import { avatar, traitChip, scoreChip } from './bits.js';
import { scoreColor, normalise, polarise, stats, cellKey } from '../core/math.js';
import { fmtScore, fmtPct } from '../core/format.js';
import { sfx } from './sounds.js';
import { popover, closePopover } from './overlay.js';
import { bus, EV } from '../core/bus.js';

// ---------------------------------------------------------------------------
export function createMatrix(cfg) {
  const {
    cube, mode = 'trait', axisId = null,
    editable = true,
    onHeaderClick = null,
    onChange = null,
    cellSize = 44,
    heat = 'value'
  } = cfg;

  let state = { mode, axisId, cellSize, heat, transposed: false, query: '' };
  const wrap = h('div', { class: 'matrix-wrap' });
  const head = h('div', { class: 'matrix-wrap__head' });
  const axisBar = h('div', { class: 'matrix-axis' });
  const scroll = h('div', { class: 'matrix-scroll' });
  const legend = h('div', { class: 'matrix-legend' });
  wrap.append(head, axisBar, scroll, legend);
  let activeCell = null;

  // ------------------------------------------------------------------ header
  function renderHead() {
    clear(head);
    const title = h('div', { class: 'matrix-wrap__title' });
    const actions = h('div', { class: 'matrix-wrap__actions' });

    if (state.mode === 'trait') {
      const trait = cube.traitById.get(state.axisId) || cube.traits[0];
      title.append(h('h3', {}, icon('layers', { size: 14 }), `Trait stack · ${trait?.name || '—'}`));
    } else if (state.mode === 'ranker') {
      const person = cube.personById.get(state.axisId);
      title.append(h('h3', {}, icon('user', { size: 14 }), `Ranker stack · ${person?.fullName || '—'}`));
    } else {
      const person = cube.personById.get(state.axisId);
      title.append(h('h3', {}, icon('target', { size: 14 }), `Target stack · ${person?.fullName || '—'}`));
    }

    const sizes = [
      { v: 34, label: 'S' }, { v: 44, label: 'M' }, { v: 56, label: 'L' }
    ];
    actions.append(
      h('div', { class: 'seg' }, ...sizes.map(s => h('button', {
        class: state.cellSize === s.v ? 'is-active' : '',
        onClick: () => { state.cellSize = s.v; render(); }
      }, s.label))),
      h('button', {
        class: `btn btn--sm btn--ghost ${state.transposed ? 'is-active' : ''}`,
        title: 'Transpose rows and columns',
        onClick: () => { state.transposed = !state.transposed; render(); }
      }, icon('refresh', { size: 12 }), 'Flip'),
      h('button', {
        class: 'btn btn--sm btn--ghost', title: 'Heat metric',
        onClick: (e) => popover(e.currentTarget, [
          { label: 'Heat' },
          { text: 'Raw value', iconName: 'palette', onClick: () => { state.heat = 'value'; render(); } },
          { text: 'Versus consensus', iconName: 'scale', onClick: () => { state.heat = 'divergence'; render(); } },
          { text: 'Confidence', iconName: 'shield', onClick: () => { state.heat = 'confidence'; render(); } },
          { separator: true },
          { text: 'Copy as CSV', iconName: 'copy', onClick: copyCSV },
          { text: 'Download CSV', iconName: 'download', onClick: () => downloadCSV() }
        ])
      }, icon('palette', { size: 12 }), 'Heat'),
      h('button', {
        class: 'btn btn--sm btn--ghost', title: 'Export',
        onClick: () => downloadCSV()
      }, icon('download', { size: 12 }))
    );

    head.append(title, actions);
  }

  function renderAxisBar() {
    clear(axisBar);
    const rowsLabel = state.mode === 'trait' ? 'Rankers' : state.mode === 'ranker' ? 'Targets' : 'Rankers';
    const colsLabel = state.mode === 'trait' ? 'Targets' : 'Traits';
    axisBar.append(
      h('span', {}, 'rows'), h('b', {}, rowsLabel),
      h('span', { class: 'matrix-axis__arrow' }, '↓'),
      h('span', {}, 'cols'), h('b', {}, colsLabel),
      h('span', { class: 'matrix-axis__arrow' }, '→'),
      h('span', { style: { marginLeft: 'auto' } }, `${cube.scores.length} cells indexed`)
    );
  }

  // -------------------------------------------------------------------- body
  function slice() {
    if (state.mode === 'trait') {
      const trait = cube.traitById.get(state.axisId) || cube.traits[0];
      return {
        rows: cube.people, cols: cube.people, trait,
        value: (r, c) => (r.id === c.id ? null : cube.value(trait?.id, r.id, c.id)),
        cell: (r, c) => (r.id === c.id ? null : cube.get(trait?.id, r.id, c.id)),
        set: (r, c, v) => cube && onChange?.({ traitId: trait?.id, rankerId: r.id, targetId: c.id, value: v })
      };
    }
    if (state.mode === 'ranker') {
      const ranker = cube.personById.get(state.axisId);
      return {
        rows: cube.people.filter(p => p.id !== ranker?.id),
        cols: cube.traits,
        rankerId: ranker?.id,
        value: (r, c) => cube.value(c.id, ranker?.id, r.id),
        cell: (r, c) => cube.get(c.id, ranker?.id, r.id),
        set: (r, c, v) => onChange?.({ traitId: c.id, rankerId: ranker?.id, targetId: r.id, value: v })
      };
    }
    const target = cube.personById.get(state.axisId);
    return {
      rows: cube.people.filter(p => p.id !== target?.id),
      cols: cube.traits,
      targetId: target?.id,
      value: (r, c) => cube.value(c.id, r.id, target?.id),
      cell: (r, c) => cube.get(c.id, r.id, target?.id),
      set: (r, c, v) => onChange?.({ traitId: c.id, rankerId: r.id, targetId: target?.id, value: v })
    };
  }

  function render() {
    renderHead();
    renderAxisBar();
    clear(scroll);
    clear(legend);
    wrap.style.setProperty('--cell', `${state.cellSize}px`);
    wrap.style.setProperty('--head-w', state.mode === 'trait' ? '190px' : '200px');

    const s = slice();
    const rows = state.transposed ? s.cols : s.rows;
    const cols = state.transposed ? s.rows : s.cols;
    if (!rows?.length || !cols?.length) {
      scroll.appendChild(h('div', { class: 'empty', style: { margin: '20px' } },
        icon('grid', { size: 26 }),
        h('b', {}, 'Empty slice'),
        h('p', {}, 'Add traits and people to populate this table.')
      ));
      return;
    }

    const table = h('table', { class: 'matrix is-crosshair' });
    const thead = h('thead');
    const headRow = h('tr');
    const corner = h('th', {},
      h('div', { style: { padding: '8px' } },
        h('div', { class: 'eyebrow' }, 'rows × cols'),
        h('div', { class: 'tiny muted', style: { marginTop: '2px' } }, `${rows.length} × ${cols.length}`)
      )
    );
    headRow.appendChild(corner);

    for (const col of cols) {
      const isPerson = 'fullName' in col;
      const th = h('th', {},
        h('div', {
          class: 'col-head',
          onClick: () => onHeaderClick?.(col, isPerson ? 'person' : 'trait')
        },
          isPerson
            ? h('div', { class: 'col-head__avatar' }, avatar(col, { size: 'sm' }))
            : h('div', { class: 'col-head__avatar' }, traitChip(col, {})),
          h('div', { class: 'col-head__name', title: isPerson ? col.fullName : col.name }, isPerson ? col.fullName : col.name),
          h('div', { class: 'col-head__meta' }, isPerson ? (col.department || '—') : `×${Number(col.weight ?? 1).toFixed(1)}`)
        )
      );
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = h('tbody');
    rows.forEach((row) => {
      const tr = h('tr');
      const isRowPerson = 'fullName' in row;
      const rowHead = h('th', {},
        h('div', { class: 'row-head', onClick: () => onHeaderClick?.(row, isRowPerson ? 'person' : 'trait') },
          isRowPerson ? avatar(row, { size: 'sm' }) : null,
          h('div', { class: 'row-head__txt' },
            h('b', {}, isRowPerson ? row.fullName : row.name),
            h('span', {}, isRowPerson ? (row.jobTitle || row.department || 'person') : `${row.category} · trait`)
          ),
          h('span', { class: 'row-head__mean' }, rowMean(row, cols, s))
        )
      );
      tr.appendChild(rowHead);

      for (const col of cols) {
        const r = state.transposed ? col : row;
        const c = state.transposed ? row : col;
        const td = h('td');
        const value = s.value(r, c);
        const cellEl = buildCell({ r, c, value, cell: s.cell(r, c), s });
        td.appendChild(cellEl);
        td.addEventListener('pointerenter', () => highlight(tr, td));
        td.addEventListener('pointerleave', () => clearHighlight());
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // footer aggregates
    const tfoot = h('tfoot');
    const frow = h('tr');
    frow.appendChild(h('th', {}, 'column mean'));
    for (const col of cols) {
      const r = state.transposed ? col : null;
      const c = state.transposed ? null : col;
      let values;
      if (state.mode === 'trait') {
        values = rows.map(rr => s.value(state.transposed ? col : rr, state.transposed ? rr : col)).filter(v => v !== null);
      } else {
        values = rows.map(rr => s.value(state.transposed ? col : rr, state.transposed ? rr : col)).filter(v => v !== null);
      }
      const m = stats(values).mean;
      frow.appendChild(h('td', { style: { textAlign: 'center' } }, m ? fmtScore(m) : '·'));
    }
    tfoot.appendChild(frow);
    table.appendChild(tfoot);

    scroll.appendChild(table);
    renderLegend();
    buildBulkBar();
  }

  function rowMean(row, cols, s) {
    const vals = cols.map(c => s.value(state.transposed ? c : row, state.transposed ? row : c)).filter(v => v !== null && v !== undefined);
    if (!vals.length) return h('span', { class: 'dim' }, '—');
    const m = stats(vals).mean;
    return h('span', { class: 'mono', style: { color: scoreColor(normalise(m, 0, 10), 1) } }, fmtScore(m));
  }

  function heatFor(value, cellData, trait) {
    if (value === null || value === undefined) return null;
    if (state.heat === 'confidence') {
      const conf = cellData?.confidence ?? 0.75;
      return scoreColor(clamp(conf, 0, 1), 0.85);
    }
    if (state.heat === 'divergence') {
      const consensus = trait ? cube.consensusOf(trait.id, cellData?.targetId) : null;
      if (!consensus) return scoreColor(normalise(value, 0, 10), 0.75);
      const delta = Number(value) - consensus.mean;
      const t = clamp(0.5 + delta / 8, 0, 1);
      return scoreColor(t, 0.85);
    }
    const min = trait?.min ?? 0, max = trait?.max ?? 10;
    return scoreColor(normalise(Number(value), min, max), 0.9);
  }

  function buildCell({ r, c, value, cell, s }) {
    const trait = state.mode === 'trait' ? s.trait : (state.transposed ? r : c);
    const isEmpty = value === null || value === undefined;
    const isSelf = state.mode === 'trait' && r.id === c.id;
    const el = h('div', {
      class: `cell ${isEmpty && !isSelf ? 'cell--empty' : ''} ${isSelf ? 'cell--diag' : ''}`,
      tabindex: isSelf ? '-1' : '0',
      role: 'button',
      'aria-label': isSelf ? 'self' : `${value ?? 'unrated'}`,
      title: isSelf ? 'self — not rated' : isEmpty ? 'Click to rate' : `${fmtScore(value)}${cell?.note ? ` · ${cell.note}` : ''}`
    });
    if (isSelf) return el;

    if (!isEmpty) {
      el.style.background = heatFor(value, cell, trait);
      el.textContent = fmtScore(value);
      const micro = h('div', { class: 'cell__micro' }, h('i', { style: { width: `${clamp((cell?.confidence ?? 0.75) * 100, 0, 100)}%` } }));
      el.appendChild(micro);
      if (cell?.note) el.appendChild(h('span', { class: 'cell__flag' }));
    }

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      setActive(el);
      openEditor(el, { r, c, value, cell, s, trait });
    });
    el.addEventListener('keydown', (e) => {
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (keys.includes(e.key)) {
        e.preventDefault();
        moveFocus(el, e.key);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setActive(el);
        openEditor(el, { r, c, value, cell, s, trait });
      } else if (e.key === '+' || e.key === '=' || e.key === '-') {
        e.preventDefault();
        if (!editable) return;
        const step = e.shiftKey ? 1 : 0.5;
        const base = value ?? 5;
        const next = clamp(base + (e.key === '-' ? -step : step), 0, 10);
        commit({ r, c, value: next, s, el });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (!editable || isEmpty) return;
        onChange?.({ ...cellTarget(r, c, s), value: null, remove: true });
        el.classList.add('cell--empty');
        el.textContent = '';
        el.style.background = '';
      }
    });
    return el;
  }

  function cellTarget(r, c, s) {
    if (state.mode === 'trait') return { traitId: s.trait?.id, rankerId: r.id, targetId: c.id };
    if (state.mode === 'ranker') return { traitId: (state.transposed ? r : c).id, rankerId: s.rankerId ?? state.axisId, targetId: (state.transposed ? c : r).id };
    return { traitId: (state.transposed ? r : c).id, rankerId: (state.transposed ? c : r).id, targetId: state.axisId };
  }

  function setActive(el) {
    if (activeCell) activeCell.classList.remove('is-active');
    activeCell = el;
    el.classList.add('is-active');
  }

  function moveFocus(el, key) {
    const td = el.closest('td');
    const tr = td?.parentElement;
    if (!td || !tr) return;
    let target = null;
    if (key === 'ArrowRight') target = td.nextElementSibling?.querySelector('.cell');
    if (key === 'ArrowLeft') target = td.previousElementSibling?.querySelector('.cell');
    if (key === 'ArrowDown') target = tr.nextElementSibling?.children[td.cellIndex]?.querySelector('.cell');
    if (key === 'ArrowUp') target = tr.previousElementSibling?.children[td.cellIndex]?.querySelector('.cell');
    if (target) { target.focus(); setActive(target); }
  }

  function highlight(tr, td) {
    clearHighlight();
    tr.classList.add('hl');
    td.classList.add('hl');
  }
  function clearHighlight() {
    scroll.querySelectorAll('.hl').forEach(el => el.classList.remove('hl'));
  }

  // ------------------------------------------------------------------ editor
  function openEditor(anchor, ctx) {
    closePopover();
    if (!editable) {
      openReadonlyCard(anchor, ctx);
      return;
    }
    const { r, c, value, cell, s, trait } = ctx;
    const isPersonRow = 'fullName' in r;
    const rankerName = state.mode === 'trait' ? r.fullName : state.mode === 'ranker' ? cube.personById.get(state.axisId)?.fullName : (state.transposed ? c?.fullName : r.fullName);
    const targetName = state.mode === 'trait' ? c.fullName : state.mode === 'ranker' ? (state.transposed ? c?.fullName : r.fullName) : cube.personById.get(state.axisId)?.fullName;
    const traitObj = state.mode === 'trait' ? trait : (state.transposed ? r : c);

    let current = value ?? 5;
    const editor = h('div', { class: 'cell-editor' });
    const valueEl = h('div', { class: 'cell-editor__value' }, h('span', {}, fmtScore(current)), h('small', {}, '/ 10'));
    const range = h('input', {
      type: 'range', min: 0, max: 10, step: 0.1, value: current,
      onInput: (e) => {
        current = Number(e.target.value);
        valueEl.firstChild.textContent = fmtScore(current);
        e.target.style.setProperty('--fill', `${current * 10}%`);
        sfx.haptic('tick');
      }
    });
    range.style.setProperty('--fill', `${current * 10}%`);
    const note = h('textarea', {
      class: 'textarea cell-editor__note',
      placeholder: 'note (optional)',
      value: cell?.note || ''
    });

    const quick = h('div', { class: 'cell-editor__quick' },
      ...Array.from({ length: 11 }, (_, i) => h('button', {
        onClick: () => {
          current = i;
          range.value = String(i);
          range.style.setProperty('--fill', `${i * 10}%`);
          valueEl.firstChild.textContent = fmtScore(i);
          sfx.play('tick', { gain: 0.5 });
        }
      }, String(i)))
    );

    const commitBtn = h('button', {
      class: 'btn btn--primary btn--sm',
      onClick: () => {
        commit({ r, c, value: current, note: note.value, s, el: anchor, cell });
        close();
      }
    }, icon('check', { size: 12 }), 'Save');

    editor.append(
      h('div', { class: 'cell-editor__head' },
        h('div', { class: 'cell-editor__who' },
          h('b', {}, targetName || 'Target'),
          h('span', {}, `rated by ${rankerName || '—'}`)
        ),
        traitObj ? traitChip(traitObj, {}) : null
      ),
      valueEl,
      range,
      h('div', { class: 'cell-editor__scale' }, h('span', {}, '0'), h('span', {}, '10')),
      quick,
      note,
      h('div', { class: 'cell-editor__foot' },
        h('button', {
          class: 'btn btn--sm btn--danger',
          onClick: () => {
            onChange?.({ ...cellTarget(r, c, s), value: null, remove: true });
            close();
          }
        }, icon('trash', { size: 12 }), 'Clear'),
        h('div', { class: 'toolbar__spacer', style: { flex: 1 } }),
        h('button', { class: 'btn btn--sm', onClick: () => close() }, 'Cancel'),
        commitBtn
      )
    );

    document.body.appendChild(editor);
    const rect = anchor.getBoundingClientRect();
    const ew = 292, eh = editor.offsetHeight;
    let left = rect.right + 12;
    if (left + ew > window.innerWidth - 10) left = rect.left - ew - 12;
    if (left < 10) left = clamp(rect.left, 10, window.innerWidth - ew - 10);
    let top = rect.top - 20;
    if (top + eh > window.innerHeight - 10) top = window.innerHeight - eh - 10;
    if (top < 10) top = 10;
    editor.style.left = `${left}px`;
    editor.style.top = `${top}px`;

    const onOutside = (e) => {
      if (!editor.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitBtn.click(); }
    };
    setTimeout(() => document.addEventListener('pointerdown', onOutside), 0);
    document.addEventListener('keydown', onKey, true);

    function close() {
      editor.remove();
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('keydown', onKey, true);
    }
    range.focus();
  }

  function openReadonlyCard(anchor, { r, c, value, cell, s, trait }) {
    const card = h('div', { class: 'hovercard is-on', style: { position: 'fixed', opacity: '1', transform: 'none' } });
    card.append(
      h('div', { class: 'eyebrow mb-2' }, 'cell'),
      h('div', { class: 'flex items-center gap-2' },
        scoreChip(value, trait),
        h('div', { class: 'small muted' }, `${cell?.source || 'none'} · ${cell?.confidence ? fmtPct(cell.confidence) : '—'}`)
      )
    );
    document.body.appendChild(card);
    const rect = anchor.getBoundingClientRect();
    card.style.left = `${clamp(rect.right + 8, 8, window.innerWidth - 270)}px`;
    card.style.top = `${clamp(rect.top - 20, 8, window.innerHeight - 140)}px`;
    setTimeout(() => card.remove(), 2400);
  }

  async function commit({ r, c, value, note = '', s, el, cell }) {
    const target = cellTarget(r, c, s);
    if (!target.traitId || !target.rankerId || !target.targetId) return;
    if (target.rankerId === target.targetId) return;
    await onChange?.({ ...target, value, note, confidence: cell?.confidence ?? 0.75 });
    el.style.background = heatFor(value, { ...cell, ...target }, state.mode === 'trait' ? s.trait : (state.transposed ? r : c));
    el.textContent = fmtScore(value);
    el.classList.remove('cell--empty');
    el.classList.add('is-pulse');
    setTimeout(() => el.classList.remove('is-pulse'), 500);
    sfx.play('glass');
    sfx.haptic('commit');
    const pop = h('div', { class: 'score-pop', style: { left: `${el.getBoundingClientRect().left + 12}px`, top: `${el.getBoundingClientRect().top - 6}px` } }, fmtScore(value));
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 760);
  }

  // ------------------------------------------------------------------ legend
  function renderLegend() {
    legend.append(
      h('div', { class: 'heat-legend' },
        h('span', {}, '0'), h('div', { class: 'heat-legend__bar' }), h('span', {}, '10')
      ),
      h('span', { class: 'tiny dim' }, state.heat === 'divergence' ? 'colour = distance from consensus' : state.heat === 'confidence' ? 'colour = rater confidence' : 'colour = score'),
      h('div', { style: { flex: 1 } }),
      h('div', { class: 'legend' },
        h('div', { class: 'legend__item' }, h('i', { class: 'legend__swatch', style: { background: 'repeating-linear-gradient(45deg, rgba(255,255,255,.1) 0 2px, transparent 2px 4px)' } }), 'self'),
        h('div', { class: 'legend__item' }, h('i', { class: 'legend__swatch', style: { border: '1px dashed var(--line-3)' } }), 'unrated')
      )
    );
  }

  // -------------------------------------------------------------------- bulk
  let selection = new Set();
  let bulkbar = null;
  function buildBulkBar() {
    bulkbar?.remove();
    bulkbar = h('div', { class: 'bulkbar' },
      h('span', { class: 'bulkbar__count' }, `${selection.size} selected`),
      h('div', { class: 'bulkbar__actions flex gap-1' },
        h('button', { class: 'btn btn--sm', onClick: () => applyBulk('+1') }, '+1'),
        h('button', { class: 'btn btn--sm', onClick: () => applyBulk('-1') }, '−1'),
        h('button', { class: 'btn btn--sm', onClick: () => applyBulk('set:5') }, '= 5'),
        h('button', { class: 'btn btn--sm btn--ghost', onClick: () => { selection.clear(); updateBulk(); } }, 'Clear')
      )
    );
    document.body.appendChild(bulkbar);
  }

  function applyBulk(op) {
    for (const key of selection) {
      const [traitId, rankerId, targetId] = key.split('|');
      const current = cube.value(traitId, rankerId, targetId) ?? 5;
      const value = op === '+1' ? clamp(current + 1, 0, 10) : op === '-1' ? clamp(current - 1, 0, 10) : 5;
      onChange?.({ traitId, rankerId, targetId, value });
    }
    selection.clear();
    updateBulk();
    sfx.play('glass');
  }

  function updateBulk() {
    if (!bulkbar) return;
    bulkbar.classList.toggle('is-on', selection.size > 0);
    bulkbar.querySelector('.bulkbar__count').textContent = `${selection.size} selected`;
  }

  // ------------------------------------------------------------------- export
  function matrixCSV() {
    const s = slice();
    const rows = state.transposed ? s.cols : s.rows;
    const cols = state.transposed ? s.rows : s.cols;
    const header = ['', ...cols.map(c => c.fullName || c.name)];
    const lines = [header];
    for (const row of rows) {
      lines.push([row.fullName || row.name, ...cols.map(c => {
        const v = s.value(state.transposed ? c : row, state.transposed ? row : c);
        return v === null || v === undefined ? '' : v;
      })]);
    }
    return lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  function copyCSV() {
    navigator.clipboard?.writeText(matrixCSV());
    bus.emit(EV.TOAST, { kind: 'ok', text: 'CSV copied' });
  }

  function downloadCSV() {
    const name = state.mode === 'trait'
      ? `trait-${cube.traitById.get(state.axisId)?.key || 'slice'}`
      : `${state.mode}-${cube.personById.get(state.axisId)?.slug || 'slice'}`;
    download(`triad-${name}.csv`, matrixCSV(), 'text/csv');
    sfx.play('chime', { gain: 0.5 });
  }

  render();
  const api = {
    el: wrap,
    render,
    setAxis(mode, axisId) { state.mode = mode; state.axisId = axisId; render(); },
    setHeat(mode) { state.heat = mode; render(); },
    destroy() { bulkbar?.remove(); }
  };
  return api;
}

// ---------------------------------------------------------------------------
export function openMatrixModal({ cube, mode, axisId, onChange, title }) {
  return { cube, mode, axisId, onChange, title };
}
