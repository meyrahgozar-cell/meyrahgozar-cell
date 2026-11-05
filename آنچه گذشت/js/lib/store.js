/* Minimal reactive store + event bus. */

export function createStore(initial = {}) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    get: (key) => (key ? state[key] : state),
    set(patch) {
      state = { ...state, ...patch };
      listeners.forEach((fn) => fn(state));
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function createBus() {
  const map = new Map();
  return {
    on(type, fn) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
      return () => map.get(type)?.delete(fn);
    },
    emit(type, payload) {
      (map.get(type) || []).forEach((fn) => {
        try { fn(payload); } catch (e) { console.error(e); }
      });
    },
  };
}

export function storage(key, fallbackValue) {
  return {
    read() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : structuredClone(fallbackValue);
      } catch { return structuredClone(fallbackValue); }
    },
    write(value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
    },
    clear() { try { localStorage.removeItem(key); } catch { /* noop */ } },
  };
}
