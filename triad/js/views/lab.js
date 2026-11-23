// ---------------------------------------------------------------------------
// lab.js view — AI lab: key, model catalogue, agent toolkit, streaming chat.
// ---------------------------------------------------------------------------
import { h, clear, clamp, debounce } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { store } from '../core/store.js';
import { bus, EV } from '../core/bus.js';
import { go } from '../core/nav.js';
import { sectionHead, emptyState, kpi } from '../ui/bits.js';
import { modal, toast, confirm } from '../ui/overlay.js';
import { fmtScore, fmtPct, compactNumber } from '../core/format.js';
import { sfx } from '../ui/sounds.js';
import {
  aiSettings, saveAIConfig, hasKey, clearKey, maskKey, refreshModels, findModel,
  oneShot, buildContext, contextToPrompt, AGENTS, QUICK_PROMPTS, extractJSON,
  renderMarkdownLite, aiKeyBadge
} from '../ui/ai.js';
import { STORAGE } from '../core/config.js';

let chatState = loadChat();

function loadChat() {
  try {
    const raw = localStorage.getItem(STORAGE.chat);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveChat() {
  try { localStorage.setItem(STORAGE.chat, JSON.stringify(chatState.slice(-40))); } catch { /* quota */ }
}

export function labView() {
  const root = h('div', { class: 'view__inner' });
  const ctx = buildContext(store.cube);

  root.appendChild(h('div', { class: 'page-head' },
    h('div', { class: 'page-head__left' },
      h('div', { class: 'eyebrow' }, 'reasoning · free models'),
      h('h1', { class: 'page-title' }, 'AI Lab', h('span', { class: 'sup' }, hasKey() ? 'online' : 'offline'))
    ),
    h('div', { class: 'page-actions' },
      h('button', { class: 'btn btn--sm', onClick: () => openKeyModal() }, icon('key', { size: 13 }), hasKey() ? maskKey() : 'Set key'),
      h('button', { class: 'btn btn--sm', onClick: () => openModels() }, icon('cube', { size: 13 }), `${aiSettings.models.length} models`),
      h('button', { class: 'btn btn--sm btn--ghost', onClick: () => clearThread() }, icon('trash', { size: 13 }), 'Clear')
    )
  ));

  root.appendChild(h('div', { class: 'grid grid--4 mb-4' },
    kpi({ label: 'Key', value: hasKey() ? 'set' : 'missing', iconName: 'key', accent: hasKey(), foot: h('span', { class: 'dim' }, 'stored in this browser only') }),
    kpi({ label: 'Active model', value: findModel(aiSettings.config.model).name.split(':')[0].slice(0, 18), iconName: 'ai', foot: h('span', { class: 'dim' }, aiSettings.config.model) }),
    kpi({ label: 'Free models', value: String(aiSettings.models.length), iconName: 'cube', foot: h('span', { class: 'dim' }, 'zero-cost only') }),
    kpi({ label: 'Reasoning', value: aiSettings.config.reasoning, iconName: 'brain', foot: h('span', { class: 'dim' }, `temp ${aiSettings.config.temperature}`) })
  ));

  const lab = h('div', { class: 'lab-grid' });
  const mainCol = h('div');
  const sideCol = h('div', { class: 'lab-side' });
  lab.append(mainCol, sideCol);
  root.appendChild(lab);

  // --------------------------------------------------------------- chat panel
  const thread = h('div', { class: 'ai-thread' });
  const input = h('textarea', { class: 'ai-input', placeholder: 'Ask the cube anything. Shift+Enter for a new line.', rows: '2' });
  const sendBtn = h('button', { class: 'btn btn--primary btn--sm' }, icon('arrowRight', { size: 13 }), 'Send');
  const stopBtn = h('button', { class: 'btn btn--sm btn--danger', style: { display: 'none' } }, icon('stop', { size: 12 }), 'Stop');
  const modelChip = h('button', { class: 'chip-btn', onClick: () => openModels() }, icon('ai', { size: 12 }), findModel(aiSettings.config.model).name.slice(0, 26));

  let controller = null;
  let streaming = false;

  const chat = h('div', { class: 'chart' },
    h('div', { class: 'chart__head' },
      h('div', { class: 'chart__title' }, icon('ai', { size: 14 }), 'Cube analyst'),
      h('div', { class: 'flex items-center gap-2' }, modelChip, aiKeyBadge())
    ),
    h('div', { class: 'ai-shell' },
      thread,
      h('div', { class: 'ai-composer' },
        h('div', { class: 'ai-suggestions' },
          ...QUICK_PROMPTS.map(p => h('button', {
            class: 'ai-suggestion',
            onClick: () => { input.value = p.prompt; input.focus(); }
          }, icon(p.icon, { size: 12 }), p.label))
        ),
        input,
        h('div', { class: 'ai-actions' },
          h('button', { class: 'btn btn--sm btn--ghost', onClick: () => openKeyModal() }, icon('key', { size: 12 }), 'Key'),
          h('button', { class: 'btn btn--sm btn--ghost', onClick: () => openSettingsModal() }, icon('sliders', { size: 12 }), 'Params'),
          h('div', { class: 'ai-actions__spacer' }),
          stopBtn,
          sendBtn
        )
      )
    )
  );
  mainCol.appendChild(chat);

  function paintThread() {
    clear(thread);
    if (!chatState.length) {
      thread.appendChild(h('div', { class: 'empty', style: { border: 'none', background: 'none' } },
        icon('ai', { size: 30 }),
        h('b', {}, 'Ask the cube'),
        h('p', {}, 'The assistant receives a compact statistical summary of the matrix, never raw personal notes.')
      ));
      return;
    }
    for (const msg of chatState) {
      thread.appendChild(renderMessage(msg));
    }
    thread.scrollTop = thread.scrollHeight;
  }

  function renderMessage(msg) {
    const isUser = msg.role === 'user';
    const bubble = h('div', { class: 'msg__bubble' });
    bubble.innerHTML = renderMarkdownLite(msg.content || '');
    const wrap = h('div', { class: `msg ${isUser ? 'msg--user' : 'msg--assistant'}` });
    if (msg.reasoning) {
      const reasoning = h('div', { class: 'reasoning', style: { display: 'none' } }, msg.reasoning);
      const head = h('div', { class: 'reasoning-head', onClick: () => {
        const open = reasoning.style.display !== 'none';
        reasoning.style.display = open ? 'none' : 'block';
        head.classList.toggle('is-open', !open);
      } }, icon('chevronRight', { size: 11 }), 'reasoning');
      wrap.append(head, reasoning);
    }
    wrap.appendChild(bubble);
    wrap.appendChild(h('div', { class: 'msg__meta' },
      h('span', {}, isUser ? 'you' : (msg.model || 'assistant')),
      h('span', {}, msg.local ? 'offline analyst' : ''),
      h('span', {}, msg.at ? new Date(msg.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')
    ));
    return wrap;
  }

  async function send() {
    const text = input.value.trim();
    if (!text || streaming) return;
    input.value = '';
    chatState.push({ role: 'user', content: text, at: Date.now() });
    paintThread();
    const assistantMsg = { role: 'assistant', content: '', reasoning: '', model: aiSettings.config.model, at: Date.now() };
    chatState.push(assistantMsg);
    paintThread();
    const nodes = thread.querySelectorAll('.msg--assistant .msg__bubble');
    const liveBubble = nodes[nodes.length - 1];
    const liveReasoningWrap = thread.querySelectorAll('.msg--assistant .reasoning');
    const liveReasoning = liveReasoningWrap[liveReasoningWrap.length - 1];

    streaming = true;
    sendBtn.style.display = 'none';
    stopBtn.style.display = '';
    controller = new AbortController();
    sfx.play('whoosh', { gain: 0.4 });
    try {
      const res = await oneShot({
        prompt: text,
        kind: 'chat',
        context: contextToPrompt(ctx),
        stream: true,
        signal: controller.signal,
        onDelta: (chunk, reasoning) => {
          if (chunk) {
            assistantMsg.content += chunk;
            if (liveBubble) liveBubble.innerHTML = renderMarkdownLite(assistantMsg.content);
          }
          if (reasoning) {
            assistantMsg.reasoning += reasoning;
            if (liveReasoning) {
              liveReasoning.textContent = assistantMsg.reasoning;
              if (liveReasoning.previousElementSibling) liveReasoning.previousElementSibling.style.display = 'flex';
            }
          }
          thread.scrollTop = thread.scrollHeight;
        }
      });
      assistantMsg.content = res.text || assistantMsg.content;
      assistantMsg.reasoning = res.reasoning || assistantMsg.reasoning;
      assistantMsg.local = res.local;
      assistantMsg.model = res.model;
      if (liveBubble) liveBubble.innerHTML = renderMarkdownLite(assistantMsg.content || '(empty)');
      sfx.play('glassSoft');
    } catch (err) {
      assistantMsg.content = `**Failed.** ${err.message}`;
      if (liveBubble) liveBubble.innerHTML = renderMarkdownLite(assistantMsg.content);
      toast({ kind: 'error', text: err.message });
    } finally {
      streaming = false;
      sendBtn.style.display = '';
      stopBtn.style.display = 'none';
      controller = null;
      saveChat();
      paintThread();
    }
  }

  sendBtn.addEventListener('click', send);
  stopBtn.addEventListener('click', () => { controller?.abort(); sfx.play('thud', { gain: 0.5 }); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  // ---------------------------------------------------------------- agents
  sideCol.appendChild(h('div', { class: 'glass panel' },
    h('div', { class: 'eyebrow mb-2' }, 'agents'),
    h('div', { class: 'grid gap-2' },
      ...AGENTS.map(agent => h('button', {
        class: 'agent-card',
        onClick: () => runAgent(agent)
      },
        h('b', {}, icon(agent.icon, { size: 13 }), agent.name),
        h('span', {}, agent.blurb)
      ))
    )
  ));

  sideCol.appendChild(h('div', { class: 'glass panel' },
    h('div', { class: 'eyebrow mb-2' }, 'model'),
    h('div', { class: 'flex items-center justify-between' },
      h('div', { class: 'grow', style: { minWidth: 0 } },
        h('div', { class: 'strong tiny truncate' }, findModel(aiSettings.config.model).name),
        h('div', { class: 'mono tiny dim truncate' }, aiSettings.config.model)
      ),
      h('button', { class: 'btn btn--sm btn--ghost', onClick: () => openModels() }, 'Change')
    ),
    h('div', { class: 'info-grid mt-3' },
      h('div', { class: 'info-cell' }, h('span', {}, 'context'), h('b', {}, compactNumber(findModel(aiSettings.config.model).context_length || 0))),
      h('div', { class: 'info-cell' }, h('span', {}, 'max out'), h('b', {}, compactNumber(findModel(aiSettings.config.model).top_provider?.max_completion_tokens || aiSettings.config.maxTokens))),
      h('div', { class: 'info-cell' }, h('span', {}, 'reasoning'), h('b', {}, aiSettings.config.reasoning)),
      h('div', { class: 'info-cell' }, h('span', {}, 'stream'), h('b', {}, aiSettings.config.stream ? 'on' : 'off'))
    )
  ));

  sideCol.appendChild(h('div', { class: 'glass panel' },
    h('div', { class: 'eyebrow mb-2' }, 'context sent'),
    h('div', { class: 'tiny dim', style: { lineHeight: 1.6 } },
      `${ctx.people.length} people · ${ctx.traits.length} traits · ${ctx.stats.cells} cells · fill ${ctx.stats.fill}%`
    ),
    h('button', { class: 'btn btn--sm btn--ghost full mt-2', onClick: () => {
      modal({
        title: 'Context payload',
        iconName: 'code',
        size: 'md',
        body: h('div', { class: 'code-block' },
          h('div', { class: 'code-block__head' }, 'sent with every prompt'),
          h('pre', {}, contextToPrompt(ctx))
        )
      });
    } }, icon('eye', { size: 12 }), 'Inspect')
  ));

  async function runAgent(agent) {
    const extra = agent.id === 'profile' ? { person: store.people[0]?.fullName } : {};
    const prompt = agent.prompt(ctx, extra);
    input.value = prompt;
    await send();
    sfx.play('focus', { gain: 0.5 });
  }

  function clearThread() {
    confirm({ title: 'Clear thread?', text: 'Local chat history only — runs already logged stay in the database.', confirmLabel: 'Clear', danger: true }).then(ok => {
      if (!ok) return;
      chatState = [];
      saveChat();
      paintThread();
    });
  }

  paintThread();
  if (!hasKey()) {
    setTimeout(() => {
      toast({ kind: 'info', title: 'AI is offline', text: 'Set an OpenRouter key to run free models. Until then a local analyst answers.', duration: 5200 });
    }, 700);
  }
  return root;
}

// ---------------------------------------------------------------------- modals
function openKeyModal() {
  const keyInput = h('input', { class: 'input', type: 'password', placeholder: 'sk-or-v1-…', value: aiSettings.config.key || '', autocomplete: 'off', spellcheck: 'false' });
  const reveal = h('button', { class: 'btn btn--sm btn--ghost', onClick: () => { keyInput.type = keyInput.type === 'password' ? 'text' : 'password'; } }, icon('eye', { size: 13 }));
  const m = modal({
    title: 'OpenRouter key',
    iconName: 'key',
    size: 'sm',
    body: h('div', { class: 'grid gap-3' },
      h('div', { class: 'auth-note' }, icon('lock', { size: 13 }),
        h('span', {}, 'Stored in this browser only (localStorage). Requests go directly from this tab to openrouter.ai — there is no proxy in between.')
      ),
      h('div', { class: 'field' }, h('label', {}, 'API key'), h('div', { class: 'key-field' }, keyInput, reveal)),
      h('div', { class: 'flex gap-2' },
        h('a', { class: 'btn btn--sm', href: 'https://openrouter.ai/keys', target: '_blank', rel: 'noopener' }, icon('external', { size: 12 }), 'Get a key'),
        h('button', { class: 'btn btn--sm btn--ghost', onClick: () => { keyInput.value = ''; } }, 'Clear field')
      )
    ),
    footer: h('div', { class: 'flex gap-2' },
      hasKey() ? h('button', {
        class: 'btn btn--danger',
        onClick: () => { clearKey(); m.close(); toast({ kind: 'info', text: 'Key removed' }); bus.emit(EV.AI_STATUS, {}); }
      }, 'Remove') : null,
      h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn--primary',
        onClick: async () => {
          const value = keyInput.value.trim();
          if (!value || value.length < 20) { toast({ kind: 'error', text: 'That does not look like a key' }); return; }
          saveAIConfig({ key: value });
          m.close();
          toast({ kind: 'ok', text: 'Key stored locally' });
          sfx.play('success');
          refreshModels().catch(() => {});
          bus.emit(EV.AI_STATUS, {});
        }
      }, 'Save key')
    )
  });
}

function openSettingsModal() {
  const temp = h('input', { type: 'range', min: '0', max: '2', step: '0.05', value: aiSettings.config.temperature });
  const tempOut = h('span', { class: 'mono tiny' }, String(aiSettings.config.temperature));
  const tokens = h('input', { type: 'range', min: '256', max: '8192', step: '256', value: aiSettings.config.maxTokens });
  const tokensOut = h('span', { class: 'mono tiny' }, String(aiSettings.config.maxTokens));
  const reasoning = h('select', { class: 'select' },
    ...['off', 'low', 'medium', 'high', 'auto'].map(v => h('option', { value: v, selected: aiSettings.config.reasoning === v }, v))
  );
  const system = h('textarea', { class: 'textarea' }, aiSettings.config.system || '');

  const m = modal({
    title: 'Generation parameters',
    iconName: 'sliders',
    size: 'sm',
    body: h('div', { class: 'grid gap-3' },
      h('div', { class: 'field' }, h('label', {}, 'Temperature'), h('div', { class: 'flex items-center gap-3' }, temp, tempOut)),
      h('div', { class: 'field' }, h('label', {}, 'Max tokens'), h('div', { class: 'flex items-center gap-3' }, tokens, tokensOut)),
      h('div', { class: 'field' }, h('label', {}, 'Reasoning effort'), reasoning),
      h('div', { class: 'field' }, h('label', {}, 'System prompt'), system)
    ),
    footer: h('div', { class: 'flex gap-2' },
      h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn--primary',
        onClick: () => {
          saveAIConfig({
            temperature: Number(temp.value),
            maxTokens: Number(tokens.value),
            reasoning: reasoning.value,
            system: system.value
          });
          m.close();
          toast({ kind: 'ok', text: 'Parameters saved' });
        }
      }, 'Save')
    )
  });
  temp.addEventListener('input', () => { tempOut.textContent = temp.value; });
  tokens.addEventListener('input', () => { tokensOut.textContent = tokens.value; });
}

function openModels() {
  let query = '';
  const list = h('div', { class: 'model-pick' });
  const searchInput = h('input', { class: 'input', placeholder: 'Filter 400+ models…', onInput: debounce((e) => { query = e.target.value; paint(); }, 120) });

  function paint() {
    clear(list);
    const models = aiSettings.models.filter(m => !query || `${m.name} ${m.id}`.toLowerCase().includes(query.toLowerCase())).slice(0, 120);
    if (!models.length) {
      list.appendChild(h('div', { class: 'palette__empty' }, 'No models match. Try syncing the catalogue.'));
      return;
    }
    for (const m of models) {
      const active = m.id === aiSettings.config.model;
      const row = h('button', {
        class: `model-row ${active ? 'is-active' : ''}`,
        onClick: () => {
          saveAIConfig({ model: m.id });
          modalRef?.close();
          toast({ kind: 'ok', text: m.name });
          bus.emit(EV.AI_STATUS, {});
          go('lab');
        }
      },
        h('div', { class: 'model-row__pick' }),
        h('div', { class: 'model-row__main' },
          h('b', {}, m.name || m.id),
          h('span', {}, m.id),
          h('div', { class: 'model-row__tags' },
            m.context_length ? h('span', { class: 'tag' }, `${Math.round(m.context_length / 1000)}k ctx`) : null,
            m.supported_parameters?.includes('reasoning') ? h('span', { class: 'tag' }, 'reasoning') : null,
            m.supported_parameters?.includes('tools') ? h('span', { class: 'tag' }, 'tools') : null,
            m.architecture?.input_modalities?.includes('image') ? h('span', { class: 'tag' }, 'vision') : null,
            m.from_db ? h('span', { class: 'tag', style: { color: 'var(--accent)' } }, 'db') : null
          )
        )
      );
      list.appendChild(row);
    }
  }

  const modalRef = modal({
    title: 'Free models',
    iconName: 'cube',
    size: 'md',
    body: h('div', { class: 'grid gap-3' },
      h('div', { class: 'flex gap-2' },
        h('div', { class: 'grow' }, searchInput),
        h('button', {
          class: 'btn btn--sm',
          onClick: async (e) => {
            e.currentTarget.textContent = 'Syncing…';
            try {
              await refreshModels({ syncDb: hasKey() });
              paint();
              toast({ kind: 'ok', text: `${aiSettings.models.length} models` });
            } catch (err) { toast({ kind: 'error', text: err.message }); }
            finally { e.currentTarget.textContent = 'Sync'; }
          }
        }, icon('refresh', { size: 12 }), 'Sync')
      ),
      h('div', { class: 'hint' }, 'Only models priced at zero are shown. Catalogue also syncs to openrouter_models when the key allows writes.'),
      list
    ),
    footer: h('div', { class: 'flex gap-2' },
      h('a', { class: 'btn btn--sm btn--ghost', href: 'https://openrouter.ai/models?max_price=0', target: '_blank', rel: 'noopener' }, icon('external', { size: 12 }), 'Browse'),
      h('button', { class: 'btn', onClick: () => modalRef.close() }, 'Close')
    )
  });
  paint();
}
