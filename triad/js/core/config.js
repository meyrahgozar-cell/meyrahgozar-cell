// ---------------------------------------------------------------------------
// config.js — single place for endpoints, table contract and storage keys.
// ---------------------------------------------------------------------------

export const SUPABASE_URL = 'https://nvmevqkaovazhmoznusf.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_AuneSCRLhrKKDeK8q7kJtw_Bg4VNHgE';
export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
export const OPENROUTER_MODELS_URL = `${OPENROUTER_BASE}/models`;
export const OPENROUTER_CHAT_URL = `${OPENROUTER_BASE}/chat/completions`;

export const TABLES = {
  people: 'people',
  profiles: 'profiles',
  traits: 'mtx_traits',
  scores: 'mtx_scores',
  comments: 'mtx_comments',
  disputes: 'mtx_disputes',
  relations: 'mtx_relations',
  sessions: 'mtx_sessions',
  views: 'mtx_views',
  aiRuns: 'mtx_ai_runs',
  prefs: 'mtx_prefs',
  events: 'mtx_events',
  models: 'openrouter_models',
  consensus: 'mtx_v_consensus',
  rankerBias: 'mtx_v_ranker_bias'
};

export const STORAGE = {
  prefs: 'triad.prefs.v1',
  ai: 'triad.ai.v1',
  local: 'triad.local.v1',
  deck: 'triad.deck.v1',
  chat: 'triad.chat.v1',
  undo: 'triad.undo.v1',
  seen: 'triad.seen.v1',
  hash: 'triad.hash.v1'
};

export const DEFAULT_PREFS = {
  accent: 'aqua',
  sound: true,
  volume: 0.45,
  haptics: true,
  ambient: false,
  motion: 'full',
  density: 'comfortable',
  defaultMode: 'trait',
  defaultView: 'matrix',
  showGrid: true,
  showLabels: true,
  heat: 'spectrum',
  orb: true,
  grain: true,
  inertia: true,
  spark: true,
  autoSave: true,
  maxStackLayers: 14,
  scoreStep: 0.5,
  confirmDelete: true
};

export const ACCENTS = {
  aqua: { name: 'Aqua', accent: '#5ef2d6', accent2: '#37b7ff', accent3: '#b57bff' },
  ember: { name: 'Ember', accent: '#ffb454', accent2: '#ff6b6b', accent3: '#ff7bc6' },
  violet: { name: 'Violet', accent: '#b57bff', accent2: '#7aa2ff', accent3: '#5ef2d6' },
  lime: { name: 'Lime', accent: '#b6f36b', accent2: '#5ef2a0', accent3: '#37d6ff' },
  ice: { name: 'Ice', accent: '#9ed8ff', accent2: '#c9b8ff', accent3: '#ff9ed8' },
  mono: { name: 'Mono', accent: '#e6eefc', accent2: '#9fb0c8', accent3: '#5c6b82' }
};

export const SOUND_PRESETS = {
  glass: { name: 'Glass clink', gain: 0.5 },
  pop: { name: 'Soft pop', gain: 0.35 },
  chime: { name: 'Chime', gain: 0.4 },
  whoosh: { name: 'Whoosh', gain: 0.35 },
  tick: { name: 'Tick', gain: 0.25 },
  thud: { name: 'Sub thud', gain: 0.5 },
  riser: { name: 'Riser', gain: 0.3 },
  sparkle: { name: 'Sparkle', gain: 0.3 }
};

export const GRADES = [
  { min: 0.85, label: 'A+', tone: 'premium' },
  { min: 0.74, label: 'A', tone: 'good' },
  { min: 0.62, label: 'B', tone: 'good' },
  { min: 0.5, label: 'C', tone: 'ok' },
  { min: 0.36, label: 'D', tone: 'warn' },
  { min: 0, label: 'E', tone: 'bad' }
];
