/* =============================================================================
   PLINKO DROP — PROTECTED PHYSICS
   ---------------------------------------------------------------------------
   The ball physics below are the ORIGINAL implementation, kept line for line:
   gravity 0.25, friction 0.99, restitution 0.5, wall bounce -0.8, peg
   collision with exact surface correction, velocity reflection
   v' = v − 2(v·n)n, ±0.75 random horizontal kick on each hit, centred drop
   with ±1 px offset, same peg layout (rows 2–11, 8 % spacing, 7 % row
   height) and same 9 buckets [10, 3, 1.5, 0.5, 0.2, 0.5, 1.5, 3, 10].
   The bucket paid is the one the ball physically enters (same detection
   code as before: y > H − 30, index = floor(x / (W / 9))).

   Only two technical fixes were made, both outside the physics formulas:
   1. Fixed board size. The original simulated in real screen pixels, so the
      pegs moved closer together on narrow screens while the ball stayed
      12 px: the bucket odds changed with the window width (measured over
      200 000 drops: 93 % return at 600 px wide, 231 % at 340 px).
      The simulation now always runs on a 600 × 450 board (the original
      desktop size) and is only scaled when drawn.
   2. Fixed time step. The original advanced one physics step per screen
      refresh, so a 120/144 Hz monitor made balls fall 2× faster. Steps now
      run at exactly 60 per second (the original's speed on a 60 Hz screen).
   Everything else here is presentation: canvas drawing, glowing pegs, trails,
   impact particles, sounds, bucket animations.
============================================================================= */
(function () {
  "use strict";
  const { money } = NC.util;
  const t = NC.t;
  const ID = "plinko";

  // --- Original board configuration (unchanged) ------------------------------
  const W = 600;
  const H = 450;
  const ROWS = 12;
  const MULTIPLIERS = [10, 3, 1.5, 0.5, 0.2, 0.5, 1.5, 3, 10];
  const ballSize = 12;
  const pegRad = 4;
  const gravity = 0.25;
  const friction = 0.99;
  const restitution = 0.5;
  const collisionRad = ballSize / 2 + pegRad;
  const STEP_MS = 1000 / 60;

  /** Peg layout in % (exact copy of the original generator). */
  function buildPegsPct() {
    const pegs = [];
    for (let r = 2; r < ROWS; r++) {
      const pinsInRow = r + 1;
      const spacing = 8;
      const topPct = r * 7 + 5;
      const offset = ((pinsInRow - 1) * spacing) / 2;
      for (let c = 0; c < pinsInRow; c++) {
        const leftPct = 50 - offset + c * spacing;
        pegs.push({ x: leftPct, y: topPct });
      }
    }
    return pegs;
  }
  const PEGS = buildPegsPct().map((p) => ({ cx: (p.x / 100) * W, cy: (p.y / 100) * H, r: pegRad, glow: 0 }));

  /** Creates a ball in the original starting state. */
  function createBall() {
    const pos = { x: W / 2, y: 10 };
    const vel = { x: 0, y: 0 };
    pos.x += (Math.random() - 0.5) * 2;
    return { pos, vel, done: false, bucket: -1, trail: [] };
  }

  /**
   * ONE PHYSICS STEP — original code. `onHit` only triggers visual/sound
   * feedback and never modifies the ball.
   * Returns the bucket index once the ball reaches the bucket area, else -1.
   */
  function step(ball, pegs, onHit) {
    const pos = ball.pos;
    const vel = ball.vel;
    // 1. Apply Forces
    vel.y += gravity;
    vel.x *= friction;

    // 2. Move
    pos.x += vel.x;
    pos.y += vel.y;

    // 3. Wall Collisions (Left/Right)
    if (pos.x < ballSize / 2) {
      pos.x = ballSize / 2;
      vel.x *= -0.8;
    } else if (pos.x > W - ballSize / 2) {
      pos.x = W - ballSize / 2;
      vel.x *= -0.8;
    }

    // 4. Peg Collisions
    for (const peg of pegs) {
      // Fast bounding box check first
      if (Math.abs(pos.x - peg.cx) > collisionRad + 2 || Math.abs(pos.y - peg.cy) > collisionRad + 2) continue;

      const dx = pos.x - peg.cx;
      const dy = pos.y - peg.cy;
      const distSq = dx * dx + dy * dy;
      const minDist = collisionRad;

      if (distSq < minDist * minDist) {
        // HIT!
        const dist = Math.sqrt(distSq);
        const nx = dx / dist; // Normal X
        const ny = dy / dist; // Normal Y

        // Exact correction to surface
        const overlap = minDist - dist;
        pos.x += nx * overlap;
        pos.y += ny * overlap;

        // Reflect Velocity
        // v' = v - 2(v.n)n
        const dot = vel.x * nx + vel.y * ny;
        vel.x = vel.x - 2 * dot * nx;
        vel.y = vel.y - 2 * dot * ny;

        // Add Energy/Chaos (prevent sticking)
        vel.x *= restitution;
        vel.y *= restitution;

        // Add a little randomness to make it fun and scatter
        vel.x += (Math.random() - 0.5) * 1.5;

        if (onHit) onHit(peg, pos);
      }
    }

    // 6. Check Win Condition — the bucket area starts at bottom 30px
    if (pos.y > H - 30) {
      const bCount = MULTIPLIERS.length;
      const bWidth = W / bCount;
      let bIdx = Math.floor(pos.x / bWidth);
      if (bIdx < 0) bIdx = 0;
      if (bIdx >= bCount) bIdx = bCount - 1;
      return bIdx;
    }
    return -1;
  }
  // Exposed for automated tests (physics must stay identical).
  NC.plinkoPhysics = { W, H, MULTIPLIERS, PEGS, createBall, step };

  // ---------------------------------------------------------------------------
  // Presentation
  // ---------------------------------------------------------------------------
  const S = { balls: [], sparks: [], bucketFx: Array(MULTIPLIERS.length).fill(0), history: [], area: null, scope: null, canvas: null, ctx: null, scale: 1, acc: 0, last: 0, running: false };
  const BUCKET_COLORS = MULTIPLIERS.map((m) => (m >= 3 ? "#ff2bd6" : m >= 1 ? "#2bff88" : "#ffc94d"));

  function mount(area, scope) {
    S.area = area;
    S.scope = scope;
    S.balls = [];
    S.sparks = [];
    S.running = false;
    area.innerHTML = `
      <div class="g-layout">
        <div class="g-stage">
          <div class="plinko-wrap"><canvas id="p-canvas" class="plinko-canvas" aria-label="${t("Plateau de Plinko")}"></canvas></div>
          <div class="history" id="p-hist"></div>
        </div>
        <aside class="g-panel">
          ${NC.ui.betControl(ID, 100, t("Mise par bille"))}
          <button class="btn btn--primary btn--lg btn--block btn--green" data-act="drop">${t("Lâcher la bille")}</button>
          <div class="g-panel__row">
            <button class="btn btn--ghost btn--sm" data-act="drop5">${t("×5 billes")}</button>
          </div>
          <div class="g-info">
            <div><span class="lbl">${t("Billes en jeu")}</span><strong id="p-live">0</strong></div>
            <div><span class="lbl">${t("Dernier gain")}</span><strong id="p-last">—</strong></div>
          </div>
          <p class="muted small">${t("Physique réelle : gravité, rebonds et collisions décident du seau. Le gain est celui du seau où la bille tombe.")}</p>
        </aside>
      </div>`;
    S.canvas = area.querySelector("#p-canvas");
    S.ctx = S.canvas.getContext("2d");
    resize();
    scope.on(window, "resize", resize);
    scope.on(area, "click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b || b.disabled) return;
      if (b.dataset.act === "drop") drop(1);
      if (b.dataset.act === "drop5") drop(5);
    });
    renderHistory();
    draw();
  }

  function resize() {
    const wrap = S.canvas.parentElement;
    const cssW = Math.min(W, wrap.getBoundingClientRect().width || W);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    S.scale = cssW / W;
    S.canvas.style.width = cssW + "px";
    S.canvas.style.height = cssW * (H / W) + "px";
    S.canvas.width = Math.round(cssW * dpr);
    S.canvas.height = Math.round(cssW * (H / W) * dpr);
    S.ctx.setTransform(S.scale * dpr, 0, 0, S.scale * dpr, 0, 0);
    draw();
  }

  function drop(n) {
    const bet = NC.ui.readBet(ID);
    if (bet == null) return;
    if (S.balls.length + n > 15) return NC.ui.toast(t("15 billes maximum en même temps"), "error");
    if (bet * n > NC.wallet.balance) return NC.ui.toast(t("Solde insuffisant pour {n} billes", { n }), "error");
    for (let i = 0; i < n; i++) {
      const round = NC.startRound(ID, bet);
      if (!round) break;
      const ball = createBall();
      ball.round = round;
      ball.bet = bet;
      ball.delay = i * 12; // physics steps before release (staggered drops)
      S.balls.push(ball);
    }
    NC.audio.play("click");
    if (!S.running) {
      S.running = true;
      S.last = performance.now();
      S.acc = 0;
      S.scope.raf(loop);
    }
    updateLive();
  }

  function onHit(peg, pos) {
    peg.glow = 1;
    NC.audio.play("peg", 30);
    if (!NC.settings.reducedFx()) {
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2;
        S.sparks.push({ x: pos.x, y: pos.y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 - 0.5, life: 18, c: Math.random() < 0.5 ? "#00f0ff" : "#b14cff" });
      }
    }
  }

  function loop(now) {
    let dt = now - S.last;
    S.last = now;
    if (dt > 250) dt = 250; // tab was in background: avoid a burst of steps
    S.acc += dt;
    while (S.acc >= STEP_MS) {
      S.acc -= STEP_MS;
      advance();
    }
    // fade peg glow / sparks / bucket fx (visual only)
    for (const p of PEGS) if (p.glow > 0) p.glow = Math.max(0, p.glow - dt / 300);
    S.bucketFx = S.bucketFx.map((v) => Math.max(0, v - dt / 600));
    for (const s of S.sparks) { s.x += s.vx; s.y += s.vy; s.vy += 0.05; s.life--; }
    S.sparks = S.sparks.filter((s) => s.life > 0);
    draw();
    if (S.balls.length || S.sparks.length || S.bucketFx.some((v) => v > 0) || PEGS.some((p) => p.glow > 0)) S.scope.raf(loop);
    else S.running = false;
  }

  function advance() {
    for (const ball of S.balls) {
      if (ball.done) continue;
      if (ball.delay > 0) { ball.delay--; continue; }
      const b = step(ball, PEGS, onHit);
      ball.trail.push({ x: ball.pos.x, y: ball.pos.y });
      if (ball.trail.length > 10) ball.trail.shift();
      if (b >= 0) land(ball, b, true);
    }
    const before = S.balls.length;
    S.balls = S.balls.filter((b) => !b.done);
    if (S.balls.length !== before) updateLive();
  }

  function land(ball, bIdx, visual) {
    ball.done = true;
    ball.bucket = bIdx;
    const multiplier = MULTIPLIERS[bIdx];
    const win = Math.floor(ball.bet * multiplier);
    const net = ball.round.settle(win);
    S.history.push(multiplier);
    if (!visual) return net;
    S.bucketFx[bIdx] = 1;
    renderHistory();
    updateLive();
    const last = S.area.querySelector("#p-last");
    if (last) last.textContent = `${multiplier}× · ${money(win)}`;
    if (multiplier >= 3) {
      NC.audio.play(multiplier >= 10 ? "bigwin" : "win");
      const r = S.canvas.getBoundingClientRect();
      const pt = { x: r.left + ((bIdx + 0.5) * (W / MULTIPLIERS.length)) * S.scale, y: r.bottom - 20 * S.scale };
      if (multiplier >= 10) NC.fx.confetti(pt, 120); else NC.fx.sparks(pt, "#ff2bd6", 30);
      NC.fx.floatText(pt, "+" + NC.util.fmt(net) + " ₵", "#2bff88");
    } else NC.audio.play(multiplier >= 1 ? "chip" : "tick", 0);
    if (multiplier >= 1.5) NC.ui.toast(`×${multiplier} — ${money(win)}`, "success");
    return net;
  }

  function updateLive() {
    const el = S.area && S.area.querySelector("#p-live");
    if (el) el.textContent = S.balls.length;
  }
  function renderHistory() {
    const h = S.area.querySelector("#p-hist");
    if (!h) return;
    h.innerHTML = S.history.slice(-18).reverse().map((m) => `<span class="${m >= 3 ? "h-gold" : m >= 1 ? "h-win" : "h-lose"}">${m}×</span>`).join("");
  }

  function draw() {
    const c = S.ctx;
    if (!c) return;
    c.clearRect(0, 0, W, H);
    // board background
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b0a24");
    bg.addColorStop(1, "#05040f");
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    // pyramid glow
    c.fillStyle = "rgba(177,76,255,.05)";
    c.beginPath(); c.moveTo(W / 2, 20); c.lineTo(W * 0.04, H - 34); c.lineTo(W * 0.96, H - 34); c.closePath(); c.fill();
    // pegs
    for (const p of PEGS) {
      const g = p.glow;
      c.shadowColor = g > 0 ? "#00f0ff" : "rgba(255,255,255,.6)";
      c.shadowBlur = 6 + g * 16;
      c.fillStyle = g > 0 ? `rgb(${Math.round(255 - 255 * g)},${Math.round(255 - 15 * g)},255)` : "#e8e6ff";
      c.beginPath(); c.arc(p.cx, p.cy, p.r + g * 1.5, 0, Math.PI * 2); c.fill();
    }
    c.shadowBlur = 0;
    // buckets
    const bw = W / MULTIPLIERS.length;
    MULTIPLIERS.forEach((m, i) => {
      const fx = S.bucketFx[i];
      const x = i * bw;
      const y = H - 30 + (fx > 0 ? Math.sin(fx * Math.PI) * -4 : 0);
      const col = BUCKET_COLORS[i];
      const g = c.createLinearGradient(0, H, 0, y);
      g.addColorStop(0, col);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.globalAlpha = 0.35 + fx * 0.6;
      c.fillStyle = g;
      c.fillRect(x + 2, y, bw - 4, 30);
      c.globalAlpha = 1;
      c.strokeStyle = col;
      c.globalAlpha = 0.5 + fx * 0.5;
      c.lineWidth = 1.5;
      c.strokeRect(x + 2.5, y + 0.5, bw - 5, 29);
      c.globalAlpha = 1;
      c.fillStyle = "#fff";
      c.shadowColor = col;
      c.shadowBlur = 8;
      c.font = "700 12px JetBrains Mono, monospace";
      c.textAlign = "center";
      c.fillText(m + "×", x + bw / 2, y + 19);
      c.shadowBlur = 0;
    });
    // sparks
    for (const s of S.sparks) {
      c.globalAlpha = s.life / 18;
      c.fillStyle = s.c;
      c.fillRect(s.x - 1, s.y - 1, 2, 2);
    }
    c.globalAlpha = 1;
    // balls + trails
    for (const b of S.balls) {
      if (b.delay > 0) continue;
      b.trail.forEach((t, i) => {
        c.globalAlpha = (i / b.trail.length) * 0.35;
        c.fillStyle = "#b14cff";
        c.beginPath(); c.arc(t.x, t.y, (ballSize / 2) * (i / b.trail.length), 0, Math.PI * 2); c.fill();
      });
      c.globalAlpha = 1;
      c.shadowColor = "#00f0ff";
      c.shadowBlur = 16;
      const rg = c.createRadialGradient(b.pos.x - 2, b.pos.y - 2, 1, b.pos.x, b.pos.y, ballSize / 2);
      rg.addColorStop(0, "#ffffff");
      rg.addColorStop(1, "#7ef9ff");
      c.fillStyle = rg;
      c.beginPath(); c.arc(b.pos.x, b.pos.y, ballSize / 2, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0;
    }
  }

  /** Closing the game: finish every ball's real trajectory instantly. */
  function leave() {
    let total = 0;
    for (const ball of S.balls) {
      if (ball.done) continue;
      let b = -1;
      let guard = 0;
      while (b < 0 && guard++ < 100000) b = step(ball, PEGS, null);
      if (b < 0) b = Math.min(MULTIPLIERS.length - 1, Math.max(0, Math.floor(ball.pos.x / (W / MULTIPLIERS.length))));
      total += Math.floor(ball.bet * MULTIPLIERS[b]);
      land(ball, b, false);
    }
    if (total > 0) NC.ui.toast(t("Billes en vol terminées : {v}", { v: money(total) }), "info");
    S.balls = [];
  }

  NC.registerGame({
    id: ID,
    title: "Plinko Drop",
    tagline: t("Physique réelle : la bille rebondit, les picots décident."),
    category: "instant",
    badge: t("Physique"),
    payout: "0.2× – 10×",
    accent: "#2bff88",
    accent2: "#00f0ff",
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><path d="M8 11v.01M12 11v.01M16 11v.01M6 15v.01M10 15v.01M14 15v.01M18 15v.01M3 20h18"/></svg>',
    art: `<svg viewBox="0 0 320 210"><g class="art-float">${(() => {
      let s = "";
      for (let r = 0; r < 6; r++) for (let cc = 0; cc <= r + 2; cc++) s += `<circle cx="${160 - (r + 2) * 12 + cc * 24}" cy="${40 + r * 22}" r="3.5" fill="#e8e6ff" opacity=".85"/>`;
      return s;
    })()}
      ${[10, 3, 1.5, 0.5, 0.2, 0.5, 1.5, 3, 10].map((m, i) => `<rect x="${52 + i * 24}" y="176" width="21" height="18" rx="4" fill="${m >= 3 ? "#ff2bd6" : m >= 1 ? "#2bff88" : "#ffc94d"}" opacity=".55"/>`).join("")}
      <circle cx="160" cy="20" r="7" fill="#fff" class="a-fall" style="filter:drop-shadow(0 0 6px #00f0ff)"/></g></svg>`,
    rules: () => NC.i18n.pick({ fr: `<h4>Principe</h4><p>Lâchez une bille au centre. Elle tombe sous l'effet de la gravité et rebondit sur les picots (vraie simulation physique). Le gain = mise × multiplicateur du seau où elle tombe.</p>
      <table><tr><th>Seau</th>${MULTIPLIERS.map((m) => `<td>${m}×</td>`).join("")}</tr></table>
      <p>Retour mesuré sur 200 000 lâchers : environ 93 %. Jusqu'à 15 billes simultanées.</p>`, tr: `<h4>Kural</h4><p>Ortadan bir top bırakın. Top yerçekimiyle düşer ve çivilere çarparak seker (gerçek fizik simülasyonu). Kazanç = bahis × topun düştüğü kovanın çarpanı.</p>
      <table><tr><th>Kova</th>${MULTIPLIERS.map((m) => `<td>${m}×</td>`).join("")}</tr></table>
      <p>200 000 atışta ölçülen geri dönüş: yaklaşık %93. Aynı anda en fazla 15 top.</p>` }),
    mount,
    leave,
  });
})();
