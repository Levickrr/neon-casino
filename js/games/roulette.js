/* =============================================================================
   ROULETTE — European single zero, full betting board.
   Animation is JavaScript-driven (requestAnimationFrame) so it always plays:
   - the wheel turns continuously (slowly when idle, fast after a launch),
   - the ball is launched counter-clockwise on the outer track, slows down,
     drops toward the pockets, bounces over a few of them and settles,
   - the ball's angle is computed RELATIVE TO THE WHEEL, so it always ends
     in the pocket of the number actually drawn (crypto-random, uniform).
============================================================================= */
(function () {
  "use strict";
  const { money } = NC.util;
  const t = NC.t;
  const ID = "roulette";
  const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const color = (n) => (n === 0 ? "green" : REDS.has(n) ? "red" : "black");
  const SLICE = 360 / 37;
  const CHIPS = [10, 50, 100, 500, 1000, 5000, 25000];
  const IDLE_SPEED = 14; // deg/s
  // Ball radii as a fraction of the wheel radius (SVG 400 → R 200)
  const R_TRACK = 0.935; // outer ball track
  const R_POCKET = 0.765; // pocket ring (between number ring and hub)

  /** Total returned for 1 credit on `key` if `n` comes out. */
  function payFor(key, n) {
    if (key.startsWith("n:")) return +key.slice(2) === n ? 36 : 0;
    if (n === 0) return 0;
    switch (key) {
      case "red": return REDS.has(n) ? 2 : 0;
      case "black": return !REDS.has(n) ? 2 : 0;
      case "odd": return n % 2 === 1 ? 2 : 0;
      case "even": return n % 2 === 0 ? 2 : 0;
      case "low": return n <= 18 ? 2 : 0;
      case "high": return n >= 19 ? 2 : 0;
      case "d1": return n <= 12 ? 3 : 0;
      case "d2": return n >= 13 && n <= 24 ? 3 : 0;
      case "d3": return n >= 25 ? 3 : 0;
      case "c1": return n % 3 === 1 ? 3 : 0;
      case "c2": return n % 3 === 2 ? 3 : 0;
      case "c3": return n % 3 === 0 ? 3 : 0;
    }
    return 0;
  }
  /** Pocket index under a given angle measured clockwise from the top, in the wheel's frame. */
  function pocketAt(relDeg) {
    const a = ((relDeg % 360) + 360) % 360;
    return Math.floor(a / SLICE) % 37;
  }
  NC.rouletteMath = { payFor, WHEEL, color, pocketAt, SLICE };

  const S = {
    bets: {}, stack: [], last: null, chip: 100, spinning: false, history: [], pending: null, area: null, scope: null,
    wheel: 0, ballRel: 0, ballR: R_POCKET, lastIdx: 0, anim: null, lastT: 0, tickAcc: 0,
  };

  // ---------------------------------------------------------------------------
  // Wheel drawing
  // ---------------------------------------------------------------------------
  function wheelSVG() {
    const cx = 200, cy = 200;
    const p = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
    let out = "";
    WHEEL.forEach((n, i) => {
      const a0 = ((i * SLICE - 90) * Math.PI) / 180;
      const a1 = (((i + 1) * SLICE - 90) * Math.PI) / 180;
      const fill = n === 0 ? "#10c870" : REDS.has(n) ? "#e0123f" : "#0d0b1f";
      // number ring
      out += `<path d="M${p(162, a0)} L${p(188, a0)} A188 188 0 0 1 ${p(188, a1)} L${p(162, a1)} A162 162 0 0 0 ${p(162, a0)}Z" fill="${fill}" stroke="rgba(255,255,255,.22)" stroke-width="1"/>`;
      // pocket (darker) where the ball lands
      out += `<path d="M${p(132, a0)} L${p(162, a0)} A162 162 0 0 1 ${p(162, a1)} L${p(132, a1)} A132 132 0 0 0 ${p(132, a0)}Z" fill="${fill}" opacity=".55" stroke="rgba(255,255,255,.35)" stroke-width="1.2" data-pocket="${i}"/>`;
      const am = (((i + 0.5) * SLICE - 90) * Math.PI) / 180;
      const tx = cx + 175 * Math.cos(am), ty = cy + 175 * Math.sin(am);
      out += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" transform="rotate(${((i + 0.5) * SLICE).toFixed(2)} ${tx.toFixed(1)} ${ty.toFixed(1)})" text-anchor="middle" dominant-baseline="central" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="#fff">${n}</text>`;
    });
    // frets
    let frets = "";
    for (let i = 0; i < 37; i++) {
      const a = ((i * SLICE - 90) * Math.PI) / 180;
      frets += `<line x1="${(cx + 132 * Math.cos(a)).toFixed(2)}" y1="${(cy + 132 * Math.sin(a)).toFixed(2)}" x2="${(cx + 162 * Math.cos(a)).toFixed(2)}" y2="${(cy + 162 * Math.sin(a)).toFixed(2)}" stroke="#ffd98a" stroke-width="1.6" opacity=".7"/>`;
    }
    return `<svg viewBox="0 0 400 400" class="rw-svg">
      <defs><radialGradient id="rw-hub" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#2a2370"/><stop offset="1" stop-color="#07061a"/></radialGradient>
      <linearGradient id="rw-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00f0ff"/><stop offset=".5" stop-color="#b14cff"/><stop offset="1" stop-color="#ff2bd6"/></linearGradient>
      <radialGradient id="rw-cone" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#3b2f8f"/><stop offset=".7" stop-color="#151036"/><stop offset="1" stop-color="#0a0820"/></radialGradient></defs>
      ${out}${frets}
      <circle cx="200" cy="200" r="132" fill="url(#rw-cone)" stroke="url(#rw-rim)" stroke-width="2.5"/>
      <g stroke="rgba(0,240,255,.55)" stroke-width="2.5" stroke-linecap="round">${[0, 90, 180, 270].map((a) => `<line x1="200" y1="200" x2="${200 + 92 * Math.cos((a * Math.PI) / 180)}" y2="${200 + 92 * Math.sin((a * Math.PI) / 180)}"/>`).join("")}</g>
      ${[0, 90, 180, 270].map((a) => `<circle cx="${200 + 92 * Math.cos((a * Math.PI) / 180)}" cy="${200 + 92 * Math.sin((a * Math.PI) / 180)}" r="6" fill="#00f0ff"/>`).join("")}
      <circle cx="200" cy="200" r="36" fill="#0b0a22" stroke="#00f0ff" stroke-width="2"/>
      <text x="200" y="200" text-anchor="middle" dominant-baseline="central" font-family="Unbounded" font-weight="900" font-size="18" fill="#fff">NC</text>
      <circle cx="200" cy="200" r="188" fill="none" stroke="url(#rw-rim)" stroke-width="3"/>
    </svg>`;
  }

  function boardHTML() {
    let nums = "";
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 12; col++) {
        const n = col * 3 + (3 - row);
        nums += `<button class="rb-cell rb-num rb-${color(n)}" data-bet="n:${n}" style="grid-row:${row + 1};grid-column:${col + 2}">${n}</button>`;
      }
      nums += `<button class="rb-cell rb-col" data-bet="c${3 - row}" style="grid-row:${row + 1};grid-column:14">2:1</button>`;
    }
    return `<div class="rb">
      <div class="rb-grid">
        <button class="rb-cell rb-num rb-green rb-zero" data-bet="n:0" style="grid-row:1/4;grid-column:1">0</button>
        ${nums}
        <button class="rb-cell rb-out" data-bet="d1" style="grid-row:4;grid-column:2/6">${t("1re douzaine")}</button>
        <button class="rb-cell rb-out" data-bet="d2" style="grid-row:4;grid-column:6/10">${t("2e douzaine")}</button>
        <button class="rb-cell rb-out" data-bet="d3" style="grid-row:4;grid-column:10/14">${t("3e douzaine")}</button>
        <button class="rb-cell rb-out" data-bet="low" style="grid-row:5;grid-column:2/4">1–18</button>
        <button class="rb-cell rb-out" data-bet="even" style="grid-row:5;grid-column:4/6">${t("Pair")}</button>
        <button class="rb-cell rb-out rb-red" data-bet="red" style="grid-row:5;grid-column:6/8">◆ ${t("Rouge")}</button>
        <button class="rb-cell rb-out rb-black" data-bet="black" style="grid-row:5;grid-column:8/10">◆ ${t("Noir")}</button>
        <button class="rb-cell rb-out" data-bet="odd" style="grid-row:5;grid-column:10/12">${t("Impair")}</button>
        <button class="rb-cell rb-out" data-bet="high" style="grid-row:5;grid-column:12/14">19–36</button>
      </div></div>`;
  }

  function mount(area, scope) {
    S.area = area;
    S.scope = scope;
    S.bets = {};
    S.stack = [];
    S.spinning = false;
    S.anim = null;
    area.innerHTML = `
      <div class="roul">
        <div class="roul__top">
          <div class="rw" id="rw">
            <div class="rw-pointer"></div>
            <div class="rw-wheel" id="rw-wheel">${wheelSVG()}</div>
            <i class="rw-ball" id="rw-ball"></i>
          </div>
          <div class="roul__side">
            <div class="roul__result" id="rr-result"><span class="lbl">${t("Résultat")}</span><strong id="rr-num">${S.history.length ? S.history[S.history.length - 1] : "–"}</strong></div>
            <div><span class="lbl">${t("Derniers numéros")}</span><div class="history" id="rr-hist"></div></div>
            <div class="g-info">
              <div><span class="lbl">${t("Mise totale")}</span><strong id="rr-total">0 ₵</strong></div>
              <div><span class="lbl">${t("Dernier gain")}</span><strong id="rr-win">—</strong></div>
            </div>
          </div>
        </div>
        ${boardHTML()}
        <div class="roul__controls">
          <div class="chips" id="rr-chips">${CHIPS.map((c) => `<button class="chip chip--${c}${c === S.chip ? " is-active" : ""}" data-chip="${c}" aria-label="${t("Jeton {v}", { v: c })}">${c >= 1000 ? c / 1000 + "k" : c}</button>`).join("")}</div>
          <div class="roul__btns">
            <button class="btn btn--ghost btn--sm" data-act="undo">${t("Annuler")}</button>
            <button class="btn btn--ghost btn--sm" data-act="clear">${t("Effacer")}</button>
            <button class="btn btn--ghost btn--sm" data-act="double">×2</button>
            <button class="btn btn--ghost btn--sm" data-act="rebet">${t("Rejouer")}</button>
            <button class="btn btn--primary btn--lg" data-act="spin">${t("Lancer la bille")}</button>
          </div>
        </div>
      </div>`;
    renderHistory();
    renderBets();
    scope.on(area, "click", onClick);
    scope.on(area, "contextmenu", (e) => {
      const cell = e.target.closest("[data-bet]");
      if (!cell) return;
      e.preventDefault();
      removeBet(cell.dataset.bet);
    });
    S.lastT = performance.now();
    scope.raf(frame);
  }

  // ---------------------------------------------------------------------------
  // Animation loop (always running while the game is open)
  // ---------------------------------------------------------------------------
  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  function frame(now) {
    const dt = Math.min(0.05, (now - S.lastT) / 1000);
    S.lastT = now;
    const a = S.anim;
    if (a) {
      const el = (now - a.t0) / 1000;
      const k = clamp01(el / a.T);
      // wheel speed: quick push then slow decay back to idle
      const push = el < 0.5 ? el / 0.5 : Math.exp(-(el - 0.5) / (a.T * 0.45));
      S.wheel += (IDLE_SPEED + (a.wheelPeak - IDLE_SPEED) * push) * dt;
      // ball angle relative to the wheel: travels `a.dist` degrees counter-clockwise,
      // decelerating, then a few decaying bounces around the final pocket.
      const travel = easeOutCubic(clamp01(el / (a.T * 0.82)));
      let rel = a.target + a.dist * (1 - travel);
      const kb = clamp01((el - a.T * 0.62) / (a.T * 0.38)); // bounce phase
      if (kb > 0 && kb < 1) rel += a.bounceAmp * Math.sin(kb * Math.PI * 3.2) * Math.pow(1 - kb, 2);
      S.ballRel = rel;
      // radius: on the outer track, then drops into the pocket ring with hops
      const kd = clamp01((el - a.T * 0.55) / (a.T * 0.2));
      let r = R_TRACK - (R_TRACK - R_POCKET) * easeOutCubic(kd);
      if (kd >= 1) {
        const kh = clamp01((el - a.T * 0.75) / (a.T * 0.2));
        r += 0.05 * Math.abs(Math.sin(kh * Math.PI * 3)) * Math.pow(1 - kh, 2);
      }
      S.ballR = r;
      // ticking sounds when the ball skips over frets
      const fretNow = Math.floor((rel - S.wheel * 0) / SLICE);
      if (kd > 0 && fretNow !== a.lastFret) { a.lastFret = fretNow; NC.audio.play("ball", 45); }
      if (k >= 1) {
        S.ballRel = a.target;
        S.ballR = R_POCKET;
        S.anim = null;
        resolve();
      }
    } else {
      S.wheel += IDLE_SPEED * dt;
    }
    S.wheel %= 360;
    draw();
    S.scope.raf(frame);
  }

  function draw() {
    const a = S.area;
    const wheel = a.querySelector("#rw-wheel");
    const ball = a.querySelector("#rw-ball");
    const box = a.querySelector("#rw");
    if (!wheel || !ball || !box) return;
    wheel.style.transform = `rotate(${S.wheel.toFixed(3)}deg)`;
    const abs = ((S.wheel + S.ballRel) * Math.PI) / 180; // clockwise from the top
    const half = box.clientWidth / 2;
    const rr = S.ballR * half * (188 / 200);
    ball.style.transform = `translate(${(half + rr * Math.sin(abs)).toFixed(2)}px, ${(half - rr * Math.cos(abs)).toFixed(2)}px)`;
    ball.dataset.rel = (((S.ballRel % 360) + 360) % 360).toFixed(2);
  }

  // ---------------------------------------------------------------------------
  // Bets
  // ---------------------------------------------------------------------------
  function staged() { return Object.values(S.bets).reduce((x, y) => x + y, 0); }

  function onClick(e) {
    const chip = e.target.closest("[data-chip]");
    if (chip) {
      S.chip = +chip.dataset.chip;
      S.area.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === chip));
      NC.audio.play("chip");
      return;
    }
    const cell = e.target.closest("[data-bet]");
    if (cell) return addBet(cell.dataset.bet, S.chip);
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled || S.spinning) return;
    const act = b.dataset.act;
    if (act === "undo") {
      const lastOp = S.stack.pop();
      if (lastOp) { S.bets[lastOp.key] -= lastOp.amt; if (S.bets[lastOp.key] <= 0) delete S.bets[lastOp.key]; }
    } else if (act === "clear") { S.bets = {}; S.stack = []; }
    else if (act === "double") {
      const total = staged();
      if (!total) return;
      if (total * 2 > NC.wallet.balance) return NC.ui.toast(t("Solde insuffisant pour doubler"), "error");
      Object.keys(S.bets).forEach((k) => { S.stack.push({ key: k, amt: S.bets[k] }); S.bets[k] *= 2; });
    } else if (act === "rebet") {
      if (!S.last) return NC.ui.toast(t("Aucune mise précédente"), "info");
      const total = Object.values(S.last).reduce((x, y) => x + y, 0);
      if (total > NC.wallet.balance) return NC.ui.toast(t("Solde insuffisant"), "error");
      S.bets = Object.assign({}, S.last);
      S.stack = Object.keys(S.bets).map((k) => ({ key: k, amt: S.bets[k] }));
    } else if (act === "spin") return spin();
    NC.audio.play("chip");
    renderBets();
  }

  function addBet(key, amt) {
    if (S.spinning) return;
    if (staged() + amt > NC.wallet.balance) return NC.ui.toast(t("Solde insuffisant pour ce jeton"), "error");
    S.bets[key] = (S.bets[key] || 0) + amt;
    S.stack.push({ key, amt });
    NC.audio.play("chip");
    renderBets();
  }
  function removeBet(key) {
    if (S.spinning || !S.bets[key]) return;
    delete S.bets[key];
    S.stack = S.stack.filter((s) => s.key !== key);
    NC.audio.play("chip");
    renderBets();
  }

  function renderBets() {
    const a = S.area;
    a.querySelectorAll("[data-bet]").forEach((cell) => {
      const v = S.bets[cell.dataset.bet];
      let m = cell.querySelector(".rb-stack");
      if (v) {
        if (!m) { m = document.createElement("span"); m.className = "rb-stack"; cell.appendChild(m); }
        m.textContent = v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k" : v;
      } else if (m) m.remove();
    });
    a.querySelector("#rr-total").textContent = money(staged());
    a.querySelectorAll("[data-act]").forEach((b) => (b.disabled = S.spinning));
    a.querySelector('[data-act="spin"]').disabled = S.spinning || !staged();
    a.querySelector(".rb").classList.toggle("is-locked", S.spinning);
  }

  function renderHistory() {
    const h = S.area.querySelector("#rr-hist");
    if (!h) return;
    h.innerHTML = S.history.slice(-14).reverse().map((n) => `<span class="rr-h rr-h--${color(n)}">${n}</span>`).join("");
  }

  // ---------------------------------------------------------------------------
  // Spin
  // ---------------------------------------------------------------------------
  function spin() {
    const total = staged();
    if (!total) return NC.ui.toast(t("Placez au moins un jeton"), "error");
    const round = NC.startRound(ID, total);
    if (!round) return NC.ui.toast(t("Solde insuffisant"), "error");
    S.spinning = true;
    S.last = Object.assign({}, S.bets);
    const bets = Object.assign({}, S.bets);
    const idx = NC.util.randInt(37); // uniform, crypto-based
    const n = WHEEL[idx];
    let payout = 0;
    for (const k of Object.keys(bets)) payout += bets[k] * payFor(k, n);
    S.pending = { round, n, idx, payout, total, bets };
    renderBets();
    S.area.querySelector("#rr-num").textContent = "…";
    S.area.querySelector("#rr-result").className = "roul__result is-spinning";
    S.area.querySelectorAll(".rb-cell.is-hit").forEach((c) => c.classList.remove("is-hit"));

    // Natural variation: duration, wheel push and number of ball laps differ every spin.
    const T = NC.util.dur(6200 + NC.util.random() * 1600) / 1000; // seconds
    const laps = 7 + NC.util.randInt(4);
    const target = (idx + 0.5) * SLICE + (NC.util.random() - 0.5) * SLICE * 0.5;
    const cur = ((S.ballRel % 360) + 360) % 360;
    const toTarget = (((cur - target) % 360) + 360) % 360;
    S.anim = {
      t0: performance.now(),
      T: T,
      target,
      dist: toTarget + laps * 360, // counter-clockwise relative travel
      wheelPeak: 140 + NC.util.random() * 80,
      bounceAmp: SLICE * (0.8 + NC.util.random() * 1.4) * (NC.util.random() < 0.5 ? -1 : 1),
      lastFret: null,
    };
    // keep the end state exact even if T was shortened (tests)
    S.anim.T = Math.max(0.3, T);
    NC.audio.play("spin", 500);
  }

  function resolve() {
    const p = S.pending;
    if (!p) return;
    S.pending = null;
    if (S.anim) { S.ballRel = S.anim.target; S.anim = null; }
    S.ballR = R_POCKET;
    const net = p.round.settle(p.payout);
    S.history.push(p.n);
    S.lastIdx = p.idx;
    S.spinning = false;
    const a = S.area;
    if (!a.isConnected) return;
    const res = a.querySelector("#rr-result");
    res.className = "roul__result roul__result--" + color(p.n);
    a.querySelector("#rr-num").textContent = p.n;
    a.querySelector("#rr-win").textContent = p.payout ? money(p.payout) : "—";
    renderHistory();
    const pocket = a.querySelector(`[data-pocket="${p.idx}"]`);
    if (pocket) { pocket.classList.add("is-hit"); S.scope.timeout(() => pocket.classList.remove("is-hit"), 3000); }
    const cell = a.querySelector(`[data-bet="n:${p.n}"]`);
    if (cell) cell.classList.add("is-hit");
    S.bets = {};
    S.stack = [];
    renderBets();
    const cname = { red: t("Rouge"), black: t("Noir"), green: t("Vert") }[color(p.n)];
    NC.ui.banner(a.querySelector(".roul__top"), net > 0 ? (p.payout >= p.total * 10 ? "big" : "win") : net === 0 ? "push" : "lose", `${p.n} ${cname}`, net > 0 ? "+" + money(net) : net === 0 ? t("Mise rendue") : "−" + money(-net));
    NC.ui.announce(net, p.payout, { target: res, stake: p.total, msg: net > 0 ? t("{n} {c} — gain {v}", { n: p.n, c: cname, v: money(p.payout) }) : net < 0 ? t("{n} {c} — perdu", { n: p.n, c: cname }) : undefined });
  }

  function leave() {
    if (S.pending) resolve();
  }

  NC.registerGame({
    id: ID,
    title: t("Roulette"),
    tagline: t("Roulette européenne, tapis complet, une seule case zéro."),
    category: "table",
    badge: t("Table"),
    payout: t("Jusqu'à 36×"),
    accent: "#ff2bd6",
    accent2: "#b14cff",
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/></svg>',
    art: `<svg viewBox="0 0 320 210"><defs><linearGradient id="ro-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2bd6"/><stop offset="1" stop-color="#b14cff"/></linearGradient></defs>
      <ellipse cx="160" cy="185" rx="120" ry="18" fill="#ff2bd6" opacity=".12"/>
      <g class="art-float"><g class="a-spin">
        <circle cx="160" cy="100" r="78" fill="#0b0a22" stroke="url(#ro-g)" stroke-width="4"/>
        ${Array.from({ length: 18 }, (_, i) => `<path d="M160 100 L${160 + 74 * Math.cos((i * 20 * Math.PI) / 180)} ${100 + 74 * Math.sin((i * 20 * Math.PI) / 180)} A74 74 0 0 1 ${160 + 74 * Math.cos(((i * 20 + 20) * Math.PI) / 180)} ${100 + 74 * Math.sin(((i * 20 + 20) * Math.PI) / 180)}Z" fill="${i === 0 ? "#10c870" : i % 2 ? "#e0123f" : "#14112e"}" opacity=".9"/>`).join("")}
        <circle cx="160" cy="100" r="40" fill="#0b0a22" stroke="#00f0ff" stroke-width="2"/></g>
        <circle cx="160" cy="34" r="7" fill="#fff" class="a-pulse"/></g></svg>`,
    rules: () => NC.i18n.pick({
      fr: `<h4>Mises</h4><p>Sélectionnez un jeton puis cliquez sur le tapis. Clic droit = retirer la mise d'une case.</p>
      <table><tr><th>Mise</th><th>Paiement</th><th>Retour total</th></tr>
      <tr><td>Numéro plein (0–36)</td><td>35:1</td><td>36×</td></tr>
      <tr><td>Douzaine / Colonne</td><td>2:1</td><td>3×</td></tr>
      <tr><td>Rouge/Noir, Pair/Impair, 1–18/19–36</td><td>1:1</td><td>2×</td></tr></table>
      <p>Sur le 0, toutes les mises simples et les douzaines/colonnes perdent. Avantage maison : 2,7 %. Le numéro est tiré au hasard (générateur cryptographique) et la bille s'arrête toujours dessus.</p>`,
      tr: `<h4>Bahisler</h4><p>Bir fiş seçin, sonra masaya tıklayın. Sağ tık = o kutudaki bahsi kaldırır.</p>
      <table><tr><th>Bahis</th><th>Ödeme</th><th>Toplam dönüş</th></tr>
      <tr><td>Tek sayı (0–36)</td><td>35:1</td><td>36×</td></tr>
      <tr><td>Düzine / Sütun</td><td>2:1</td><td>3×</td></tr>
      <tr><td>Kırmızı/Siyah, Çift/Tek, 1–18/19–36</td><td>1:1</td><td>2×</td></tr></table>
      <p>0 gelirse basit bahisler ve düzine/sütun bahisleri kaybeder. Kasa avantajı: %2,7. Sayı tamamen rastgele (kriptografik üreteç) seçilir ve top her zaman o sayının cebinde durur.</p>`,
    }),
    mount,
    leave,
  });
})();
