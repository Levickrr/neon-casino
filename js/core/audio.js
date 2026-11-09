/* =============================================================================
   NEON CASINO — SOUND DESIGN (Web Audio synthesis, no audio files needed)
   The AudioContext is only created after the first user gesture, so nothing
   ever autoplays. Every sound respects the sound toggle.
============================================================================= */
(function (root) {
  "use strict";
  const NC = (root.NC = root.NC || {});
  let ctx = null;
  let master = null;
  let unlocked = false;
  let lastPlay = {};

  function ensure() {
    if (!unlocked) return null;
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.32;
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(ctx.destination);
      } catch (e) { ctx = null; return null; }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function unlock() {
    unlocked = true;
    ensure();
  }
  ["pointerdown", "keydown", "touchstart"].forEach((ev) =>
    root.addEventListener && root.addEventListener(ev, unlock, { once: false, passive: true })
  );

  function tone({ freq = 440, to = null, type = "sine", dur = 0.15, vol = 0.5, delay = 0, attack = 0.005 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.2, vol = 0.4, delay = 0, filter = 1200, q = 1, type = "bandpass" }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = b;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = filter;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
  }

  const SOUNDS = {
    click: () => tone({ freq: 900, to: 600, type: "triangle", dur: 0.06, vol: 0.25 }),
    hover: () => tone({ freq: 1400, type: "sine", dur: 0.03, vol: 0.05 }),
    chip: () => { tone({ freq: 2200, to: 1800, type: "triangle", dur: 0.05, vol: 0.2 }); noise({ dur: 0.05, vol: 0.2, filter: 4000 }); },
    card: () => noise({ dur: 0.09, vol: 0.5, filter: 2500, q: 0.7 }),
    flip: () => { for (let i = 0; i < 8; i++) tone({ freq: 1800 + i * 40, type: "square", dur: 0.02, vol: 0.05, delay: i * 0.07 }); },
    coinland: () => { tone({ freq: 1320, type: "sine", dur: 0.4, vol: 0.3 }); tone({ freq: 1980, type: "sine", dur: 0.3, vol: 0.15, delay: 0.02 }); },
    tick: () => tone({ freq: 1600, type: "square", dur: 0.015, vol: 0.06 }),
    peg: () => tone({ freq: 700 + Math.random() * 900, type: "sine", dur: 0.05, vol: 0.08 }),
    reel: () => noise({ dur: 0.06, vol: 0.15, filter: 800 }),
    reelstop: () => { tone({ freq: 220, to: 110, type: "square", dur: 0.08, vol: 0.2 }); noise({ dur: 0.05, vol: 0.2, filter: 600 }); },
    spin: () => { noise({ dur: 2.5, vol: 0.12, filter: 500, q: 0.4, type: "lowpass" }); },
    gem: () => { tone({ freq: 1046, type: "sine", dur: 0.12, vol: 0.25 }); tone({ freq: 1568, type: "sine", dur: 0.18, vol: 0.2, delay: 0.06 }); },
    boom: () => { noise({ dur: 0.7, vol: 0.9, filter: 300, q: 0.5, type: "lowpass" }); tone({ freq: 120, to: 30, type: "sawtooth", dur: 0.6, vol: 0.5 }); },
    launch: () => tone({ freq: 120, to: 600, type: "sawtooth", dur: 1.2, vol: 0.12 }),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.25, vol: 0.3, delay: i * 0.08 })),
    bigwin: () => [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => { tone({ freq: f, type: "square", dur: 0.3, vol: 0.12, delay: i * 0.09 }); tone({ freq: f / 2, type: "triangle", dur: 0.35, vol: 0.2, delay: i * 0.09 }); }),
    lose: () => { tone({ freq: 330, to: 160, type: "sawtooth", dur: 0.45, vol: 0.18 }); tone({ freq: 247, to: 120, type: "triangle", dur: 0.5, vol: 0.18, delay: 0.1 }); },
    push: () => tone({ freq: 600, type: "triangle", dur: 0.2, vol: 0.2 }),
    levelup: () => [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.4, vol: 0.25, delay: i * 0.07 })),
    error: () => tone({ freq: 200, type: "square", dur: 0.15, vol: 0.12 }),
    tile: () => { tone({ freq: 500, to: 300, type: "triangle", dur: 0.07, vol: 0.25 }); noise({ dur: 0.04, vol: 0.2, filter: 1500 }); },
    ball: () => tone({ freq: 3000, to: 2000, type: "sine", dur: 0.03, vol: 0.08 }),
  };

  /** Plays a named sound (rate-limited so physics collisions never spam). */
  function play(name, minGapMs) {
    if (!NC.settings || !NC.settings.sound()) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    const now = performance.now();
    const gap = minGapMs == null ? 25 : minGapMs;
    if (lastPlay[name] && now - lastPlay[name] < gap) return;
    lastPlay[name] = now;
    try { fn(); } catch (e) { /* audio errors must never break a game */ }
  }

  NC.audio = { play, unlock };
})(typeof window !== "undefined" ? window : globalThis);
