// ---------------------------------------------------------------------------
// palette.js — command palette (⌘K). Navigation, actions, people, traits.
// ---------------------------------------------------------------------------
import { h, clear, clamp } from '../core/dom.js';
import { icon } from './icons.js';
import { store } from '../core/store.js';
import { bus, EV } from '../core/bus.js';
import { sfx } from './sounds.js';
import { routeMeta } from '../core/router.js';

let openState = null;

export function openPalette({ router, extraCommands = [] } = {}) {
  if (openState) { openState.close(); return; }
  const root = document.getElementById('palette-root');
  if (!root) return;

  const commands = buildCommands(router, extraCommands);
  let filtered = commands;
  let cursor = 0;
  const input = h('input', { placeholder: 'Search routes, people, traits, actions…', autofocus: 'true', spellcheck: 'false' });
  const list = h('div', { class: 'palette__list' });

  const overlay = h('div', { class: 'overlay', style: { background: 'rgba(3,5,9,0.5)', placeItems: 'start center', paddingTop: '10vh' } });
  const panel = h('div', { class: 'palette', role: 'dialog', 'aria-label': 'Command palette' },
    h('div', { class: 'palette__input' }, icon('search', { size: 17 }), input, h('span', { class: 'kbd' }, 'esc')),
    list,
    h('div', { class: 'palette__foot' },
      h('span', {}, h('span', { class: 'kbd' }, '↑↓'), 'navigate'),
      h('span', {}, h('span', { class: 'kbd' }, '↵'), 'run'),
      h('span', { style: { marginLeft: 'auto' } }, `${commands.length} commands`)
    )
  );
  overlay.appendChild(panel);
  root.appendChild(overlay);

  function score(cmd, q) {
    if (!q) return 1;
    const hay = `${cmd.label} ${cmd.hint || ''} ${cmd.group}`.toLowerCase();
    const query = q.toLowerCase();
    if (hay.includes(query)) return 2 + (cmd.label.toLowerCase().startsWith(query) ? 1 : 0);
    // fuzzy
    let i = 0;
    for (const ch of hay) { if (ch === query[i]) i++; if (i === query.length) return 1; }
    return 0;
  }

  function paint() {
    clear(list);
    const q = input.value.trim();
    filtered = commands
      .map(c => ({ ...c, _s: score(c, q) }))
      .filter(c => c._s > 0)
      .sort((a, b) => b._s - a._s)
      .slice(0, 40);
    cursor = clamp(cursor, 0, Math.max(filtered.length - 1, 0));
    if (!filtered.length) {
      list.appendChild(h('div', { class: 'palette__empty' }, 'No match. Try "matrix", "deck", "export"…'));
      return;
    }
    let group = null;
    filtered.forEach((cmd, i) => {
      if (cmd.group !== group) {
        group = cmd.group;
        list.appendChild(h('div', { class: 'palette__group' }, group));
      }
      const item = h('div', {
        class: `palette__item ${i === cursor ? 'is-cursor' : ''}`,
        onClick: () => run(cmd),
        onPointerenter: () => { cursor = i; paintCursor(); }
      },
        icon(cmd.iconName || 'chevronRight', { size: 16 }),
        h('b', {}, cmd.label),
        cmd.hint ? h('span', {}, cmd.hint) : null
      );
      cmd._el = item;
      list.appendChild(item);
    });
  }

  function paintCursor() {
    filtered.forEach((c, i) => c._el?.classList.toggle('is-cursor', i === cursor));
    filtered[cursor]?._el?.scrollIntoView({ block: 'nearest' });
  }

  function run(cmd) {
    close();
    sfx.play('glassSoft');
    setTimeout(() => cmd.run(), 30);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(filtered.length - 1, cursor + 1); paintCursor(); sfx.play('tick', { gain: 0.3 }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(0, cursor - 1); paintCursor(); sfx.play('tick', { gain: 0.3 }); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[cursor]) run(filtered[cursor]);
    }
  }

  input.addEventListener('input', () => { cursor = 0; paint(); });
  overlay.addEventListener('keydown', onKey);
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });

  function close() {
    overlay.remove();
    openState = null;
    sfx.play('whooshBack', { gain: 0.3 });
  }

  openState = { close };
  paint();
  setTimeout(() => input.focus(), 30);
  sfx.play('whoosh', { gain: 0.4 });
  return openState;
}

function buildCommands(router, extra) {
  const cmds = [];
  for (const [key, meta] of Object.entries(routeMeta)) {
    cmds.push({
      group: 'Navigate',
      label: meta.title,
      hint: meta.hint,
      iconName: meta.icon,
      run: () => router?.go(key)
    });
  }
  cmds.push(
    {
      group: 'Cube', label: 'New person', hint: 'people', iconName: 'plus',
      run: () => bus.emit('action:new-person')
    },
    {
      group: 'Cube', label: 'New trait', hint: 'traits', iconName: 'plus',
      run: () => bus.emit('action:new-trait')
    },
    {
      group: 'Cube', label: 'Install trait library', hint: '96 traits', iconName: 'wand',
      run: () => bus.emit('action:install-library')
    },
    {
      group: 'Cube', label: 'Start rating deck', hint: 'deck', iconName: 'layers',
      run: () => router?.go('deck')
    },
    {
      group: 'Cube', label: 'Explode stack view', hint: 'matrix', iconName: 'expand',
      run: () => { router?.go('matrix'); bus.emit('action:explode'); }
    },
    {
      group: 'Data', label: 'Export cube (JSON)', hint: 'download', iconName: 'download',
      run: () => bus.emit('action:export-json')
    },
    {
      group: 'Data', label: 'Export matrix (CSV)', hint: 'download', iconName: 'file',
      run: () => bus.emit('action:export-csv')
    },
    {
      group: 'Data', label: 'Import cube', hint: 'json', iconName: 'upload',
      run: () => bus.emit('action:import-json')
    },
    {
      group: 'Data', label: 'Database console', hint: 'schema', iconName: 'database',
      run: () => bus.emit('action:db-console')
    },
    {
      group: 'Data', label: 'Push local cube to cloud', hint: 'sync', iconName: 'cloud',
      run: () => bus.emit('action:push-cloud')
    },
    {
      group: 'Interface', label: 'Toggle sound', hint: 'audio', iconName: 'volume',
      run: () => bus.emit('action:toggle-sound')
    },
    {
      group: 'Interface', label: 'Toggle haptics', hint: 'vibration', iconName: 'vibrate',
      run: () => bus.emit('action:toggle-haptics')
    },
    {
      group: 'Interface', label: 'Toggle dock', hint: 'inspector', iconName: 'columns',
      run: () => bus.emit('action:toggle-dock')
    },
    {
      group: 'Interface', label: 'Cycle accent', hint: 'theme', iconName: 'palette',
      run: () => bus.emit('action:cycle-accent')
    },
    {
      group: 'Interface', label: 'Play glass clink', hint: 'sound test', iconName: 'soundwave',
      run: () => sfx.play('clink2')
    },
    {
      group: 'AI', label: 'Open AI Lab', hint: 'models', iconName: 'ai',
      run: () => router?.go('lab')
    },
    {
      group: 'AI', label: 'Set OpenRouter key', hint: 'local only', iconName: 'key',
      run: () => bus.emit('action:ai-key')
    }
  );
  for (const person of store.people.slice(0, 24)) {
    cmds.push({
      group: 'People',
      label: person.fullName,
      hint: person.jobTitle || 'person',
      iconName: 'user',
      run: () => { router?.go('people', { focus: person.id }); }
    });
  }
  for (const trait of store.traits.slice(0, 24)) {
    cmds.push({
      group: 'Traits',
      label: trait.name,
      hint: trait.category,
      iconName: trait.icon || 'spark',
      run: () => { router?.go('matrix', { mode: 'trait', id: trait.id }); }
    });
  }
  return cmds.concat(extra || []);
}
