/* =============================================================================
   DICE ROLL — roll 1–100, bet over or under a target.
   Over T  : win if roll > T, chance (100 − T) %
   Under T : win if roll < T, chance (T − 1) %
   Payout  : bet × 98 / chance  (2 % house edge, same as the original formula)
   Fixes vs. original: no lock during a roll (several bets could stack),
   no probability display, "roll under" missing.
============================================================================= */
(function () {
  "use strict";
  const { money } = NC.util;
  const t = NC.t;
  const ID = "dice";

  function chance(mode, t) { return mode === "over" ? 100 - t : t - 1; }
  function mult(mode, t) { return 98 / chance(mode, t); }
  NC.diceMath = { chance, mult };

  const S = { mode: "over", target: 50, rolling: false, pending: null, history: [], area: null, scope: null };

  function mount(area, scope) {
    S.area = area;
    S.scope = scope;
    S.rolling = false;
    area.innerHTML = `
      <div class="g-layout">
        <div class="g-stage">
          <div class="dice-stage">
            <div class="dice-cube" id="d-cube"><span id="d-res">50</span></div>
            <div class="dice-track" id="d-track">
              <div class="dice-track__fill" id="d-fill"></div>
              <div class="dice-track__marker" id="d-marker" hidden><span></span></div>
              <input type="range" min="2" max="98" value="${S.target}" id="d-slider" class="range range--dice" aria-label="${t("Cible")}">
              <div class="dice-track__scale"><span>1</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
            </div>
          </div>
          <div class="history" id="d-hist"></div>
        </div>
        <aside class="g-panel">
          ${NC.ui.betControl(ID, 100)}
          <div class="seg seg--block" id="d-mode">
            <button data-mode="under">${t("Moins de")}</button>
            <button data-mode="over">${t("Plus de")}</button>
          </div>
          <div class="g-info">
            <div><span class="lbl">${t("Cible")}</span><strong id="d-target">${S.target}</strong></div>
            <div><span class="lbl">${t("Chance")}</span><strong id="d-chance">—</strong></div>
            <div><span class="lbl">${t("Multiplicateur")}</span><strong id="d-mult">—</strong></div>
            <div><span class="lbl">${t("Gain si victoire")}</span><strong id="d-pot">—</strong></div>
          </div>
          <button class="btn btn--primary btn--lg btn--block" data-act="roll" id="d-roll">${t("Lancer")}</button>
        </aside>
      </div>`;
    scope.on(area, "input", (e) => {
      if (e.target.id === "d-slider") { S.target = +e.target.value; update(); }
      else if (e.target.classList.contains("bet-ctl__input")) update();
    });
    scope.on(area, "click", (e) => {
      const m = e.target.closest("[data-mode]");
      if (m && !S.rolling) { S.mode = m.dataset.mode; NC.audio.play("click"); update(); return; }
      const b = e.target.closest('[data-act="roll"]');
      if (b && !b.disabled) roll();
    });
    renderHistory();
    update();
  }

  function update() {
    const a = S.area;
    const ch = chance(S.mode, S.target);
    const mu = mult(S.mode, S.target);
    a.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === S.mode));
    a.querySelector("#d-target").textContent = (S.mode === "over" ? "> " : "< ") + S.target;
    a.querySelector("#d-chance").textContent = ch + " %";
    a.querySelector("#d-mult").textContent = mu.toFixed(4) + "×";
    const bet = parseInt(a.querySelector("#bet-" + ID).value, 10);
    a.querySelector("#d-pot").textContent = bet > 0 ? money(Math.floor(bet * mu)) : "—";
    const fill = a.querySelector("#d-fill");
    // green = winning zone
    if (S.mode === "over") { fill.style.left = S.target + "%"; fill.style.right = "0"; }
    else { fill.style.left = "0"; fill.style.right = 100 - S.target + 1 + "%"; }
  }

  function roll() {
    if (S.rolling) return;
    const bet = NC.ui.readBet(ID);
    if (bet == null) return;
    const round = NC.startRound(ID, bet);
    if (!round) return;
    S.rolling = true;
    const res = NC.util.randInt(100) + 1;
    const win = S.mode === "over" ? res > S.target : res < S.target;
    const mu = mult(S.mode, S.target);
    const payout = win ? Math.floor(bet * mu) : 0;
    S.pending = { round, res, win, payout, bet };
    const a = S.area;
    NC.ui.lockBet(ID, true);
    a.querySelector("#d-roll").disabled = true;
    a.querySelector("#d-slider").disabled = true;
    a.querySelectorAll("[data-mode]").forEach((b) => (b.disabled = true));
    const cube = a.querySelector("#d-cube");
    cube.className = "dice-cube is-rolling";
    const out = a.querySelector("#d-res");
    const fast = NC.settings.reducedFx();
    const dur = fast ? 120 : 900;
    const t0 = performance.now();
    const spin = () => {
      const k = (performance.now() - t0) / dur;
      if (k >= 1) return resolve();
      out.textContent = NC.util.randInt(100) + 1;
      NC.audio.play("tick", 40);
      S.scope.timeout(spin, 40 + k * 80);
    };
    spin();
  }

  function resolve() {
    const p = S.pending;
    if (!p) return;
    S.pending = null;
    const net = p.round.settle(p.payout);
    S.rolling = false;
    S.history.push({ r: p.res, w: p.win });
    const a = S.area;
    if (!a.isConnected) return;
    const cube = a.querySelector("#d-cube");
    cube.className = "dice-cube " + (p.win ? "is-win" : "is-lose");
    a.querySelector("#d-res").textContent = p.res;
    const mk = a.querySelector("#d-marker");
    mk.hidden = false;
    mk.style.left = p.res - 0.5 + "%";
    mk.className = "dice-track__marker " + (p.win ? "is-win" : "is-lose");
    mk.querySelector("span").textContent = p.res;
    NC.ui.lockBet(ID, false);
    a.querySelector("#d-roll").disabled = false;
    a.querySelector("#d-slider").disabled = false;
    a.querySelectorAll("[data-mode]").forEach((b) => (b.disabled = false));
    renderHistory();
    NC.ui.announce(net, p.payout, { target: cube, stake: p.bet, msg: p.win ? t("{n} — gagné {v}", { n: p.res, v: money(p.payout) }) : t("{n} — perdu", { n: p.res }) });
  }

  function renderHistory() {
    const h = S.area.querySelector("#d-hist");
    if (h) h.innerHTML = S.history.slice(-18).reverse().map((x) => `<span class="${x.w ? "h-win" : "h-lose"}">${x.r}</span>`).join("");
  }

  function leave() { if (S.pending) resolve(); }

  NC.registerGame({
    id: ID,
    title: "Dice Roll",
    tagline: t("Plus ou moins ? Réglez votre risque, voyez vos chances."),
    category: "instant",
    badge: t("Probabilités"),
    payout: "1.01× – 49×",
    accent: "#2f7bff",
    accent2: "#00f0ff",
    icon: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9v.01M15 15v.01M15 9v.01M9 15v.01M12 12v.01"/></svg>',
    art: `<svg viewBox="0 0 320 210"><g class="art-float">
      <g class="a-bob"><rect x="104" y="36" width="112" height="112" rx="26" fill="#0b0a22" stroke="#2f7bff" stroke-width="3" transform="rotate(-10 160 92)"/>
      <text x="160" y="110" text-anchor="middle" font-family="Unbounded" font-weight="900" font-size="46" fill="#fff" transform="rotate(-10 160 92)">73</text></g>
      <rect x="50" y="172" width="220" height="8" rx="4" fill="#14112e"/><rect x="160" y="172" width="110" height="8" rx="4" fill="#2bff88" opacity=".8"/>
      <circle cx="160" cy="176" r="9" fill="#00f0ff" class="a-pulse"/></g></svg>`,
    rules: () => NC.i18n.pick({ fr: `<h4>Principe</h4><p>Un nombre de 1 à 100 est tiré. Choisissez « Plus de » ou « Moins de » une cible (2–98).</p>
      <ul><li>Plus de T : chance (100 − T) %</li><li>Moins de T : chance (T − 1) %</li><li>Multiplicateur = 98 ÷ chance (avantage maison 2 %)</li></ul>
      <p>Exemple : plus de 50 → 50 % → 1,96×.</p>`, tr: `<h4>Kural</h4><p>1 ile 100 arasında bir sayı çekilir. Bir hedefin (2–98) « Üstü » veya « Altı » seçeneğini seçin.</p>
      <ul><li>T'nin üstü: şans (100 − T) %</li><li>T'nin altı: şans (T − 1) %</li><li>Çarpan = 98 ÷ şans (kasa avantajı %2)</li></ul>
      <p>Örnek: 50'nin üstü → %50 → 1,96×.</p>` }),
    mount,
    leave,
  });
})();
