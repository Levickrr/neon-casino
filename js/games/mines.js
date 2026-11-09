/* =============================================================================
   NEON MINES — 5×5 grid, 1–24 mines, fair multiplier × 0.98.
   Multiplier after k gems with m mines: Π (25−i)/(25−m−i), i = 0..k−1.
   Fixes vs. original: mine count was not validated (24+ froze the page in
   an infinite loop, NaN broke it), cash-out still paid during the 2 s after
   hitting a bomb, the board was not revealed after a loss, no auto cash-out
   when every gem was found, closing the game lost the bet.
============================================================================= */
(function () {
  "use strict";
  const { money } = NC.util;
  const t = NC.t;
  const ID = "mines";
  const EDGE = 0.98;

  function multiplier(mines, gems) {
    let m = 1;
    for (let i = 0; i < gems; i++) m *= (25 - i) / (25 - mines - i);
    return m * EDGE;
  }
  NC.minesMath = { multiplier };

  const S = { active: false, grid: [], revealed: [], gems: 0, mines: 3, round: null, bet: 0, busy: false, area: null, scope: null };

  const GEM = `<svg viewBox="0 0 64 64"><defs><linearGradient id="mg-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b6ff00"/><stop offset="1" stop-color="#00f0ff"/></linearGradient></defs><path d="M32 56L8 26l10-14h28l10 14z" fill="url(#mg-g)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><path d="M8 26h48M24 12l8 44 8-44" stroke="#fff" stroke-width="1.5" opacity=".6" fill="none"/></svg>`;
  const BOMB = `<svg viewBox="0 0 64 64"><circle cx="30" cy="36" r="18" fill="#1a0b16" stroke="#ff3b5c" stroke-width="3"/><path d="M42 22l6-6M48 16l4-2M48 16l2-4M50 18l4 0" stroke="#ffc94d" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="30" r="4" fill="#ff3b5c" opacity=".7"/></svg>`;

  function mount(area, scope) {
    S.area = area;
    S.scope = scope;
    S.active = false;
    area.innerHTML = `
      <div class="g-layout">
        <div class="g-stage">
          <div class="mines-board" id="m-board">
            ${Array.from({ length: 25 }, (_, i) => `<button class="mine-tile" data-i="${i}" disabled aria-label="${t("Case {n}", { n: i + 1 })}"><span class="mine-tile__in"></span></button>`).join("")}
          </div>
        </div>
        <aside class="g-panel">
          ${NC.ui.betControl(ID, 100)}
          <div class="field">
            <span class="lbl">${t("Nombre de mines :")} <b id="m-count-lbl">${S.mines}</b></span>
            <input type="range" min="1" max="24" value="${S.mines}" id="m-count" class="range">
          </div>
          <button class="btn btn--primary btn--lg btn--block btn--green" data-act="start" id="m-start">${t("Générer la grille")}</button>
          <button class="btn btn--gold btn--primary btn--block" data-act="cash" id="m-cash" disabled>${t("Encaisser")}</button>
          <div class="g-info">
            <div><span class="lbl">${t("Multiplicateur")}</span><strong id="m-mult">1.00×</strong></div>
            <div><span class="lbl">${t("Prochain")}</span><strong id="m-next">—</strong></div>
            <div><span class="lbl">${t("Gemmes")}</span><strong id="m-gems">0 / ${25 - S.mines}</strong></div>
            <div><span class="lbl">${t("Chance suivante")}</span><strong id="m-chance">—</strong></div>
          </div>
        </aside>
      </div>`;
    scope.on(area, "click", onClick);
    scope.on(area, "input", (e) => {
      if (e.target.id !== "m-count") return;
      S.mines = Math.max(1, Math.min(24, parseInt(e.target.value, 10) || 3));
      area.querySelector("#m-count-lbl").textContent = S.mines;
      updateInfo();
    });
    updateInfo();
  }

  function onClick(e) {
    const b = e.target.closest("[data-act]");
    if (b && !b.disabled) {
      if (b.dataset.act === "start") start();
      else if (b.dataset.act === "cash") cashout();
      return;
    }
    const tile = e.target.closest(".mine-tile");
    if (tile && !tile.disabled) reveal(+tile.dataset.i);
  }

  function start() {
    if (S.active || S.busy) return;
    const mines = Math.max(1, Math.min(24, parseInt(S.area.querySelector("#m-count").value, 10) || 3));
    const bet = NC.ui.readBet(ID);
    if (bet == null) return;
    const round = NC.startRound(ID, bet);
    if (!round) return;
    S.round = round;
    S.bet = bet;
    S.mines = mines;
    S.gems = 0;
    S.active = true;
    // Unbiased placement: shuffle 25 positions, take the first `mines`.
    const order = NC.util.shuffle(Array.from({ length: 25 }, (_, i) => i));
    S.grid = Array(25).fill("G");
    order.slice(0, mines).forEach((i) => (S.grid[i] = "B"));
    S.revealed = Array(25).fill(false);
    const board = S.area.querySelector("#m-board");
    board.className = "mines-board is-live";
    board.querySelectorAll(".mine-tile").forEach((t) => {
      t.className = "mine-tile";
      t.querySelector(".mine-tile__in").innerHTML = "";
      t.disabled = false;
    });
    NC.ui.lockBet(ID, true);
    S.area.querySelector("#m-count").disabled = true;
    S.area.querySelector("#m-start").disabled = true;
    NC.audio.play("click");
    updateInfo();
  }

  function reveal(i) {
    if (!S.active || S.revealed[i] || S.busy) return;
    S.revealed[i] = true;
    const tile = S.area.querySelectorAll(".mine-tile")[i];
    tile.disabled = true;
    if (S.grid[i] === "B") {
      S.active = false;
      tile.classList.add("is-bomb", "is-hit", "is-open");
      tile.querySelector(".mine-tile__in").innerHTML = BOMB;
      NC.audio.play("boom");
      NC.fx.sparks(tile, "#ff3b5c", 50);
      NC.fx.shake(S.area.querySelector("#m-board"));
      const net = S.round.settle(0);
      revealAll();
      NC.ui.banner(S.area.querySelector(".g-stage"), "lose", "BOOM !", "−" + money(S.bet));
      NC.ui.announce(net, 0, { msg: t("Mine touchée — perdu {v}", { v: money(S.bet) }) });
      return finish();
    }
    S.gems++;
    tile.classList.add("is-gem", "is-open");
    tile.querySelector(".mine-tile__in").innerHTML = GEM;
    NC.audio.play("gem");
    NC.fx.sparks(tile, "#b6ff00", 16);
    updateInfo();
    if (S.gems === 25 - S.mines) cashout(true);
  }

  function revealAll() {
    S.area.querySelectorAll(".mine-tile").forEach((t, i) => {
      t.disabled = true;
      if (S.revealed[i]) return;
      t.classList.add("is-open", "is-dim", S.grid[i] === "B" ? "is-bomb" : "is-gem");
      t.querySelector(".mine-tile__in").innerHTML = S.grid[i] === "B" ? BOMB : GEM;
    });
  }

  function cashout(all) {
    if (!S.active || S.gems === 0) return;
    S.active = false;
    const m = multiplier(S.mines, S.gems);
    const payout = Math.floor(S.bet * m);
    const net = S.round.settle(payout);
    revealAll();
    NC.ui.banner(S.area.querySelector(".g-stage"), m >= 10 ? "big" : "win", (all ? t("Grille complète !") + " " : "") + m.toFixed(2) + "×", "+" + money(net));
    NC.ui.announce(net, payout, { target: S.area.querySelector("#m-board"), stake: S.bet, msg: t("Encaissé {m}× : {v}", { m: m.toFixed(2), v: money(payout) }) });
    finish();
  }

  function finish() {
    S.busy = true;
    S.area.querySelector("#m-board").className = "mines-board";
    S.area.querySelector("#m-cash").disabled = true;
    S.scope.timeout(() => {
      S.busy = false;
      NC.ui.lockBet(ID, false);
      S.area.querySelector("#m-count").disabled = false;
      S.area.querySelector("#m-start").disabled = false;
      updateInfo();
    }, 900);
  }

  function updateInfo() {
    const a = S.area;
    const m = multiplier(S.mines, S.gems);
    const left = 25 - S.gems;
    const safeLeft = 25 - S.mines - S.gems;
    a.querySelector("#m-mult").textContent = (S.active ? m : 1).toFixed(2) + "×";
    a.querySelector("#m-next").textContent = safeLeft > 0 ? multiplier(S.mines, (S.active ? S.gems : 0) + 1).toFixed(2) + "×" : "—";
    a.querySelector("#m-gems").textContent = `${S.active ? S.gems : 0} / ${25 - S.mines}`;
    a.querySelector("#m-chance").textContent = safeLeft > 0 ? ((S.active ? safeLeft / left : (25 - S.mines) / 25) * 100).toFixed(1) + " %" : "—";
    const cash = a.querySelector("#m-cash");
    cash.disabled = !(S.active && S.gems > 0);
    cash.textContent = S.active && S.gems > 0 ? t("Encaisser {v}", { v: money(Math.floor(S.bet * m)) }) : t("Encaisser");
  }

  /** Closing mid-game: cash out if gems were found, otherwise refund (nothing revealed). */
  function leave() {
    if (!S.active) return;
    if (S.gems > 0) {
      const payout = Math.floor(S.bet * multiplier(S.mines, S.gems));
      S.round.settle(payout);
      NC.ui.toast(t("Mines : encaissement automatique {v}", { v: money(payout) }), "success");
    } else {
      S.round.settled = true;
      NC.wallet.credit(S.bet, ID, "refund");
      NC.ui.toast(t("Mines : mise remboursée (aucune case ouverte)"), "info");
    }
    S.active = false;
  }

  NC.registerGame({
    id: ID,
    title: "Neon Mines",
    tagline: t("Trouvez les gemmes, évitez les mines, encaissez quand vous voulez."),
    category: "instant",
    badge: t("Stratégie"),
    payout: t("Progressif"),
    accent: "#b6ff00",
    accent2: "#2bff88",
    icon: '<svg viewBox="0 0 24 24"><path d="M12 21L3 10l4-6h10l4 6z"/><path d="M3 10h18"/></svg>',
    art: `<svg viewBox="0 0 320 210"><g class="art-float">${Array.from({ length: 16 }, (_, i) => {
      const x = 92 + (i % 4) * 36, y = 30 + Math.floor(i / 4) * 36;
      const gem = [1, 6, 9, 14].includes(i), bomb = i === 11;
      return `<rect x="${x}" y="${y}" width="30" height="30" rx="7" fill="${gem ? "rgba(182,255,0,.15)" : bomb ? "rgba(255,59,92,.2)" : "#14112e"}" stroke="${gem ? "#b6ff00" : bomb ? "#ff3b5c" : "rgba(255,255,255,.12)"}" stroke-width="1.5"/>${gem ? `<path d="M${x + 15} ${y + 24}l-9-11 4-5h10l4 5z" fill="#b6ff00" class="a-pulse"/>` : ""}${bomb ? `<circle cx="${x + 15}" cy="${y + 16}" r="7" fill="#ff3b5c" class="a-blink"/>` : ""}`;
    }).join("")}</g></svg>`,
    rules: () => NC.i18n.pick({ fr: `<h4>Principe</h4><p>Choisissez la mise et le nombre de mines (1–24), puis ouvrez des cases. Chaque gemme augmente le multiplicateur ; une mine fait tout perdre.</p>
      <h4>Calcul</h4><p>Multiplicateur = produit des probabilités inverses × 0,98 (avantage maison 2 %). Exemple, 3 mines : 1 gemme 1,11×, 5 gemmes 2,00×.</p>
      <ul><li>Encaissez à tout moment après une gemme.</li><li>Toutes les gemmes trouvées : encaissement automatique.</li><li>Fermer le jeu encaisse (ou rembourse si aucune case n'a été ouverte).</li></ul>`, tr: `<h4>Kural</h4><p>Bahsi ve mayın sayısını (1–24) seçin, sonra kutuları açın. Her mücevher çarpanı artırır; bir mayın her şeyi kaybettirir.</p>
      <h4>Hesap</h4><p>Çarpan = ters olasılıkların çarpımı × 0,98 (kasa avantajı %2). Örnek, 3 mayın: 1 mücevher 1,11×, 5 mücevher 2,00×.</p>
      <ul><li>İlk mücevherden sonra istediğiniz an bozdurun.</li><li>Tüm mücevherler bulununca otomatik bozdurulur.</li><li>Oyunu kapatmak bozdurur (hiç kutu açılmadıysa bahis iade edilir).</li></ul>` }),
    mount,
    leave,
  });
})();
