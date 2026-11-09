/* =============================================================================
   SLOTS — 3 reels × 3 rows, 5 paylines, real reel strips.
   Fixes vs. original: the old paytable returned ~116 % (players gained money
   on average); now 95.8 % exact (see slots-math.js + unit test). The reels
   scroll through the real strip, so the symbols shown are the ones paid.
============================================================================= */
(function () {
  "use strict";
  const { money } = NC.util;
  const M = NC.slotsMath;
  const t = NC.t;
  const ID = "slots";
  const CELL = 112; // px height of a symbol cell (CSS var --cell)

  const SYM = {
    seven: `<svg viewBox="0 0 100 100"><defs><linearGradient id="sy7" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6ad5"/><stop offset="1" stop-color="#ff2e7e"/></linearGradient></defs><path d="M24 22h54l-28 60h-16l24-46H24z" fill="url(#sy7)" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>`,
    diamond: `<svg viewBox="0 0 100 100"><defs><linearGradient id="syd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ff8ff"/><stop offset="1" stop-color="#00a8ff"/></linearGradient></defs><path d="M50 86L14 40l14-20h44l14 20z" fill="url(#syd)" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M14 40h72M36 20l14 66 14-66" stroke="#fff" stroke-width="2" opacity=".6" fill="none"/></svg>`,
    bar: `<svg viewBox="0 0 100 100"><rect x="12" y="32" width="76" height="36" rx="8" fill="#16123a" stroke="#ffc94d" stroke-width="4"/><text x="50" y="58" text-anchor="middle" font-family="Unbounded" font-weight="900" font-size="22" fill="#ffc94d">BAR</text></svg>`,
    bell: `<svg viewBox="0 0 100 100"><defs><linearGradient id="syb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs><path d="M50 16c-16 0-24 12-24 28v14l-8 12h64l-8-12V44c0-16-8-28-24-28z" fill="url(#syb)" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><circle cx="50" cy="78" r="7" fill="#ffc94d" stroke="#fff" stroke-width="3"/></svg>`,
    star: `<svg viewBox="0 0 100 100"><defs><linearGradient id="sys" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9ff6a"/><stop offset="1" stop-color="#2bff88"/></linearGradient></defs><path d="M50 12l11 24 26 3-19 18 5 26-23-13-23 13 5-26-19-18 26-3z" fill="url(#sys)" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>`,
    cherry: `<svg viewBox="0 0 100 100"><path d="M46 60C50 40 58 26 74 16M46 60c-2-14-6-24-14-30" stroke="#2bff88" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="34" cy="68" r="16" fill="#ff2e7e" stroke="#fff" stroke-width="3"/><circle cx="64" cy="64" r="16" fill="#ff3b5c" stroke="#fff" stroke-width="3"/><circle cx="29" cy="62" r="4" fill="#fff" opacity=".7"/></svg>`,
  };
  const SYM_NAME = { seven: "7", diamond: t("Diamant"), bar: "BAR", bell: t("Cloche"), star: t("Étoile"), cherry: t("Cerise") };

  const S = { stops: [3, 7, 11], spinning: false, pending: null, area: null, scope: null };

  function cell(sym) { return `<div class="sl-sym sl-sym--${sym}" data-sym="${sym}">${SYM[sym]}</div>`; }

  function mount(area, scope) {
    S.area = area;
    S.scope = scope;
    S.spinning = false;
    const grid = M.windowAt(S.stops);
    area.innerHTML = `
      <div class="g-layout">
        <div class="g-stage">
          <div class="slot-machine">
            <div class="slot-marquee"><span>NEON</span> JACKPOT <span>×250</span></div>
            <div class="slot-window" id="sl-window">
              ${grid.map((col, r) => `<div class="sl-reel"><div class="sl-strip" id="sl-strip-${r}">${col.map(cell).join("")}</div></div>`).join("")}
              <svg class="sl-lines" id="sl-lines" viewBox="0 0 300 300" preserveAspectRatio="none"></svg>
            </div>
            <div class="slot-lights" aria-hidden="true">${"<i></i>".repeat(14)}</div>
          </div>
        </div>
        <aside class="g-panel">
          ${NC.ui.betControl(ID, 100, t("Mise totale (5 lignes)"))}
          <button class="btn btn--primary btn--lg btn--block btn--pink" data-act="spin">Spin</button>
          <div class="g-info">
            <div><span class="lbl">${t("Mise / ligne")}</span><strong id="sl-line">—</strong></div>
            <div><span class="lbl">${t("Dernier gain")}</span><strong id="sl-win">—</strong></div>
          </div>
          <div class="paytable">
            <span class="lbl">${t("Table des gains (× mise/ligne)")}</span>
            ${Object.keys(M.PAY3).sort((a, b) => M.PAY3[b] - M.PAY3[a]).map((k) => `<div class="pt-row"><span class="pt-syms">${SYM[k]}${SYM[k]}${SYM[k]}</span><b>${M.PAY3[k]}×</b></div>`).join("")}
            <div class="pt-row"><span class="pt-syms">${SYM.cherry}${SYM.cherry}<i class="pt-any">?</i></span><b>${M.PAY_CHERRY2}×</b></div>
            <p class="muted small">${t("5 lignes : 3 horizontales + 2 diagonales. Retour théorique : 95,8 %.")}</p>
          </div>
        </aside>
      </div>`;
    scope.on(area, "click", (e) => { const b = e.target.closest('[data-act="spin"]'); if (b && !b.disabled) spin(); });
    scope.on(area, "input", updateLine);
    scope.on(document, "keydown", (e) => { if ((e.key === " " || e.key === "Enter") && e.target.tagName !== "INPUT" && e.target.tagName !== "BUTTON") { e.preventDefault(); spin(); } });
    updateLine();
  }

  function updateLine() {
    const inp = S.area.querySelector("#bet-" + ID);
    const v = parseInt(inp && inp.value, 10);
    const el = S.area.querySelector("#sl-line");
    if (el) el.textContent = v > 0 ? (v / 5).toLocaleString(NC.i18n.locale(), { maximumFractionDigits: 1 }) + " ₵" : "—";
  }

  function spin() {
    if (S.spinning) return;
    const bet = NC.ui.readBet(ID);
    if (bet == null) return;
    const round = NC.startRound(ID, bet);
    if (!round) return;
    S.spinning = true;
    const res = M.spin();
    const payout = Math.floor(bet * res.mult);
    S.pending = { round, res, payout, bet };
    NC.ui.lockBet(ID, true);
    const btn = S.area.querySelector('[data-act="spin"]');
    btn.disabled = true;
    S.area.querySelector("#sl-lines").innerHTML = "";
    S.area.querySelectorAll(".sl-sym.is-win").forEach((c) => c.classList.remove("is-win"));
    const prev = S.stops.slice();
    S.stops = res.stops;
    // Build each reel column from the REAL strip: it scrolls from the previous
    // window to the new (random) window, passing through several full loops.
    const reels = [];
    for (let r = 0; r < 3; r++) {
      const strip = M.STRIPS[r];
      const L = strip.length;
      const loops = 3 + r * 2 + NC.util.randInt(2);
      const dist = ((prev[r] - res.stops[r] + L) % L) + loops * L; // symbols scrolled downward
      const seq = [];
      for (let i = -1; i < dist + 3; i++) seq.push(strip[(((res.stops[r] - 1 + i) % L) + L) % L]);
      const el = S.area.querySelector("#sl-strip-" + r);
      const cellH = (el.firstElementChild && el.firstElementChild.getBoundingClientRect().height) || CELL;
      el.style.transition = "none";
      el.innerHTML = seq.map(cell).join("");
      const travel = NC.util.dur(1300 + r * 520 + NC.util.random() * 220);
      reels.push({ el, cellH, dist, travel, start: -(dist + 1) * cellH, end: -cellH, done: false, lastCell: null });
      el.style.transform = `translateY(${-(dist + 1) * cellH}px)`;
    }
    const WIND = NC.util.dur(140);
    const SETTLE = NC.util.dur(380);
    const t0 = performance.now();
    // velocity profile: quick acceleration, constant speed, long deceleration
    const A = 0.1, D = 0.45, Z = A / 2 + (1 - A - D) + D / 3;
    const easeInOut = (x) => {
      if (x < A) return (x * x) / (2 * A) / Z;
      if (x < 1 - D) return (A / 2 + (x - A)) / Z;
      const u = (x - (1 - D)) / D;
      return (A / 2 + (1 - A - D) + (D * (1 - Math.pow(1 - u, 3))) / 3) / Z;
    };
    const step = (now) => {
      const el = now - t0;
      let allDone = true;
      reels.forEach((rl) => {
        let y;
        const box = rl.el.parentElement;
        if (el < WIND) {
          // small wind-up (the reel nudges up before launching)
          y = rl.start - 0.22 * rl.cellH * Math.sin((Math.PI * el) / WIND);
          allDone = false;
        } else if (el < WIND + rl.travel) {
          const k = (el - WIND) / rl.travel;
          y = rl.start + (rl.end - rl.start) * easeInOut(k);
          box.classList.toggle("is-spinning", k > 0.12 && k < 0.82);
          allDone = false;
        } else if (el < WIND + rl.travel + SETTLE) {
          if (!rl.stopped) { rl.stopped = true; box.classList.remove("is-spinning"); NC.audio.play("reelstop", 0); }
          const s = (el - WIND - rl.travel) / SETTLE;
          y = rl.end + 0.16 * rl.cellH * Math.sin(s * Math.PI * 2) * Math.exp(-4 * s) * (1 - s);
          allDone = false;
        } else {
          y = rl.end;
          if (!rl.done) { rl.done = true; box.classList.remove("is-spinning"); trimStrip(rl.el); }
        }
        if (!rl.done) {
          rl.el.style.transform = `translateY(${y.toFixed(2)}px)`;
          const c = Math.floor(y / rl.cellH);
          if (c !== rl.lastCell) { rl.lastCell = c; NC.audio.play("reel", 55); }
        }
      });
      if (allDone) resolve();
      else S.scope.raf(step);
    };
    S.scope.raf(step);
  }

  function trimStrip(el) {
    // keep only the 3 visible symbols after stopping (light DOM)
    while (el.children.length > 4) el.lastElementChild.remove();
    if (el.children.length === 4) el.firstElementChild.remove();
    el.style.transform = "translateY(0)";
  }

  function resolve() {
    const p = S.pending;
    if (!p) return;
    S.pending = null;
    const net = p.round.settle(p.payout);
    S.spinning = false;
    const a = S.area;
    if (!a.isConnected) return;
    a.querySelector('[data-act="spin"]').disabled = false;
    NC.ui.lockBet(ID, false);
    a.querySelector("#sl-win").textContent = p.payout ? money(p.payout) : "—";
    // highlight winning lines
    const svg = a.querySelector("#sl-lines");
    const colors = ["#00f0ff", "#ff2bd6", "#b6ff00", "#ffc94d", "#b14cff"];
    svg.innerHTML = p.res.wins.map((w) => {
      const ln = M.LINES[w.line];
      const pts = ln.map((row, r) => `${50 + r * 100},${50 + row * 100}`).join(" ");
      return `<polyline points="${pts}" class="sl-line" stroke="${colors[w.line]}"/>`;
    }).join("");
    p.res.wins.forEach((w) => {
      const ln = M.LINES[w.line];
      for (let r = 0; r < w.count; r++) {
        const strip = a.querySelector("#sl-strip-" + r);
        const c = strip && strip.children[ln[r]];
        if (c) c.classList.add("is-win");
      }
    });
    const win = a.querySelector("#sl-window");
    const jackpot = p.res.wins.some((w) => w.sym === "seven" && w.count === 3);
    if (p.payout > 0) {
      const big = p.payout >= p.bet * 5;
      NC.ui.banner(a.querySelector(".slot-machine"), jackpot || big ? "big" : "win", jackpot ? "JACKPOT 777" : big ? "MEGA WIN" : t("Gagné"), "+" + money(p.payout));
      if (jackpot || big) { NC.fx.confetti(win, jackpot ? 260 : 150); a.querySelector(".slot-machine").classList.add("is-jackpot"); S.scope.timeout(() => a.querySelector(".slot-machine") && a.querySelector(".slot-machine").classList.remove("is-jackpot"), 2500); }
    }
    NC.ui.announce(net, p.payout, { target: win, stake: p.bet, big: jackpot || p.payout >= p.bet * 5, msg: p.payout ? t("{n} ligne(s) gagnante(s) : {v}", { n: p.res.wins.length, v: money(p.payout) }) : t("Aucune ligne gagnante") });
  }

  function leave() { if (S.pending) resolve(); }

  NC.registerGame({
    id: ID,
    title: "Slots Premium",
    tagline: t("3 rouleaux, 5 lignes, jackpot 777 à ×250 la ligne."),
    category: "instant",
    badge: "Jackpot",
    payout: t("×250 / ligne"),
    accent: "#ffc94d",
    accent2: "#ff2e7e",
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M9 5v14M15 5v14"/></svg>',
    art: `<svg viewBox="0 0 320 210"><ellipse cx="160" cy="190" rx="120" ry="16" fill="#ffc94d" opacity=".12"/>
      <g class="art-float"><rect x="60" y="40" width="200" height="120" rx="20" fill="#0b0a22" stroke="#ffc94d" stroke-width="3"/>
      ${[0, 1, 2].map((i) => `<rect x="${74 + i * 62}" y="54" width="52" height="92" rx="10" fill="#14112e" stroke="rgba(255,255,255,.12)"/><text x="${100 + i * 62}" y="116" text-anchor="middle" font-family="Unbounded" font-weight="900" font-size="40" fill="#ff2e7e" class="a-pulse" style="animation-delay:${i * 0.2}s">7</text>`).join("")}
      <line x1="66" y1="100" x2="254" y2="100" stroke="#00f0ff" stroke-width="2" class="a-dash"/>
      ${Array.from({ length: 9 }, (_, i) => `<circle cx="${76 + i * 21}" cy="32" r="4" fill="${["#00f0ff", "#ff2bd6", "#ffc94d"][i % 3]}" class="a-blink" style="animation-delay:${i * 0.15}s"/>`).join("")}</g></svg>`,
    rules: () => NC.i18n.pick({ fr: `<h4>Fonctionnement</h4><p>La mise totale est répartie sur 5 lignes (mise/ligne = mise ÷ 5). Les gains s'additionnent sur toutes les lignes.</p>
      <table><tr><th>Combinaison</th><th>× mise/ligne</th></tr>${Object.keys(M.PAY3).map((k) => `<tr><td>3 × ${SYM_NAME[k]}</td><td>${M.PAY3[k]}</td></tr>`).join("")}<tr><td>2 cerises depuis la gauche</td><td>${M.PAY_CHERRY2}</td></tr></table>
      <p>Retour théorique calculé exactement sur toutes les positions des rouleaux : 95,8 %.</p>`, tr: `<h4>Nasıl çalışır</h4><p>Toplam bahis 5 hatta eşit dağıtılır (hat başı bahis = bahis ÷ 5). Tüm hatlardaki kazançlar toplanır. Makaralar gerçekten döner ve tamamen rastgele durur.</p>
      <table><tr><th>Kombinasyon</th><th>× hat bahsi</th></tr>${Object.keys(M.PAY3).map((k) => `<tr><td>3 × ${SYM_NAME[k]}</td><td>${M.PAY3[k]}</td></tr>`).join("")}<tr><td>Soldan 2 kiraz</td><td>${M.PAY_CHERRY2}</td></tr></table>
      <p>Teorik geri dönüş, makaraların tüm pozisyonları üzerinden tam olarak hesaplanmıştır: %95,8.</p>` }),
    mount,
    leave,
  });
})();
