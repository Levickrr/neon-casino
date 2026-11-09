/* =============================================================================
   ROCKET CRASH
   Crash point: P(crash ≥ m) = 0.99 / m  (1 % house edge), capped at 1000×.
   Multiplier grows as e^(0.09·t).
   Fixes vs. original: the rocket also exploded when it reached the edge of
   the screen (crash decided by visuals), crash point was a string compared
   loosely, a cash-out click could land after the crash, closing the window
   lost the bet, 10 % instant busts.
============================================================================= */
(function () {
  "use strict";
  const { money, fmt } = NC.util;
  const t = NC.t;
  const ID = "crash";
  const K = 0.09;
  const MAX = 1000;

  function crashPoint() {
    const u = NC.util.random();
    const cp = Math.floor((100 * 0.99) / (1 - u)) / 100;
    return Math.min(MAX, Math.max(1, cp));
  }
  const multAt = (t) => Math.floor(Math.exp(K * t) * 100) / 100;
  NC.crashMath = { crashPoint, multAt };

  const S = { phase: "idle", round: null, bet: 0, cp: 1, t0: 0, mult: 1, auto: 0, history: [], parts: [], stars: [], area: null, scope: null, canvas: null, ctx: null, w: 0, h: 0, endT: 0 };

  function mount(area, scope) {
    S.area = area;
    S.scope = scope;
    S.phase = "idle";
    area.innerHTML = `
      <div class="g-layout">
        <div class="g-stage">
          <div class="crash-stage" id="cr-stage">
            <canvas id="cr-canvas"></canvas>
            <div class="crash-hud">
              <div class="crash-mult" id="cr-mult">1.00×</div>
              <div class="crash-status" id="cr-status">${t("Prêt au décollage")}</div>
            </div>
          </div>
          <div class="history crash-hist" id="cr-hist"></div>
        </div>
        <aside class="g-panel">
          ${NC.ui.betControl(ID, 100)}
          <div class="field">
            <span class="lbl">${t("Encaissement auto (optionnel)")}</span>
            <input class="input" id="cr-auto" inputmode="decimal" placeholder="ex. 2.00" autocomplete="off">
          </div>
          <button class="btn btn--primary btn--lg btn--block" data-act="go" id="cr-btn">${t("Décollage")}</button>
          <div class="g-info">
            <div><span class="lbl">${t("Gain potentiel")}</span><strong id="cr-pot">—</strong></div>
            <div><span class="lbl">${t("Probabilité ≥ 2×")}</span><strong>49,5 %</strong></div>
          </div>
          <p class="muted small">${t("Chance d'atteindre m× : 99 % ÷ m. Encaissez avant l'explosion !")}</p>
        </aside>
      </div>`;
    S.canvas = area.querySelector("#cr-canvas");
    S.ctx = S.canvas.getContext("2d");
    S.stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.6 + 0.3 }));
    resize();
    scope.on(window, "resize", resize);
    scope.on(area, "click", (e) => { const b = e.target.closest("[data-act]"); if (b && !b.disabled) action(); });
    scope.on(document, "keydown", (e) => { if (e.key === " " && e.target.tagName !== "INPUT") { e.preventDefault(); action(); } });
    renderHistory();
    draw(0);
  }

  function resize() {
    const r = S.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    S.w = r.width;
    S.h = r.height;
    S.canvas.width = r.width * dpr;
    S.canvas.height = r.height * dpr;
    S.canvas.style.width = r.width + "px";
    S.canvas.style.height = r.height + "px";
    S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (S.phase !== "flying") draw(S.phase === "idle" ? 0 : S.endT);
  }

  function action() {
    if (S.phase === "idle") start();
    else if (S.phase === "flying") cashout(false);
  }

  function start() {
    const bet = NC.ui.readBet(ID);
    if (bet == null) return;
    const autoRaw = S.area.querySelector("#cr-auto").value.trim().replace(",", ".");
    let auto = 0;
    if (autoRaw) {
      auto = parseFloat(autoRaw);
      if (!(auto >= 1.01) || auto > MAX) return NC.ui.toast(t("Encaissement auto : entre 1.01 et 1000"), "error");
      auto = Math.floor(auto * 100) / 100;
    }
    const round = NC.startRound(ID, bet);
    if (!round) return;
    S.round = round;
    S.bet = bet;
    S.auto = auto;
    S.cp = crashPoint();
    S.t0 = performance.now();
    S.mult = 1;
    S.parts = [];
    S.phase = "flying";
    NC.ui.lockBet(ID, true);
    S.area.querySelector("#cr-auto").disabled = true;
    const btn = S.area.querySelector("#cr-btn");
    btn.textContent = t("Encaisser");
    btn.classList.add("btn--pink");
    S.area.querySelector("#cr-stage").className = "crash-stage is-flying";
    S.area.querySelector("#cr-status").textContent = t("En vol…");
    NC.audio.play("launch");
    S.scope.raf(loop);
  }

  function loop(now) {
    if (S.phase !== "flying") return;
    const sec = (now - S.t0) / 1000;
    const m = multAt(sec);
    if (m >= S.cp) return explode(Math.log(S.cp) / K);
    S.mult = m;
    if (S.auto && m >= S.auto) { S.mult = S.auto; return cashout(true); }
    const el = S.area.querySelector("#cr-mult");
    el.textContent = m.toFixed(2) + "×";
    el.dataset.tier = m >= 10 ? "3" : m >= 5 ? "2" : m >= 2 ? "1" : "0";
    S.area.querySelector("#cr-pot").textContent = money(Math.floor(S.bet * m));
    if (Math.floor(m * 10) !== Math.floor((S.lastM || 1) * 10)) NC.audio.play("tick", 0);
    S.lastM = m;
    draw(sec);
    S.scope.raf(loop);
  }

  function cashout(auto) {
    if (S.phase !== "flying") return;
    // Race guard: compute the multiplier at click time and compare with the crash point.
    const sec = (performance.now() - S.t0) / 1000;
    const live = auto ? S.auto : multAt(sec);
    if (live >= S.cp) return explode(Math.log(S.cp) / K);
    S.phase = "cashed";
    const m = live;
    const payout = Math.floor(S.bet * m);
    const net = S.round.settle(payout);
    S.endT = sec;
    const a = S.area;
    if (!a.isConnected) return;
    a.querySelector("#cr-mult").textContent = m.toFixed(2) + "×";
    a.querySelector("#cr-status").textContent = t("Encaissé à {m}× — la fusée continue…", { m: m.toFixed(2) });
    a.querySelector("#cr-stage").className = "crash-stage is-cashed";
    a.querySelector("#cr-btn").disabled = true;
    NC.ui.banner(a.querySelector("#cr-stage"), m >= 10 ? "big" : "win", `${m.toFixed(2)}×`, "+" + money(net));
    NC.ui.announce(net, payout, { target: a.querySelector("#cr-mult"), stake: S.bet, msg: t("Encaissé à {m}× : {v}", { m: m.toFixed(2), v: money(payout) }) });
    // let the rocket keep flying (visual only) until the real crash point
    const fly = (now) => {
      if (S.phase !== "cashed") return;
      const tt = (now - S.t0) / 1000;
      if (multAt(tt) >= S.cp || tt - sec > 6) return explode(Math.min(tt, Math.log(S.cp) / K), true);
      draw(tt, m);
      S.scope.raf(fly);
    };
    S.scope.raf(fly);
  }

  function explode(tCrash, alreadyPaid) {
    const wasFlying = S.phase === "flying";
    S.phase = "crashed";
    S.endT = tCrash;
    if (wasFlying && S.round && !S.round.settled) {
      const net = S.round.settle(0);
      NC.ui.announce(net, 0, { msg: t("Explosion à {m}× — perdu {v}", { m: S.cp.toFixed(2), v: money(S.bet) }) });
    }
    S.history.push(S.cp);
    const a = S.area;
    if (!a.isConnected) return;
    NC.audio.play("boom");
    const pos = rocketPos(tCrash);
    for (let i = 0; i < 70; i++) {
      const ang = Math.random() * Math.PI * 2, sp = Math.random() * 6 + 1;
      S.parts.push({ x: pos.x, y: pos.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 50 + Math.random() * 30, c: ["#ff3b5c", "#ffc94d", "#ff8a3d", "#fff"][i % 4] });
    }
    a.querySelector("#cr-mult").textContent = S.cp.toFixed(2) + "×";
    a.querySelector("#cr-mult").dataset.tier = "x";
    a.querySelector("#cr-status").textContent = alreadyPaid ? t("La fusée a explosé à {m}×", { m: S.cp.toFixed(2) }) : t("EXPLOSION !");
    a.querySelector("#cr-stage").className = "crash-stage is-crashed";
    NC.fx.shake(a.querySelector("#cr-stage"));
    a.querySelector("#cr-btn").disabled = true;
    renderHistory();
    const anim = () => {
      if (S.phase !== "crashed") return;
      draw(tCrash, null, true);
      if (S.parts.length) S.scope.raf(anim);
    };
    S.scope.raf(anim);
    S.scope.timeout(reset, 1800);
  }

  function reset() {
    S.phase = "idle";
    S.round = null;
    const a = S.area;
    if (!a.isConnected) return;
    NC.ui.lockBet(ID, false);
    a.querySelector("#cr-auto").disabled = false;
    const btn = a.querySelector("#cr-btn");
    btn.disabled = false;
    btn.textContent = t("Décollage");
    btn.classList.remove("btn--pink");
    a.querySelector("#cr-stage").className = "crash-stage";
    a.querySelector("#cr-status").textContent = t("Prêt au décollage");
    a.querySelector("#cr-pot").textContent = "—";
    S.parts = [];
    draw(0);
  }

  function renderHistory() {
    const h = S.area.querySelector("#cr-hist");
    if (!h) return;
    h.innerHTML = S.history.slice(-16).reverse().map((c) => `<span class="${c >= 10 ? "h-gold" : c >= 2 ? "h-win" : "h-lose"}">${c.toFixed(2)}×</span>`).join("");
  }

  // ---------------------------------------------------------------------------
  // Canvas drawing
  // ---------------------------------------------------------------------------
  function scales(t) {
    const tMax = Math.max(8, t * 1.25);
    const mMax = Math.max(2, Math.exp(K * t) * 1.3);
    return { tMax, mMax };
  }
  function toXY(t, m, sc) {
    const pad = 46;
    const x = pad + (t / sc.tMax) * (S.w - pad - 20);
    const y = S.h - pad - ((m - 1) / (sc.mMax - 1)) * (S.h - pad - 30);
    return { x, y };
  }
  function rocketPos(t) {
    const sc = scales(t);
    return toXY(t, Math.exp(K * t), sc);
  }

  function draw(t, cashedAt, crashed) {
    const c = S.ctx;
    if (!c) return;
    const w = S.w, h = S.h;
    c.clearRect(0, 0, w, h);
    // stars (parallax drift while flying)
    const drift = (t * 0.03) % 1;
    c.fillStyle = "#fff";
    for (const s of S.stars) {
      const x = ((s.x - drift * s.s * 0.4 + 2) % 1) * w;
      c.globalAlpha = 0.25 + s.s * 0.3;
      c.fillRect(x, s.y * h, s.s, s.s);
    }
    c.globalAlpha = 1;
    const sc = scales(t);
    // grid
    c.strokeStyle = "rgba(160,150,255,.12)";
    c.fillStyle = "rgba(185,181,217,.6)";
    c.font = "11px JetBrains Mono, monospace";
    c.lineWidth = 1;
    const steps = niceSteps(sc.mMax);
    for (const m of steps) {
      const p = toXY(0, m, sc);
      c.beginPath(); c.moveTo(40, p.y); c.lineTo(w - 10, p.y); c.stroke();
      c.fillText(m.toFixed(m < 10 ? 1 : 0) + "×", 6, p.y + 4);
    }
    if (t <= 0) return;
    // curve
    const pts = [];
    const N = 80;
    for (let i = 0; i <= N; i++) {
      const tt = (t * i) / N;
      pts.push(toXY(tt, Math.exp(K * tt), sc));
    }
    const col = crashed ? "#ff3b5c" : cashedAt ? "#2bff88" : "#00f0ff";
    const g = c.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, crashed ? "rgba(255,59,92,.28)" : "rgba(0,240,255,.25)");
    c.beginPath();
    c.moveTo(pts[0].x, h - 46);
    pts.forEach((p) => c.lineTo(p.x, p.y));
    c.lineTo(pts[pts.length - 1].x, h - 46);
    c.closePath();
    c.fillStyle = g;
    c.fill();
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.strokeStyle = col;
    c.lineWidth = 3.5;
    c.shadowColor = col;
    c.shadowBlur = 16;
    c.stroke();
    c.shadowBlur = 0;
    if (cashedAt) {
      const tc = Math.log(cashedAt) / K;
      const p = toXY(tc, cashedAt, sc);
      c.fillStyle = "#2bff88";
      c.beginPath(); c.arc(p.x, p.y, 6, 0, Math.PI * 2); c.fill();
    }
    const tip = pts[pts.length - 1];
    const prev = pts[pts.length - 3] || pts[0];
    if (!crashed) drawRocket(c, tip.x, tip.y, Math.atan2(tip.y - prev.y, tip.x - prev.x), t);
    // particles
    for (const p of S.parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.vx *= 0.97; p.life--;
      c.globalAlpha = Math.max(0, p.life / 60);
      c.fillStyle = p.c;
      c.beginPath(); c.arc(p.x, p.y, 2.5, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    S.parts = S.parts.filter((p) => p.life > 0);
  }

  function niceSteps(max) {
    const raw = (max - 1) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= raw) || raw;
    const out = [];
    for (let m = 1; m <= max + 1e-9; m += step) out.push(m);
    return out;
  }

  function drawRocket(c, x, y, ang, t) {
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    // flame
    const fl = 14 + Math.sin(t * 40) * 4;
    const fg = c.createLinearGradient(-fl - 14, 0, -14, 0);
    fg.addColorStop(0, "rgba(255,43,214,0)");
    fg.addColorStop(1, "#ffc94d");
    c.fillStyle = fg;
    c.beginPath(); c.moveTo(-14, -5); c.lineTo(-14 - fl, 0); c.lineTo(-14, 5); c.fill();
    // body
    c.shadowColor = "#00f0ff";
    c.shadowBlur = 18;
    c.fillStyle = "#e9f7ff";
    c.beginPath(); c.moveTo(18, 0); c.quadraticCurveTo(8, -9, -14, -7); c.lineTo(-14, 7); c.quadraticCurveTo(8, 9, 18, 0); c.fill();
    c.shadowBlur = 0;
    c.fillStyle = "#ff2bd6";
    c.beginPath(); c.moveTo(-8, -7); c.lineTo(-16, -14); c.lineTo(-14, -6); c.fill();
    c.beginPath(); c.moveTo(-8, 7); c.lineTo(-16, 14); c.lineTo(-14, 6); c.fill();
    c.fillStyle = "#00f0ff";
    c.beginPath(); c.arc(4, 0, 3.5, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function leave() {
    if (S.phase === "flying") {
      const sec = (performance.now() - S.t0) / 1000;
      const m = multAt(sec);
      if (m >= S.cp) { S.round.settle(0); }
      else {
        const payout = Math.floor(S.bet * m);
        S.round.settle(payout);
        NC.ui.toast(t("Encaissement automatique à {m}× : {v}", { m: m.toFixed(2), v: money(payout) }), "success");
      }
    }
    S.phase = "idle";
  }

  NC.registerGame({
    id: ID,
    title: "Rocket Crash",
    tagline: t("Le multiplicateur s'envole. Encaissez avant l'explosion."),
    category: "instant",
    badge: t("High Risk"),
    payout: t("Jusqu'à 1000×"),
    accent: "#00f0ff",
    accent2: "#ff2bd6",
    icon: '<svg viewBox="0 0 24 24"><path d="M5 19c2-6 7-12 15-15-3 8-9 13-15 15zM5 19l3-1M5 19l1-3"/><circle cx="14.5" cy="9.5" r="1.5"/></svg>',
    art: `<svg viewBox="0 0 320 210"><defs><linearGradient id="cr-g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#00f0ff" stop-opacity="0"/><stop offset="1" stop-color="#00f0ff"/></linearGradient></defs>
      <path d="M30 180 Q190 175 270 40" fill="none" stroke="url(#cr-g)" stroke-width="5"/>
      <path d="M30 180 Q190 175 270 40 L270 180Z" fill="#00f0ff" opacity=".08"/>
      <g class="art-float a-bob"><g transform="translate(262 46) rotate(-58)"><path d="M22 0 Q10 -11 -16 -8 L-16 8 Q10 11 22 0Z" fill="#e9f7ff"/><path d="M-10 -8 L-20 -17 L-16 -7Z M-10 8 L-20 17 L-16 7Z" fill="#ff2bd6"/><circle cx="5" cy="0" r="4" fill="#00f0ff"/><path d="M-16 -5 L-40 0 L-16 5Z" fill="#ffc94d" class="a-pulse"/></g></g>
      <text x="40" y="70" font-family="Unbounded" font-weight="900" font-size="34" fill="#fff">4.27×</text></svg>`,
    rules: () => NC.i18n.pick({ fr: `<h4>Principe</h4><p>Misez puis décollez. Le multiplicateur monte jusqu'à un point d'explosion aléatoire. Encaissez avant : gain = mise × multiplicateur.</p>
      <h4>Probabilités</h4><p>Chance que la fusée atteigne m× : 99 % ÷ m (2× : 49,5 %, 10× : 9,9 %). Environ 1 % des vols explosent à 1.00×. Maximum 1000×.</p>
      <h4>Sécurité</h4><ul><li>Un seul vol à la fois.</li><li>Un clic arrivé après l'explosion ne paie pas.</li><li>Fermer le jeu en plein vol encaisse automatiquement.</li></ul>`, tr: `<h4>Kural</h4><p>Bahsinizi yapın ve kalkışa geçin. Çarpan, rastgele bir patlama noktasına kadar yükselir. Ondan önce bozdurun: kazanç = bahis × çarpan.</p>
      <h4>Olasılıklar</h4><p>Roketin m× değerine ulaşma şansı: %99 ÷ m (2×: %49,5, 10×: %9,9). Uçuşların yaklaşık %1'i 1.00×'te patlar. En fazla 1000×.</p>
      <h4>Güvenlik</h4><ul><li>Aynı anda tek uçuş.</li><li>Patlamadan sonra gelen tıklama ödeme yapmaz.</li><li>Uçuş sırasında oyunu kapatmak otomatik bozdurur.</li></ul>` }),
    mount,
    leave,
  });
})();
