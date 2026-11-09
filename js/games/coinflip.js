/* =============================================================================
   VIRTUAL COIN — 3D coin toss, 50/50, pays 1.98×.
   The coin is a real 3D object (two faces + a stacked rim for thickness).
   The toss is animated in JavaScript: it rises, flips end over end many
   times, falls, bounces and settles on the face that was actually drawn
   (heads = NC, tails = Alien).
============================================================================= */
(function () {
  "use strict";
  const { money } = NC.util;
  const t = NC.t;
  const ID = "coinflip";
  const PAYOUT = 1.98;
  const RIM_LAYERS = 12; // thickness slices

  const S = { rotX: 0, flipping: false, pending: null, history: [], streak: 0, area: null, scope: null };

  const HEADS = `<svg viewBox="0 0 100 100"><defs><radialGradient id="cfh" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".55" stop-color="#ffc94d"/><stop offset="1" stop-color="#b8861c"/></radialGradient></defs>
    <circle cx="50" cy="50" r="48" fill="url(#cfh)"/><circle cx="50" cy="50" r="40" fill="none" stroke="#8a5f0c" stroke-width="2" stroke-dasharray="2 3"/>
    <circle cx="50" cy="50" r="34" fill="none" stroke="#fff3c9" stroke-width="1.5" opacity=".7"/>
    <text x="50" y="62" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="900" font-size="30" fill="#5a3b05">NC</text></svg>`;
  const TAILS = `<svg viewBox="0 0 100 100"><defs><radialGradient id="cft" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#b9ffd8"/><stop offset=".55" stop-color="#2bdc86"/><stop offset="1" stop-color="#0d7a48"/></radialGradient></defs>
    <circle cx="50" cy="50" r="48" fill="url(#cft)"/><circle cx="50" cy="50" r="40" fill="none" stroke="#065a33" stroke-width="2" stroke-dasharray="2 3"/>
    <path d="M50 20c-15 0-25 11-25 24 0 15 13 29 25 33 12-4 25-18 25-33 0-13-10-24-25-24z" fill="#0b3d24"/>
    <ellipse cx="39" cy="46" rx="8" ry="11" transform="rotate(-25 39 46)" fill="#b9ffd8"/><ellipse cx="61" cy="46" rx="8" ry="11" transform="rotate(25 61 46)" fill="#b9ffd8"/>
    <ellipse cx="40" cy="47" rx="3.5" ry="5" transform="rotate(-25 40 47)" fill="#05140c"/><ellipse cx="60" cy="47" rx="3.5" ry="5" transform="rotate(25 60 47)" fill="#05140c"/>
    <path d="M45 66q5 3 10 0" stroke="#b9ffd8" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;

  function coinHTML() {
    let rim = "";
    for (let i = 0; i < RIM_LAYERS; i++) {
      const z = -7 + (14 * i) / (RIM_LAYERS - 1);
      rim += `<i class="coin3d__rim" style="transform:translateZ(${z.toFixed(2)}px)"></i>`;
    }
    return `<div class="coin3d" id="cf-coin">
      ${rim}
      <div class="coin3d__face coin3d__face--heads">${HEADS}</div>
      <div class="coin3d__face coin3d__face--tails">${TAILS}</div>
    </div>`;
  }

  function mount(area, scope) {
    S.area = area;
    S.scope = scope;
    S.flipping = false;
    area.innerHTML = `
      <div class="g-layout">
        <div class="g-stage">
          <div class="coin-stage">
            <div class="coin-air" id="cf-air">${coinHTML()}</div>
            <div class="coin-shadow" id="cf-shadow"></div>
            <div class="coin-result" id="cf-res">${t("Pile ou Face ?")}</div>
          </div>
          <div class="history" id="cf-hist"></div>
        </div>
        <aside class="g-panel">
          ${NC.ui.betControl(ID, 100)}
          <div class="coin-choices">
            <button class="coin-choice coin-choice--heads" data-side="heads"><span class="coin-mini">${HEADS}</span>${t("Pile")}<small>NC</small></button>
            <button class="coin-choice coin-choice--tails" data-side="tails"><span class="coin-mini">${TAILS}</span>${t("Face")}<small>Alien</small></button>
          </div>
          <div class="g-info">
            <div><span class="lbl">${t("Chance")}</span><strong>50 %</strong></div>
            <div><span class="lbl">${t("Paiement")}</span><strong>${PAYOUT}×</strong></div>
            <div><span class="lbl">${t("Série")}</span><strong id="cf-streak">${S.streak}</strong></div>
            <div><span class="lbl">${t("Gain potentiel")}</span><strong id="cf-pot">—</strong></div>
          </div>
        </aside>
      </div>`;
    setPose(S.rotX, 0, 0);
    scope.on(area, "click", (e) => {
      const b = e.target.closest("[data-side]");
      if (b && !b.disabled) flip(b.dataset.side);
    });
    scope.on(area, "input", pot);
    renderHistory();
    pot();
  }

  function setPose(rotX, lift, wobble) {
    const coin = S.area.querySelector("#cf-coin");
    const air = S.area.querySelector("#cf-air");
    const sh = S.area.querySelector("#cf-shadow");
    if (!coin) return;
    coin.style.transform = `rotateY(${wobble.toFixed(2)}deg) rotateX(${rotX.toFixed(2)}deg)`;
    air.style.transform = `translateY(${(-lift).toFixed(2)}px) scale(${(1 + lift / 900).toFixed(3)})`;
    const k = Math.max(0.35, 1 - lift / 260);
    sh.style.transform = `scale(${k.toFixed(3)})`;
    sh.style.opacity = (0.25 + 0.55 * k).toFixed(3);
  }

  function pot() {
    const v = parseInt(S.area.querySelector("#bet-" + ID).value, 10);
    S.area.querySelector("#cf-pot").textContent = v > 0 ? money(Math.floor(v * PAYOUT)) : "—";
  }

  function flip(side) {
    if (S.flipping) return;
    const bet = NC.ui.readBet(ID);
    if (bet == null) return;
    const round = NC.startRound(ID, bet);
    if (!round) return;
    S.flipping = true;
    const result = NC.util.random() < 0.5 ? "heads" : "tails";
    const win = result === side;
    const payout = win ? Math.floor(bet * PAYOUT) : 0;
    S.pending = { round, result, win, payout, bet, side };
    const a = S.area;
    a.querySelectorAll("[data-side]").forEach((b) => { b.disabled = true; b.classList.toggle("is-picked", b.dataset.side === side); });
    NC.ui.lockBet(ID, true);
    a.querySelector("#cf-res").textContent = "…";
    a.querySelector("#cf-res").className = "coin-result";

    // Final angle: heads faces the viewer at 0°, tails at 180° (mod 360).
    const flips = 6 + NC.util.randInt(4);
    const startRot = S.rotX;
    const base = startRot - (((startRot % 360) + 360) % 360);
    const endRot = base + 360 * flips + (result === "heads" ? 0 : 180);
    const AIR = NC.util.dur(1700 + NC.util.random() * 300); // time in the air
    const LAND = NC.util.dur(650); // bounce + settle
    const H = 150; // max height (px)
    const wobbleDir = NC.util.random() < 0.5 ? -1 : 1;
    const t0 = performance.now();
    NC.audio.play("flip");
    let lastHalf = null;
    const step = (now) => {
      const el = now - t0;
      if (el < AIR) {
        const k = el / AIR;
        const lift = H * 4 * k * (1 - k); // parabola
        // spins fast at launch, a bit slower at the top, lands at 92 % of the rotation
        const rk = 1 - Math.pow(1 - k, 1.6);
        const rot = startRot + (endRot - 18 - startRot) * rk;
        setPose(rot, lift, wobbleDir * 18 * Math.sin(k * Math.PI));
        const half = Math.floor(rot / 180);
        if (half !== lastHalf) { lastHalf = half; NC.audio.play("tick", 30); }
        S.scope.raf(step);
      } else if (el < AIR + LAND) {
        const k = (el - AIR) / LAND;
        // small bounce, the last few degrees of rotation settle with a damped wobble
        const lift = 26 * Math.abs(Math.sin(k * Math.PI * 1.5)) * Math.pow(1 - k, 2);
        const rot = endRot - 18 * Math.cos(k * Math.PI * 2.5) * Math.pow(1 - k, 2) * (k < 0.02 ? 1 : 1);
        setPose(k > 0.98 ? endRot : rot, lift, wobbleDir * 6 * Math.sin(k * Math.PI * 3) * (1 - k));
        if (!S.pending.landed) { S.pending.landed = true; NC.audio.play("coinland"); }
        S.scope.raf(step);
      } else {
        S.rotX = endRot;
        setPose(endRot, 0, 0);
        resolve();
      }
    };
    S.scope.raf(step);
  }

  function resolve() {
    const p = S.pending;
    if (!p) return;
    S.pending = null;
    const net = p.round.settle(p.payout);
    S.flipping = false;
    S.streak = p.win ? S.streak + 1 : 0;
    S.history.push(p.result);
    const a = S.area;
    if (!a.isConnected) return;
    // make sure the drawn face is shown (also when resolved early)
    S.rotX = S.rotX - (((S.rotX % 360) + 360) % 360) + (p.result === "heads" ? 0 : 180);
    setPose(S.rotX, 0, 0);
    a.querySelector("#cf-coin").dataset.face = p.result;
    a.querySelectorAll("[data-side]").forEach((b) => { b.disabled = false; b.classList.remove("is-picked"); });
    NC.ui.lockBet(ID, false);
    const res = a.querySelector("#cf-res");
    const name = p.result === "heads" ? t("PILE") : t("FACE");
    res.textContent = name + (p.win ? t(" — gagné !") : t(" — perdu"));
    res.className = "coin-result " + (p.win ? "is-win" : "is-lose");
    a.querySelector("#cf-streak").textContent = S.streak;
    renderHistory();
    NC.ui.announce(net, p.payout, { target: a.querySelector("#cf-coin"), stake: p.bet, msg: p.win ? t("{f} ! +{v}", { f: name, v: money(net) }) : t("{f} — perdu", { f: name }) });
  }

  function renderHistory() {
    const h = S.area.querySelector("#cf-hist");
    if (h) h.innerHTML = S.history.slice(-20).reverse().map((r) => `<span class="${r === "heads" ? "h-gold" : "h-win"}">${r === "heads" ? t("P") : t("F")}</span>`).join("");
  }

  function leave() { if (S.pending) resolve(); }

  NC.registerGame({
    id: ID,
    title: t("Virtual Coin"),
    tagline: t("Pile ou Face en 3D. Le duel le plus pur du casino."),
    category: "instant",
    badge: "50/50",
    payout: "1.98×",
    accent: "#ffc94d",
    accent2: "#2bff88",
    icon: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4"/></svg>',
    art: `<svg viewBox="0 0 320 210"><ellipse cx="160" cy="186" rx="70" ry="10" fill="#ffc94d" opacity=".15"/>
      <g class="art-float a-bob"><ellipse cx="160" cy="96" rx="62" ry="66" fill="#15132e" stroke="#ffc94d" stroke-width="6" class="a-pulse"/>
      <ellipse cx="160" cy="96" rx="48" ry="52" fill="none" stroke="#ffc94d" stroke-width="2" stroke-dasharray="3 5"/>
      <text x="160" y="110" text-anchor="middle" font-family="Unbounded" font-weight="900" font-size="34" fill="#ffc94d">NC</text></g></svg>`,
    rules: () => NC.i18n.pick({
      fr: `<h4>Principe</h4><p>Choisissez Pile (NC) ou Face (Alien). Chance 50 %, paiement 1,98× la mise (avantage maison 1 %).</p><p>Le résultat est tiré au hasard (générateur cryptographique) ; la pièce s'arrête toujours sur la face réellement tirée.</p>`,
      tr: `<h4>Kural</h4><p>Yazı (NC) veya Tura (Uzaylı) seçin. Şans %50, ödeme bahsin 1,98 katı (kasa avantajı %1).</p><p>Sonuç tamamen rastgele (kriptografik üreteç) belirlenir; para her zaman gerçekten çıkan yüzde durur.</p>`,
    }),
    mount,
    leave,
  });
})();
