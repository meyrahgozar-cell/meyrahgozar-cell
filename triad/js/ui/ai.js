// ---------------------------------------------------------------------------
// ai.js — OpenRouter client (streaming, reasoning), model catalogue, prompts.
// The API key lives only in localStorage; nothing is sent anywhere else.
// ---------------------------------------------------------------------------
import { STORAGE, OPENROUTER_CHAT_URL, OPENROUTER_MODELS_URL } from '../core/config.js';
import { OR_FREE_MODELS } from '../../data/openrouter-models.js';
import { remote } from '../core/api.js';
import { bus, EV } from '../core/bus.js';
import { h, clamp, debounce } from '../core/dom.js';
import { fmtScore, fmtPct } from '../core/format.js';

const DEFAULT_AI = {
  key: '',
  model: 'openrouter/free',
  temperature: 0.7,
  topP: 1,
  maxTokens: 2048,
  reasoning: 'auto',
  system: 'You are the analyst inside TRIAD, a 3D scoring matrix. Be concise, numeric and specific. Never invent people or traits that are not in the supplied data.',
  stream: true,
  savedAt: null
};

export const aiSettings = {
  config: loadConfig(),
  models: [...OR_FREE_MODELS],
  modelsLoadedAt: null,
  syncing: false
};

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE.ai);
    return raw ? { ...DEFAULT_AI, ...JSON.parse(raw) } : { ...DEFAULT_AI };
  } catch { return { ...DEFAULT_AI }; }
}

export function saveAIConfig(patch) {
  aiSettings.config = { ...aiSettings.config, ...patch, savedAt: new Date().toISOString() };
  try { localStorage.setItem(STORAGE.ai, JSON.stringify(aiSettings.config)); }
  catch { /* quota */ }
  bus.emit(EV.AI_STATUS, { keySet: hasKey(), model: aiSettings.config.model });
  return aiSettings.config;
}

export function hasKey() { return Boolean(aiSettings.config.key && aiSettings.config.key.length > 12); }

export function clearKey() {
  aiSettings.config.key = '';
  saveAIConfig({});
}

export function maskKey(key = aiSettings.config.key) {
  if (!key) return '';
  if (key.length < 12) return '••••';
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

// ------------------------------------------------------------------ catalogue
export async function refreshModels({ syncDb = false } = {}) {
  aiSettings.syncing = true;
  bus.emit(EV.AI_STATUS, { syncing: true });
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`models: HTTP ${res.status}`);
    const json = await res.json();
    const free = (json.data || []).filter(m => Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0);
    const byId = new Map();
    for (const m of OR_FREE_MODELS) byId.set(m.id, m);
    for (const m of free) byId.set(m.id, { ...(byId.get(m.id) || {}), ...m, provider: String(m.id).split('/')[0] });
    aiSettings.models = [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    aiSettings.modelsLoadedAt = new Date();
    if (syncDb && hasKey()) {
      try { await remote.syncModels(aiSettings.models); } catch (err) { console.warn('[ai] model sync failed', err); }
    }
    // also try the project's own model table (RLS may allow owner only)
    try {
      const dbModels = await remote.loadModels();
      if (dbModels.length) {
        const merged = new Map(aiSettings.models.map(m => [m.id, m]));
        for (const m of dbModels) merged.set(m.id, { ...(merged.get(m.id) || {}), ...m, from_db: true });
        aiSettings.models = [...merged.values()];
      }
    } catch { /* table may be protected */ }
    bus.emit(EV.AI_STATUS, { models: aiSettings.models.length, syncedAt: aiSettings.modelsLoadedAt });
    return aiSettings.models;
  } catch (err) {
    bus.emit(EV.AI_STATUS, { error: err.message });
    throw err;
  } finally {
    aiSettings.syncing = false;
    bus.emit(EV.AI_STATUS, { syncing: false });
  }
}

export function findModel(id) {
  return aiSettings.models.find(m => m.id === id) || aiSettings.models[0] || { id, name: id, context_length: 32768 };
}

// ------------------------------------------------------------------- context
export function buildContext(cube, { mode = 'trait', axisId = null, limit = 18 } = {}) {
  const overview = cube.overview();
  const people = cube.people.slice(0, limit).map(p => ({
    name: p.fullName,
    role: p.jobTitle || null,
    dept: p.department || null,
    composite: Number(cube.composite(p.id).score.toFixed(2)),
    coverage: Number((cube.personProfile(p.id).coverage * 100).toFixed(0))
  }));
  const traits = cube.traits.slice(0, limit).map(t => {
    const s = cube.traitStats.get(t.id);
    return {
      key: t.key, name: t.name, cat: t.category, weight: t.weight, polarity: t.polarity,
      mean: s ? Number(s.mean.toFixed(2)) : null, sd: s ? Number(s.sd.toFixed(2)) : null
    };
  });
  const top = overview.ranked.slice(0, 5).map(r => ({ name: r.person.fullName, score: Number(r.score.toFixed(2)) }));
  const polar = overview.mostPolarizing.slice(0, 5).map(p => ({
    trait: cube.traitById.get(p.traitId)?.name,
    target: cube.personById.get(p.targetId)?.fullName,
    sd: Number(p.sd.toFixed(2)), mean: Number(p.mean.toFixed(2)), n: p.n
  }));
  return { mode, axisId, stats: { cells: overview.cells, possible: overview.possible, fill: Number((overview.fill * 100).toFixed(0)), mean: Number(overview.mean.toFixed(2)), sd: Number(overview.sd.toFixed(2)) }, people, traits, top, polar };
}

export function contextToPrompt(ctx) {
  return [
    `CUBE: ${ctx.stats.cells}/${ctx.stats.possible} cells (${ctx.stats.fill}% filled), mean ${ctx.stats.mean}, sd ${ctx.stats.sd}.`,
    `PEOPLE: ${ctx.people.map(p => `${p.name} (${p.role || '—'}, comp ${p.composite})`).join('; ')}`,
    `TRAITS: ${ctx.traits.map(t => `${t.name}[${t.cat}] mean ${t.mean} sd ${t.sd}`).join('; ')}`,
    `TOP: ${ctx.top.map(t => `${t.name} ${t.score}`).join(', ')}`,
    `MOST CONTESTED: ${ctx.polar.map(p => `${p.trait}/${p.target} sd ${p.sd}`).join(', ')}`
  ].join('\n');
}

// ------------------------------------------------------------------- one shot
export async function oneShot({ prompt, kind = 'analysis', context = null, model = null, stream = false, onDelta = null, signal = null }) {
  const cfg = aiSettings.config;
  const useModel = model || cfg.model;
  if (!hasKey()) {
    const text = localAnswer(prompt, context);
    if (onDelta) for (const chunk of text.match(/[\s\S]{1,18}/g) || []) { onDelta(chunk); await new Promise(r => setTimeout(r, 12)); }
    return { text, reasoning: '', local: true, model: 'local-analyst' };
  }
  const messages = [];
  if (cfg.system) messages.push({ role: 'system', content: cfg.system });
  if (context) messages.push({ role: 'system', content: `DATA\n${context}` });
  messages.push({ role: 'user', content: prompt });

  const body = {
    model: useModel,
    messages,
    temperature: cfg.temperature,
    top_p: cfg.topP,
    max_tokens: cfg.maxTokens,
    stream: Boolean(stream)
  };
  if (cfg.reasoning && cfg.reasoning !== 'off') {
    body.reasoning = { effort: cfg.reasoning === 'auto' ? 'medium' : cfg.reasoning };
    body.include_reasoning = true;
  }

  const started = performance.now();
  if (!stream) {
    const res = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: openRouterHeaders(),
      body: JSON.stringify(body),
      signal
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 200)}`);
    }
    const json = await res.json();
    const msg = json.choices?.[0]?.message || {};
    const text = msg.content || '';
    const reasoning = msg.reasoning || msg.reasoning_details?.map(d => d.summary || d.text).join('\n') || '';
    remote.logAiRun({
      kind, model: useModel, prompt, response: text, reasoning,
      tokensIn: json.usage?.prompt_tokens, tokensOut: json.usage?.completion_tokens,
      latency: Math.round(performance.now() - started), context: { mode: context?.mode }
    });
    return { text, reasoning, usage: json.usage, model: useModel, local: false };
  }

  // streaming
  const res = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let reasoning = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta || {};
        if (delta.reasoning) { reasoning += delta.reasoning; onDelta?.('', delta.reasoning); }
        if (delta.content) { text += delta.content; onDelta?.(delta.content, null); }
      } catch { /* partial json */ }
    }
  }
  const latency = Math.round(performance.now() - started);
  remote.logAiRun({ kind, model: useModel, prompt, response: text, reasoning, latency, tokensOut: Math.round(text.length / 4) });
  return { text, reasoning, model: useModel, local: false, latency };
}

function openRouterHeaders() {
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${aiSettings.config.key}`,
    'HTTP-Referer': location.origin,
    'X-Title': 'TRIAD Matrix'
  };
  return headers;
}

// --------------------------------------------------------- offline fallback
export function localAnswer(prompt = '', ctx = null) {
  const p = prompt.toLowerCase();
  const nameMatch = ctx?.people?.find(x => p.includes(String(x.name).toLowerCase().split(' ')[0]));
  const traitMatch = ctx?.traits?.find(x => p.includes(String(x.name).toLowerCase()));
  const lines = [];
  if (/who|top|best|rank/.test(p) && ctx?.top?.length) {
    lines.push('Composite ranking (weighted consensus):');
    ctx.top.forEach((t, i) => lines.push(`${i + 1}. ${t.name} — ${t.score}`));
  } else if (/polar|controvers|disagree|conflict/.test(p) && ctx?.polar?.length) {
    lines.push('Widest disagreement cells:');
    ctx.polar.forEach(p2 => lines.push(`${p2.trait} / ${p2.target}: spread ${p2.sd} around ${p2.mean} (n=${p2.n})`));
  } else if (nameMatch) {
    lines.push(`${nameMatch.name}: composite ${nameMatch.composite}, coverage ${nameMatch.coverage}%.`);
    lines.push(nameMatch.composite > 6.5 ? 'Profile sits above the cube mean.' : 'Profile sits near or below the cube mean.');
  } else if (traitMatch) {
    lines.push(`${traitMatch.name}: mean ${traitMatch.mean}, spread ${traitMatch.sd}.`);
    lines.push(traitMatch.sd > 1.5 ? 'This trait splits the group rather than describing it.' : 'The group reads this trait consistently.');
  } else {
    lines.push(ctx ? `Cube: ${ctx.stats.cells} cells, ${ctx.stats.fill}% filled, mean ${ctx.stats.mean}.` : 'No cube context supplied.');
    lines.push('Add an OpenRouter key in AI Lab to run a real model. This is the offline analyst.');
    if (ctx?.top?.length) lines.push(`Leader right now: ${ctx.top[0].name} (${ctx.top[0].score}).`);
  }
  return lines.join('\n');
}

// ------------------------------------------------------------------- prompts
export const AGENTS = [
  {
    id: 'audit',
    name: 'Consensus auditor',
    icon: 'scale',
    blurb: 'Find cells where the group disagrees and explain the shape of the conflict.',
    prompt: () => 'Audit this cube. Identify the three most contested trait/target pairs, describe the two opposing camps, and state which additional ratings would resolve the ambiguity fastest. Use numbers from DATA. Format with short headers.'
  },
  {
    id: 'narrative',
    name: 'Insight narrator',
    icon: 'book',
    blurb: 'Turn the aggregate numbers into a readable briefing.',
    prompt: () => 'Write a 5-sentence editorial briefing on the state of this cube: who leads, which trait drives the ranking, where coverage is thin, and one risk. No bullet lists.'
  },
  {
    id: 'traits',
    name: 'Trait designer',
    icon: 'spark',
    blurb: 'Generate 6 new orthogonal traits for a domain.',
    prompt: () => 'Generate 6 new scoring traits for this group that are orthogonal to the existing ones. Return ONLY JSON: [{"name","key","category","description","polarity":1|-1,"weight":0.5-1.5}]. Categories allowed: character, work, mind, social, leadership, craft, energy, risk.'
  },
  {
    id: 'profile',
    name: 'Person profiler',
    icon: 'user',
    blurb: 'Deep profile of one person from the received scores.',
    prompt: (ctx, extra) => `Profile ${extra?.person || ctx.people[0]?.name}. Cover: strongest received trait, weakest, biggest gap between how they rate others and how they are rated, and one concrete coaching move. 160 words max.`
  },
  {
    id: 'anomaly',
    name: 'Anomaly hunter',
    icon: 'radar',
    blurb: 'Flag statistical outliers and possible rating errors.',
    prompt: () => 'Find statistical anomalies: scores more than 2 sd from consensus, rankers whose bias is an outlier, and cells with suspicious confidence. Output a compact table as markdown.'
  },
  {
    id: 'deck',
    name: 'Deck planner',
    icon: 'layers',
    blurb: 'Order the next rating session for maximum information.',
    prompt: () => 'Design the next 20 rating cards for the highest uncertainty reduction: maximise information gain, avoid near-duplicate cards, name the trait and person for each. Return a numbered list only.'
  },
  {
    id: 'dispute',
    name: 'Dispute brief',
    icon: 'gavel',
    blurb: 'Neutral brief for a contested score.',
    prompt: (ctx, extra) => `Write a neutral dispute brief for ${extra?.trait || 'the most contested trait'} / ${extra?.target || 'the most contested person'}. Present both sides, the evidence in DATA, and a recommended resolution. 180 words.`
  },
  {
    id: 'compare',
    name: 'Head-to-head judge',
    icon: 'split',
    blurb: 'Compare two people across every trait and pick a winner per dimension.',
    prompt: (ctx, extra) => `Compare ${extra?.a || ctx.people[0]?.name} and ${extra?.b || ctx.people[1]?.name} across every trait in DATA. Give a winner per trait and a final verdict with the deciding traits. Be decisive.`
  }
];

export const QUICK_PROMPTS = [
  { label: 'Who leads?', icon: 'star', prompt: 'Who leads this cube and why? Use composite and coverage numbers.' },
  { label: 'Biggest conflict', icon: 'bolt', prompt: 'Where is the biggest disagreement and what does it imply?' },
  { label: 'Weak signal', icon: 'warning', prompt: 'Which conclusions are least trustworthy given coverage and spread?' },
  { label: 'Next 10 cards', icon: 'layers', prompt: 'Which 10 cards should be rated next to reduce uncertainty most?' },
  { label: 'Write the brief', icon: 'book', prompt: 'Write the executive brief for this cube.' }
];

// ---------------------------------------------------------------- JSON helper
export function extractJSON(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  const openChar = candidate[start];
  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(candidate.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

// -------------------------------------------------------------------- render
export function renderMarkdownLite(text = '') {
  const escaped = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = escaped
    .replace(/^### (.*)$/gm, '<h4>$1</h4>')
    .replace(/^## (.*)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^[-*] (.*)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g, '');
  return html;
}

export function aiKeyBadge() {
  return h('span', { class: `key-state ${hasKey() ? 'is-set' : ''}` },
    h('i'), hasKey() ? `key ${maskKey()}` : 'no key'
  );
}

export function installAiBus() {
  bus.on(EV.AI_STATUS, (payload) => { /* consumers subscribe directly */ });
}

export const aiDebouncedSave = debounce((patch) => saveAIConfig(patch), 300);
