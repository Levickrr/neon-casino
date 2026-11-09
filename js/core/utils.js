/* =============================================================================
   NEON CASINO — UTILITIES
   Shared helpers: secure randomness, shuffling, formatting, DOM helpers and
   a "Scope" object that owns every timer/listener a game creates so nothing
   leaks when a game is closed.
   Works in the browser and in Node (for unit tests).
============================================================================= */
(function (root) {
  "use strict";
  const NC = (root.NC = root.NC || {});

  // ---------------------------------------------------------------------------
  // Randomness — crypto based when available (uniform, unbiased).
  // ---------------------------------------------------------------------------
  const cryptoObj = root.crypto && root.crypto.getRandomValues ? root.crypto : null;
  const buf = new Uint32Array(1);

  /** Uniform float in [0, 1). */
  function random() {
    if (cryptoObj) {
      cryptoObj.getRandomValues(buf);
      return buf[0] / 4294967296;
    }
    return Math.random();
  }

  /** Uniform integer in [0, n). */
  function randInt(n) {
    return Math.floor(random() * n);
  }

  /** In-place Fisher–Yates shuffle (unbiased, unlike sort(() => rand - 0.5)). */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function pick(arr) {
    return arr[randInt(arr.length)];
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------
  function fmt(n) {
    return Math.round(n).toLocaleString(NC.i18n ? NC.i18n.locale() : "fr-FR").replace(/ | /g, " ");
  }
  /** Virtual credits. "₵" = Neon Credits (no real money anywhere). */
  function money(n) {
    return fmt(n) + " ₵";
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------------------------------------------------------------------------
  // Scope — owns timers, animation frames and listeners for one game session.
  // dispose() cancels everything; scope.sleep() promises never resolve after
  // disposal, so async game flows simply stop when the game is closed.
  // ---------------------------------------------------------------------------
  class Scope {
    constructor() {
      this.alive = true;
      this._timeouts = new Set();
      this._intervals = new Set();
      this._rafs = new Set();
      this._listeners = [];
      this._disposers = [];
    }
    timeout(fn, ms) {
      if (!this.alive) return 0;
      const id = setTimeout(() => {
        this._timeouts.delete(id);
        if (this.alive) fn();
      }, ms);
      this._timeouts.add(id);
      return id;
    }
    clearTimeout(id) {
      clearTimeout(id);
      this._timeouts.delete(id);
    }
    interval(fn, ms) {
      if (!this.alive) return 0;
      const id = setInterval(() => this.alive && fn(), ms);
      this._intervals.add(id);
      return id;
    }
    clearInterval(id) {
      clearInterval(id);
      this._intervals.delete(id);
    }
    raf(fn) {
      if (!this.alive) return 0;
      const id = root.requestAnimationFrame((t) => {
        this._rafs.delete(id);
        if (this.alive) fn(t);
      });
      this._rafs.add(id);
      return id;
    }
    sleep(ms) {
      return new Promise((resolve) => this.timeout(resolve, ms));
    }
    on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      this._listeners.push([target, type, fn, opts]);
    }
    onDispose(fn) {
      this._disposers.push(fn);
    }
    dispose() {
      if (!this.alive) return;
      this.alive = false;
      this._timeouts.forEach(clearTimeout);
      this._intervals.forEach(clearInterval);
      this._rafs.forEach((id) => root.cancelAnimationFrame(id));
      this._listeners.forEach(([t, ty, fn, o]) => t.removeEventListener(ty, fn, o));
      this._disposers.forEach((fn) => {
        try { fn(); } catch (e) { console.error(e); }
      });
      this._timeouts.clear();
      this._intervals.clear();
      this._rafs.clear();
      this._listeners = [];
      this._disposers = [];
    }
  }

  // ---------------------------------------------------------------------------
  // DOM helpers (browser only)
  // ---------------------------------------------------------------------------
  function $(sel, ctx) {
    return (ctx || root.document).querySelector(sel);
  }
  function $$(sel, ctx) {
    return Array.from((ctx || root.document).querySelectorAll(sel));
  }
  function html(str) {
    const t = root.document.createElement("template");
    t.innerHTML = str.trim();
    return t.content.firstElementChild;
  }
  function reducedMotion() {
    return !!(NC.settings && NC.settings.reducedFx());
  }
  /** Scales game animation durations (1 = normal). Tests may lower it. */
  function dur(ms) {
    const k = typeof root.NC_SPEED === "number" ? root.NC_SPEED : 1;
    return Math.max(16, ms * k);
  }

  NC.util = { random, randInt, shuffle, pick, clamp, fmt, money, escapeHtml, Scope, $, $$, html, reducedMotion, dur };
})(typeof window !== "undefined" ? window : globalThis);
