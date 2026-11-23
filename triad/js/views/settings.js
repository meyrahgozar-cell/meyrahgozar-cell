// ---------------------------------------------------------------------------
// settings.js view — interface, sound, data and console.
// ---------------------------------------------------------------------------
import { h, clear, clamp, download, copyText } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { store } from '../core/store.js';
import { bus, EV } from '../core/bus.js';
import { go } from '../core/nav.js';
import { sectionHead, kpi, switchRow, seg, pill } from '../ui/bits.js';
import { modal, confirm, toast } from '../ui/overlay.js';
import { ACCENTS, SOUND_PRESETS, SUPABASE_URL, TABLES } from '../core/config.js';
import { sfx, SOUND_LIST } from '../ui/sounds.js';
import { fmtPct, fmtBytes, relTime } from '../core/format.js';
import { openAuth, openAccount } from '../ui/authui.js';
import { maskKey, hasKey, aiSettings } from '../ui/ai.js';
import { exportCubeJSON, importCubeFile, openDbConsole } from '../main-actions.js';

export function settingsView() {
  const root = h('div', { class: 'view__inner' });

  root.appendChild(h('div', { class: 'page-head' },
    h('div', { class: 'page-head__left' },
      h('div', { class: 'eyebrow' }, 'preferences and plumbing'),
      h('h1', { class: 'page-title' }, 'Settings')
    ),
    h('div', { class: 'page-actions' },
      h('button', { class: 'btn btn--sm', onClick: () => openAccount() }, icon('user', { size: 13 }), 'Account'),
      h('button', { class: 'btn btn--sm btn--ghost', onClick: () => store.resetPrefs() }, icon('refresh', { size: 13 }), 'Reset prefs')
    )
  ));

  // ------------------------------------------------------------------ theme
  const themePanel = h('div', { class: 'glass panel' },
    sectionHead('Interface', { iconName: 'palette' }),
    h('div', { class: 'set-row' },
      h('div', { class: 'set-row__main' }, h('b', {}, 'Accent'), h('span', {}, 'Drives every highlight, chart and glow.')),
      h('div', { class: 'swatches' },
        ...Object.entries(ACCENTS).map(([key, accent]) => h('button', {
          class: `swatch ${store.prefs.accent === key ? 'is-active' : ''}`,
          title: accent.name,
          style: { background: `linear-gradient(135deg, ${accent.accent}, ${accent.accent2})` },
          onClick: () => { store.setPref('accent', key); rebuild(); sfx.play('pop'); }
        }))
      )
    ),
    switchRow({ title: 'Ambient background', text: 'Slow drifting aurora blobs behind the shell.', checked: store.prefs.orb, onChange: v => { store.setPref('orb', v); } }),
    switchRow({ title: 'Film grain', text: 'Animated noise texture over the whole app.', checked: store.prefs.grain, onChange: v => { store.setPref('grain', v); document.documentElement.dataset.grain = v ? 'on' : 'off'; } }),
    switchRow({ title: 'Stack inertia', text: 'Orbit keeps moving after you release it.', checked: store.prefs.inertia, onChange: v => store.setPref('inertia', v) }),
    h('div', { class: 'set-row' },
      h('div', { class: 'set-row__main' }, h('b', {}, 'Density'), h('span', {}, 'How much air the layout gets.')),
      seg([
        { value: 'compact', label: 'Compact' },
        { value: 'comfortable', label: 'Normal' },
        { value: 'roomy', label: 'Roomy' }
      ], store.prefs.density, v => { store.setPref('density', v); })
    ),
    h('div', { class: 'set-row' },
      h('div', { class: 'set-row__main' }, h('b', {}, 'Motion'), h('span', {}, 'Reduced disables the 3D springs and particles.')),
      seg([{ value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }], store.prefs.motion, v => store.setPref('motion', v))
    ),
    h('div', { class: 'set-row' },
      h('div', { class: 'set-row__main' }, h('b', {}, 'Heat metric'), h('span', {}, 'What cell colour encodes.')),
      seg([{ value: 'value', label: 'Value' }, { value: 'divergence', label: 'Divergence' }, { value: 'confidence', label: 'Confidence' }], store.prefs.heat, v => store.setPref('heat', v))
    ),
    h('div', { class: 'set-row' },
      h('div', { class: 'set-row__main' }, h('b', {}, 'Stack depth'), h('span', {}, 'Layers rendered in 3D before the rest fold away.')),
      h('input', {
        type: 'range', min: 6, max: 30, step: 1, value: store.prefs.maxStackLayers, style: { width: '140px' },
        onInput: (e) => { store.setPref('maxStackLayers', Number(e.target.value)); }
      })
    )
  );
  root.appendChild(themePanel);

  // ------------------------------------------------------------------ sound
  const soundPanel = h('div', { class: 'glass panel mt-4' },
    sectionHead('Sound & haptics', { iconName: 'volume' }),
    switchRow({ title: 'Interface sound', text: 'Synthesised with WebAudio — two glasses touching, whooshes, chimes.', checked: store.prefs.sound, onChange: v => { store.setPref('sound', v); sfx.setEnabled(v); } }),
    switchRow({ title: 'Vibration', text: 'Uses the device vibration motor where the browser exposes it.', checked: store.prefs.haptics, onChange: v => { store.setPref('haptics', v); sfx.setHaptics(v); } }),
    switchRow({ title: 'Ambient pad', text: 'A quiet evolving drone under everything.', checked: store.prefs.ambient, onChange: v => { store.setPref('ambient', v); if (v) sfx.startAmbient(); else sfx.stopAmbient(); } }),
    h('div', { class: 'set-row' },
      h('div', { class: 'set-row__main' }, h('b', {}, 'Volume'), h('span', {}, `${Math.round(store.prefs.volume * 100)}%`)),
      h('input', {
        type: 'range', min: 0, max: 1, step: 0.01, value: store.prefs.volume, style: { width: '160px' },
        onInput: (e) => { store.setPref('volume', Number(e.target.value)); sfx.setVolume(Number(e.target.value)); }
      })
    ),
    h('div', { class: 'eyebrow mt-3 mb-2' }, 'soundboard'),
    h('div', { class: 'flex gap-2 wrap' },
      ...SOUND_LIST.map(name => h('button', {
        class: 'chip-btn',
        onClick: () => { sfx.unlock(); sfx.play(name); }
      }, icon(name === 'glass' || name === 'clink2' ? 'soundwave' : 'play', { size: 11 }), name))
    ),
    h('div', { class: 'flex gap-2 wrap mt-3' },
      h('button', { class: 'btn btn--sm', onClick: () => { sfx.play('clink2'); sfx.haptic('success'); } }, icon('soundwave', { size: 12 }), 'Two glasses'),
      h('button', { class: 'btn btn--sm', onClick: () => { sfx.play('milestone'); sfx.haptic('milestone'); } }, icon('star', { size: 12 }), 'Milestone'),
      h('button', { class: 'btn btn--sm', onClick: () => { sfx.haptic('error'); sfx.play('error'); } }, icon('warning', { size: 12 }), 'Error')
    )
  );
  root.appendChild(soundPanel);

  // ------------------------------------------------------------------- data
  const dbStatus = store.probe?.counts || {};
  const dbPanel = h('div', { class: 'glass panel mt-4' },
    sectionHead('Data', {
      iconName: 'database',
      actions: h('button', { class: 'btn btn--sm btn--ghost', onClick: () => openDbConsole() }, icon('terminal', { size: 12 }), 'Console')
    }),
    h('div', { class: 'set-row' },
      h('div', { class: 'set-row__main' }, h('b', {}, 'Source'), h('span', {}, 'Local mode keeps everything in this browser. Cloud mode reads and writes Supabase.')),
      seg([{ value: 'auto', label: 'Auto' }, { value: 'local', label: 'Local' }, { value: 'cloud', label: 'Cloud' }], store.sourcePreference,
        async (v) => { await store.setSource(v); toast({ kind: 'ok', text: `Source ${v}` }); rebuild(); })
    ),
    h('div', { class: 'db-grid mt-3' },
      ...Object.values(TABLES).filter(t => t.startsWith('mtx_') || t === 'openrouter_models' || t === 'people').map(table => {
        const count = dbStatus[table];
        const status = count === null || count === undefined ? 'unknown' : 'ok';
        return h('div', { class: 'db-item' },
          h('i', { class: status === 'ok' ? 'ok' : 'unknown' }),
          h('b', {}, table),
          h('span', {}, count === null || count === undefined ? '—' : String(count))
        );
      })
    ),
    h('div', { class: 'flex gap-2 wrap mt-3' },
      h('button', {
        class: 'btn btn--sm',
        onClick: async () => {
          const r = await store.adapter.probe?.();
          toast({ kind: 'info', text: r?.ok ? 'Schema present' : `Missing: ${(r?.missing || []).join(', ') || 'unknown'}` });
          rebuild();
        }
      }, icon('refresh', { size: 12 }), 'Re-check schema'),
      h('button', { class: 'btn btn--sm', onClick: () => openDbConsole() }, icon('code', { size: 12 }), 'Setup SQL'),
      h('button', {
        class: 'btn btn--sm',
        onClick: async () => {
          try {
            bus.emit(EV.BUSY, { on: true, label: 'Pushing cube' });
            const n = await store.pushLocalToCloud();
            toast({ kind: 'ok', text: `${n} cells pushed` });
          } catch (err) { toast({ kind: 'error', text: err.message }); }
          finally { bus.emit(EV.BUSY, { on: false }); }
        }
      }, icon('upload', { size: 12 }), 'Push local → cloud'),
      h('button', {
        class: 'btn btn--sm',
        onClick: async () => { try { await store.pullCloudToLocal(); toast({ kind: 'ok', text: 'Cloud copied locally' }); } catch (e) { toast({ kind: 'error', text: e.message }); } }
      }, icon('download', { size: 12 }), 'Pull cloud → local')
    ),
    h('div', { class: 'divider', style: { margin: '14px 0' } }),
    h('div', { class: 'flex gap-2 wrap' },
      h('button', { class: 'btn btn--sm', onClick: () => exportCubeJSON() }, icon('download', { size: 12 }), 'Export JSON'),
      h('button', { class: 'btn btn--sm', onClick: () => importCubeFile() }, icon('upload', { size: 12 }), 'Import JSON'),
      h('button', {
        class: 'btn btn--sm',
        onClick: () => {
          const local = store.adapter.stats?.();
          toast({
            kind: 'info',
            title: 'Local store',
            text: local ? `${local.people} people · ${local.traits} traits · ${local.scores} cells · ${fmtBytes(local.bytes)}` : 'cloud adapter active'
          });
        }
      }, icon('database', { size: 12 }), 'Local size'),
      h('div', { style: { flex: 1 } }),
      h('button', {
        class: 'btn btn--sm btn--danger',
        onClick: async () => {
          const ok = await confirm({ title: 'Rebuild demo cube?', text: 'Local mode only. This replaces people, traits and scores in this browser.', confirmLabel: 'Rebuild', danger: true });
          if (!ok) return;
          await store.resetDemo('full');
          rebuild();
        }
      }, icon('refresh', { size: 12 }), 'Demo cube'),
      h('button', {
        class: 'btn btn--sm btn--danger',
        onClick: async () => {
          const ok = await confirm({ title: 'Clear everything local?', text: 'Deletes the local cube, chat history and preferences in this browser.', confirmLabel: 'Clear all', danger: true });
          if (!ok) return;
          localStorage.clear();
          location.reload();
        }
      }, icon('trash', { size: 12 }), 'Clear local')
    )
  );
  root.appendChild(dbPanel);

  // -------------------------------------------------------------------- ai
  root.appendChild(h('div', { class: 'glass panel mt-4' },
    sectionHead('AI', { iconName: 'ai', actions: h('button', { class: 'btn btn--sm btn--ghost', onClick: () => go('lab') }, 'Open lab', icon('arrowRight', { size: 12 })) }),
    h('div', { class: 'set-row' },
      h('div', { class: 'set-row__main' }, h('b', {}, 'OpenRouter'), h('span', {}, hasKey() ? `key ${maskKey()} · model ${aiSettings.config.model}` : 'no key stored')),
      h('div', { class: 'flex gap-2' },
        h('span', { class: `flag ${hasKey() ? 'pill--good' : 'pill--warn'} pill` }, hasKey() ? 'ready' : 'offline'),
        h('button', { class: 'btn btn--sm', onClick: () => go('lab') }, 'Manage')
      )
    ),
    h('div', { class: 'set-row' },
      h('div', { class: 'set-row__main' }, h('b', {}, 'Send context'), h('span', {}, 'Prompts include an aggregate summary (people, traits, means, spread). Notes are never sent.')),
      h('button', {
        class: 'switch', role: 'switch', 'aria-checked': 'true',
        onClick: (e) => e.currentTarget.setAttribute('aria-checked', String(e.currentTarget.getAttribute('aria-checked') !== 'true'))
      })
    )
  ));

  // ------------------------------------------------------------------ about
  const cov = store.coverage();
  root.appendChild(h('div', { class: 'glass panel mt-4' },
    sectionHead('About', { iconName: 'info' }),
    h('div', { class: 'info-grid' },
      h('div', { class: 'info-cell' }, h('span', {}, 'build'), h('b', {}, 'TRIAD 3.0')),
      h('div', { class: 'info-cell' }, h('span', {}, 'supabase'), h('b', {}, SUPABASE_URL.replace('https://', '').split('.')[0])),
      h('div', { class: 'info-cell' }, h('span', {}, 'cube fill'), h('b', {}, fmtPct(cov.pct, 1))),
      h('div', { class: 'info-cell' }, h('span', {}, 'last save'), h('b', {}, store.lastSavedAt ? relTime(store.lastSavedAt) : '—'))
    ),
    h('div', { class: 'hint mt-3' }, 'Local-first. Writes go to the cloud only when a session exists and the source is cloud.')
  ));

  function rebuild() {
    const next = settingsView();
    root.replaceWith(next);
  }

  return root;
}
