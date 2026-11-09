/* =============================================================================
   NEON CASINO — VISUAL EFFECTS
   - Ambient background particles (one canvas, paused when hidden / disabled)
   - Confetti & spark bursts (one shared overlay canvas)
   - Floating "+1 000 ₵" labels, screen shake
   All optional effects are skipped when effects are off or the OS asks for
   reduced motion.
============================================================================= */
(function (root) {
  "use strict";
  const NC = (root.NC = root.NC || {});
  const COLORS = ["#00f0ff", "#b14cff", "#ff2bd6", "#2f7bff", "#b6ff00", "#ffc94d"];

  // ---------------------------------------------------------------------------
  // Ambient background
  // ---------------------------------------------------------------------------
  const ambient = {
    canvas: null, ctx: null, parts: [], running: false, w: 0, h: 0, dpr: 1, last: 0,
    init() {
      this.canvas = document.getElementById("bg-canvas");
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext("2d");
      this.resize();
      window.addEventListener("resize", () => this.resize());
      document.addEventListener("visibilitychange", () => this.sync());
      NC.bus.on("settings", () => this.sync());
      this.sync();
    },
    resize() {
      if (!this.canvas) return;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.canvas.width = this.w * this.dpr;
      this.canvas.height = this.h * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const count = Math.round(Math.min(90, (this.w * this.h) / 18000));
      this.parts = Array.from({ length: count }, () => this.spawn(true));
      if (!this.running) this.drawStatic();
    },
    spawn(anywhere) {
      return {
        x: Math.random() * this.w,
        y: anywhere ? Math.random() * this.h : this.h + 10,
        r: Math.random() * 1.8 + 0.4,
        vy: -(Math.random() * 0.25 + 0.05),
        vx: (Math.random() - 0.5) * 0.12,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
        a: Math.random() * 0.6 + 0.2,
        tw: Math.random() * Math.PI * 2,
      };
    },
    sync() {
      const osReduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const want = !NC.settings.reducedFx() && !osReduce && !document.hidden;
      if (want && !this.running) {
        this.running = true;
        this.last = performance.now();
        requestAnimationFrame((t) => this.loop(t));
      } else if (!want) {
        this.running = false;
        this.drawStatic();
      }
    },
    drawStatic() {
      if (!this.ctx) return;
      this.ctx.clearRect(0, 0, this.w, this.h);
      for (const p of this.parts) this.dot(p, p.a * 0.6);
    },
    dot(p, a) {
      const c = this.ctx;
      c.globalAlpha = a;
      c.fillStyle = p.c;
      c.shadowColor = p.c;
      c.shadowBlur = 8;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fill();
    },
    loop(t) {
      if (!this.running) return;
      const dt = Math.min(3, (t - this.last) / 16.67);
      this.last = t;
      const c = this.ctx;
      c.clearRect(0, 0, this.w, this.h);
      for (let i = 0; i < this.parts.length; i++) {
        const p = this.parts[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.tw += 0.03 * dt;
        if (p.y < -10) this.parts[i] = this.spawn(false);
        this.dot(p, p.a * (0.6 + 0.4 * Math.sin(p.tw)));
      }
      c.globalAlpha = 1;
      c.shadowBlur = 0;
      requestAnimationFrame((tt) => this.loop(tt));
    },
  };

  // ---------------------------------------------------------------------------
  // Burst overlay (confetti / sparks)
  // ---------------------------------------------------------------------------
  const burst = {
    canvas: null, ctx: null, parts: [], running: false,
    init() {
      this.canvas = document.getElementById("fx-canvas");
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext("2d");
      const rs = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      rs();
      window.addEventListener("resize", rs);
    },
    add(list) {
      if (!this.ctx) return;
      this.parts.push(...list);
      if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
      if (!this.running) {
        this.running = true;
        requestAnimationFrame(() => this.loop());
      }
    },
    loop() {
      const c = this.ctx;
      c.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const p of this.parts) {
        p.vy += p.g;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1;
        p.rot += p.vr;
        const a = Math.max(0, Math.min(1, p.life / 40));
        c.globalAlpha = a;
        c.fillStyle = p.c;
        if (p.kind === "conf") {
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
          c.restore();
        } else {
          c.shadowColor = p.c;
          c.shadowBlur = 10;
          c.beginPath();
          c.arc(p.x, p.y, p.s, 0, Math.PI * 2);
          c.fill();
          c.shadowBlur = 0;
        }
      }
      c.globalAlpha = 1;
      this.parts = this.parts.filter((p) => p.life > 0 && p.y < window.innerHeight + 40);
      if (this.parts.length) requestAnimationFrame(() => this.loop());
      else { this.running = false; c.clearRect(0, 0, window.innerWidth, window.innerHeight); }
    },
  };

  function centerOf(target) {
    if (!target) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    if (typeof target.x === "number") return target;
    const r = target.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function confetti(target, amount) {
    if (NC.settings.reducedFx()) return;
    const { x, y } = centerOf(target);
    const n = amount || 120;
    const list = [];
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = Math.random() * 9 + 3;
      list.push({ kind: "conf", x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 5, g: 0.22, drag: 0.985, life: 90 + Math.random() * 60, s: Math.random() * 8 + 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: COLORS[i % COLORS.length] });
    }
    burst.add(list);
  }

  function sparks(target, color, amount) {
    if (NC.settings.reducedFx()) return;
    const { x, y } = centerOf(target);
    const n = amount || 24;
    const list = [];
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = Math.random() * 5 + 1.5;
      list.push({ kind: "spark", x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: 0.08, drag: 0.94, life: 30 + Math.random() * 25, s: Math.random() * 2 + 1, rot: 0, vr: 0, c: color || COLORS[i % COLORS.length] });
    }
    burst.add(list);
  }

  function floatText(target, text, color) {
    const { x, y } = centerOf(target);
    const el = document.createElement("div");
    el.className = "float-text";
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    if (color) el.style.color = color;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  function shake(el) {
    if (!el || NC.settings.reducedFx()) return;
    el.classList.remove("fx-shake");
    void el.offsetWidth;
    el.classList.add("fx-shake");
    setTimeout(() => el.classList.remove("fx-shake"), 600);
  }

  function flash(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 1200);
  }

  NC.fx = { init() { ambient.init(); burst.init(); }, confetti, sparks, floatText, shake, flash, COLORS };
})(typeof window !== "undefined" ? window : globalThis);
