// ---------------------------------------------------------------------------
// sounds.js — synthesiser for interface feedback + haptics.
// Everything is generated with WebAudio: no asset files, no latency.
// ---------------------------------------------------------------------------
import { bus, EV } from '../core/bus.js';

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.convolver = null;
    this.ambientNodes = null;
    this.enabled = true;
    this.volume = 0.45;
    this.haptics = true;
    this.unlocked = false;
    this.userActivated = false;
    this._noise = null;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.18;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    // small synthetic plate reverb
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.6, 2.6);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.22;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);
    return this.ctx;
  }

  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
      }
    }
    return buf;
  }

  unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    this.unlocked = true;
    this.userActivated = true;
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    if (this.master) this.master.gain.value = on ? this.volume : 0;
    if (!on) this.stopAmbient();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (this.master && this.enabled) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  setHaptics(on) { this.haptics = Boolean(on); }

  // ---------------------------------------------------------------- primitives
  _tone({ freq = 440, type = 'sine', dur = 0.2, gain = 0.2, attack = 0.002, decay = null, detune = 0, when = 0, pan = 0, glide = null }) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glide), t0 + dur);
    if (detune) osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (decay || dur));
    osc.connect(g);
    g.connect(p);
    p.connect(this.master);
    if (this.reverb) p.connect(this.reverb);
    osc.start(t0);
    osc.stop(t0 + (decay || dur) + 0.02);
  }

  _noiseBurst({ dur = 0.12, gain = 0.2, type = 'bandpass', freq = 3200, q = 1.4, when = 0, sweep = null, pan = 0 }) {
    const ctx = this.ensure();
    if (!ctx) return;
    if (!this._noise) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = buf;
    }
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    filter.Q.value = q;
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweep), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(filter);
    filter.connect(g);
    g.connect(p);
    p.connect(this.master);
    if (this.reverb) p.connect(this.reverb);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  // ------------------------------------------------------------------ presets
  play(name = 'tick', opts = {}) {
    if (!this.enabled) return false;
    // browsers refuse to start audio before a gesture; stay silent until then
    if (!this.userActivated && !this.ctx) return false;
    const ctx = this.ensure();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    const g = (opts.gain ?? 1);
    switch (name) {
      // two glasses touching: bright inharmonic partials + tiny contact noise
      case 'glass':
        this._tone({ freq: 2380, type: 'sine', dur: 0.42, gain: 0.16 * g, decay: 0.42, pan: opts.pan ?? -0.1 });
        this._tone({ freq: 3590, type: 'sine', dur: 0.3, gain: 0.085 * g, decay: 0.3, pan: opts.pan ?? 0.12 });
        this._tone({ freq: 5240, type: 'sine', dur: 0.18, gain: 0.04 * g, decay: 0.18 });
        this._noiseBurst({ dur: 0.05, gain: 0.07 * g, freq: 5600, q: 2.4 });
        break;
      case 'glassSoft':
        this._tone({ freq: 1980, type: 'sine', dur: 0.26, gain: 0.09 * g, decay: 0.26 });
        this._tone({ freq: 3010, type: 'sine', dur: 0.18, gain: 0.05 * g, decay: 0.18 });
        break;
      case 'clink2':
        // deliberate two-glass collision sequence
        this.play('glass', { gain: g });
        setTimeout(() => this.play('glass', { gain: g * 0.6, pan: 0.4 }), 78);
        break;
      case 'pop':
        this._tone({ freq: 520, type: 'sine', dur: 0.09, gain: 0.18 * g, glide: 880 });
        this._noiseBurst({ dur: 0.03, gain: 0.04 * g, freq: 2200 });
        break;
      case 'tick':
        this._noiseBurst({ dur: 0.018, gain: 0.05 * g, freq: 4800, q: 3 });
        break;
      case 'chime':
        this._tone({ freq: 880, type: 'triangle', dur: 0.5, gain: 0.1 * g, decay: 0.5 });
        this._tone({ freq: 1320, type: 'sine', dur: 0.4, gain: 0.06 * g, decay: 0.4, when: 0.02 });
        this._tone({ freq: 1760, type: 'sine', dur: 0.3, gain: 0.03 * g, decay: 0.3, when: 0.05 });
        break;
      case 'whoosh':
        this._noiseBurst({ dur: 0.42, gain: 0.11 * g, type: 'bandpass', freq: 320, sweep: 3600, q: 0.9 });
        break;
      case 'whooshBack':
        this._noiseBurst({ dur: 0.36, gain: 0.09 * g, type: 'bandpass', freq: 3400, sweep: 260, q: 0.9 });
        break;
      case 'thud':
        this._tone({ freq: 96, type: 'sine', dur: 0.28, gain: 0.3 * g, glide: 46, decay: 0.28 });
        this._noiseBurst({ dur: 0.06, gain: 0.05 * g, freq: 220, type: 'lowpass' });
        break;
      case 'riser':
        this._tone({ freq: 180, type: 'sawtooth', dur: 0.6, gain: 0.05 * g, glide: 1400, decay: 0.6 });
        this._noiseBurst({ dur: 0.6, gain: 0.05 * g, type: 'highpass', freq: 200, sweep: 6000 });
        break;
      case 'sparkle':
        for (let i = 0; i < 6; i++) {
          this._tone({ freq: 1600 + i * 420, type: 'sine', dur: 0.16, gain: 0.035 * g, decay: 0.16, when: i * 0.045, pan: (i % 2 ? 0.3 : -0.3) });
        }
        break;
      case 'success':
        this._tone({ freq: 523.25, type: 'sine', dur: 0.18, gain: 0.11 * g });
        this._tone({ freq: 659.25, type: 'sine', dur: 0.18, gain: 0.1 * g, when: 0.08 });
        this._tone({ freq: 783.99, type: 'sine', dur: 0.34, gain: 0.1 * g, when: 0.16 });
        break;
      case 'error':
        this._tone({ freq: 220, type: 'square', dur: 0.14, gain: 0.07 * g });
        this._tone({ freq: 164, type: 'square', dur: 0.2, gain: 0.06 * g, when: 0.1 });
        break;
      case 'swipe':
        this._noiseBurst({ dur: 0.2, gain: 0.07 * g, type: 'bandpass', freq: 900, sweep: opts.dir === 'left' ? 300 : 2400, q: 1.1 });
        break;
      case 'drop':
        this._tone({ freq: 320, type: 'sine', dur: 0.16, gain: 0.14 * g, glide: 120 });
        break;
      case 'type':
        this._noiseBurst({ dur: 0.012, gain: 0.025 * g, freq: 3200 + Math.random() * 2000, q: 4 });
        break;
      case 'navigate':
        this._tone({ freq: 440, type: 'sine', dur: 0.12, gain: 0.05 * g, glide: 620 });
        break;
      case 'focus':
        this._tone({ freq: 660, type: 'triangle', dur: 0.22, gain: 0.06 * g, glide: 990 });
        break;
      case 'release':
        this._tone({ freq: 990, type: 'triangle', dur: 0.26, gain: 0.05 * g, glide: 660 });
        break;
      case 'milestone':
        for (let i = 0; i < 8; i++) {
          this._tone({ freq: 520 * 2 ** (i / 6), type: 'sine', dur: 0.4, gain: 0.05 * g, decay: 0.4, when: i * 0.07 });
        }
        break;
      default:
        this._tone({ freq: 700, type: 'sine', dur: 0.1, gain: 0.06 * g });
    }
    return true;
  }

  // music-ish ambient pad, very quiet
  startAmbient() {
    const ctx = this.ensure();
    if (!ctx || this.ambientNodes) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);
    const notes = [110, 164.81, 220, 277.18, 329.63];
    const oscs = notes.map((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      osc.detune.value = (i - 2) * 6;
      const g = ctx.createGain();
      g.gain.value = 0.05 / (1 + i * 0.4);
      osc.connect(g); g.connect(out);
      osc.start();
      return osc;
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    lfoGain.connect(filter.frequency);
    out.connect(filter);
    filter.connect(this.master);
    lfo.start();
    out.gain.setTargetAtTime(0.5, ctx.currentTime, 2.5);
    this.ambientNodes = { out, oscs, lfo };
  }

  stopAmbient() {
    if (!this.ambientNodes || !this.ctx) return;
    const { out, oscs, lfo } = this.ambientNodes;
    out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    setTimeout(() => {
      oscs.forEach(o => { try { o.stop(); } catch {} });
      try { lfo.stop(); } catch {}
    }, 900);
    this.ambientNodes = null;
  }

  // ------------------------------------------------------------------ haptics
  haptic(pattern = 'tick') {
    if (!this.haptics || !this.userActivated) return;
    if (!('vibrate' in navigator)) return;
    const patterns = {
      tick: 6,
      light: 8,
      commit: [9],
      success: [12, 40, 18],
      error: [28, 60, 28],
      swipe: [7],
      drop: [5, 20, 5],
      focus: [10, 24, 10],
      heavy: [22],
      milestone: [16, 40, 16, 40, 26]
    };
    try { navigator.vibrate(patterns[pattern] ?? 8); } catch { /* unsupported */ }
  }
}

export const sfx = new SoundEngine();

// bus wiring: any module can request feedback without importing the engine
export function installSoundBus() {
  bus.on(EV.SOUND, (payload) => {
    const { name, gain, pan } = typeof payload === 'string' ? { name: payload } : (payload || {});
    sfx.play(name || 'tick', { gain, pan });
  });
  bus.on(EV.HAPTIC, (pattern) => sfx.haptic(typeof pattern === 'string' ? pattern : 'tick'));
}

export function bindFirstGesture() {
  const unlock = () => {
    sfx.unlock();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('touchstart', unlock, { once: true });
}

export const SOUND_LIST = [
  'glass', 'glassSoft', 'clink2', 'pop', 'tick', 'chime', 'whoosh', 'whooshBack',
  'thud', 'riser', 'sparkle', 'success', 'error', 'swipe', 'drop', 'type',
  'navigate', 'focus', 'release', 'milestone'
];
