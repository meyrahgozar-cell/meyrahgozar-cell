// ---------------------------------------------------------------------------
// bus.js — decoupled event hub + lightweight state channel.
// ---------------------------------------------------------------------------

const listeners = new Map();

export const bus = {
  on(type, handler) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(handler);
    return () => listeners.get(type)?.delete(handler);
  },
  once(type, handler) {
    const off = this.on(type, (payload) => { off(); handler(payload); });
    return off;
  },
  off(type, handler) {
    listeners.get(type)?.delete(handler);
  },
  emit(type, payload) {
    const set = listeners.get(type);
    if (set) {
      for (const handler of [...set]) {
        try { handler(payload); }
        catch (err) { console.error(`[bus:${type}]`, err); }
      }
    }
    const wild = listeners.get('*');
    if (wild) {
      for (const handler of [...wild]) {
        try { handler(type, payload); } catch (err) { console.error('[bus:*]', err); }
      }
    }
    return payload;
  },
  count(type) { return listeners.get(type)?.size || 0; },
  clear() { listeners.clear(); }
};

export const EV = {
  DATA_LOADED: 'data:loaded',
  DATA_CHANGED: 'data:changed',
  SCORE_SET: 'score:set',
  SCORE_BULK: 'score:bulk',
  PEOPLE_CHANGED: 'people:changed',
  TRAITS_CHANGED: 'traits:changed',
  PERSON_SELECT: 'person:select',
  TRAIT_SELECT: 'trait:select',
  STACK_FOCUS: 'stack:focus',
  VIEW_CHANGE: 'view:change',
  MODE_CHANGE: 'mode:change',
  SESSION: 'auth:session',
  AUTH_STATE: 'auth:state',
  TOAST: 'ui:toast',
  SOUND: 'ui:sound',
  HAPTIC: 'ui:haptic',
  PALETTE_OPEN: 'ui:palette',
  MODAL: 'ui:modal',
  PREFS: 'ui:prefs',
  AI_STATUS: 'ai:status',
  AI_MESSAGE: 'ai:message',
  AI_RUN: 'ai:run',
  DB_STATUS: 'db:status',
  BUSY: 'ui:busy',
  UNDO: 'data:undo',
  REFRESH: 'data:refresh',
  ROUTE: 'route:change'
};

// Small observable store for reactive bits (used by the shell/dock).
export function observable(initial) {
  let value = initial;
  const subs = new Set();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return value;
      const prev = value;
      value = next;
      for (const fn of [...subs]) fn(value, prev);
      return value;
    },
    update(fn) { return this.set(fn(value)); },
    subscribe(fn) { subs.add(fn); fn(value, undefined); return () => subs.delete(fn); }
  };
}
