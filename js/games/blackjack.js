/* =============================================================================
   BLACKJACK — 6-deck shoe, dealer stands on all 17, blackjack pays 3:2,
   dealer peeks for blackjack, double on any two cards, one split.
   Fixes vs. original: biased shuffle, string-matched payouts, dealer
   blackjack not checked, no double/split, hand lost when closing.
============================================================================= */
(function () {
  "use strict";
  const { money, Scope } = NC.util;
  const t = NC.t;
  const ID = "blackjack";

  const S = {
    shoe: [], phase: "bet", hands: [], active: 0, dealer: [], round: null, scope: null, area: null, busy: false,
  };

  function draw() {
    if (S.shoe.length < 78) {
      S.shoe = NC.cards.createShoe(6);
      NC.ui.toast(t("Nouveau sabot mélangé (6 jeux)"), "info");
    }
    return S.shoe.pop();
  }
  const val = (h) => NC.cards.bjValue(h);
  const isBJ = (h) => h.cards.length === 2 && val(h.cards).total === 21 && !h.fromSplit;
  const tenVal = (c) => NC.cards.bjCardValue(c) === 10;

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function mount(area, scope) {
    S.scope = scope;
    S.area = area;
    if (!S.shoe.length) S.shoe = NC.cards.createShoe(6);
    S.phase = "bet";
    S.hands = [];
    S.dealer = [];
    area.innerHTML = `
      <div class="g-layout">
        <div class="g-stage">
          <div class="felt felt--bj">
            <div class="felt__arc">${t("BLACKJACK PAIE 3 CONTRE 2 · LA BANQUE RESTE SUR 17")}</div>
            <div class="shoe" aria-hidden="true"><i></i></div>
            <div class="bj-zone bj-zone--dealer">
              <div class="bj-label">${t("Banque")} <span class="bj-total" id="bj-dtotal"></span></div>
              <div class="hand" id="bj-dealer"></div>
            </div>
            <div class="bj-msg" id="bj-msg">${t("Placez votre mise")}</div>
            <div class="bj-zone bj-zone--player" id="bj-hands"></div>
          </div>
        </div>
        <aside class="g-panel">
          ${NC.ui.betControl(ID, 100)}
          <button class="btn btn--primary btn--lg btn--block" data-act="deal">${t("Distribuer")}</button>
          <div class="bj-actions">
            <button class="btn btn--blue" data-act="hit" disabled>${t("Carte")}</button>
            <button class="btn btn--pink btn--primary" data-act="stand" disabled>${t("Rester")}</button>
            <button class="btn btn--ghost" data-act="double" disabled>${t("Doubler")}</button>
            <button class="btn btn--ghost" data-act="split" disabled>${t("Séparer")}</button>
          </div>
          <div class="g-info">
            <div><span class="lbl">${t("Mise totale")}</span><strong id="bj-stake">0 ₵</strong></div>
            <div><span class="lbl">${t("Sabot")}</span><strong id="bj-shoe">${S.shoe.length}</strong></div>
          </div>
          <p class="muted small">${t("Raccourcis : <b>H</b> carte · <b>S</b> rester · <b>D</b> doubler · <b>P</b> séparer · <b>Entrée</b> distribuer")}</p>
        </aside>
      </div>`;
    scope.on(area, "click", (e) => {
      const b = e.target.closest("[data-act]");
      if (b && !b.disabled) act(b.dataset.act);
    });
    scope.on(document, "keydown", (e) => {
      if (e.target.tagName === "INPUT" && e.key !== "Enter") return;
      const map = { h: "hit", s: "stand", d: "double", p: "split", Enter: "deal" };
      const a = map[e.key];
      if (!a) return;
      const b = area.querySelector(`[data-act="${a}"]`);
      if (b && !b.disabled) { e.preventDefault(); act(a); }
    });
    renderControls();
  }

  function renderControls() {
    const q = (a) => S.area.querySelector(`[data-act="${a}"]`);
    const playing = S.phase === "play" && !S.busy;
    const h = S.hands[S.active];
    q("deal").disabled = S.phase !== "bet" && S.phase !== "done";
    q("deal").textContent = S.phase === "done" ? t("Nouvelle main") : t("Distribuer");
    q("hit").disabled = !playing;
    q("stand").disabled = !playing;
    q("double").disabled = !(playing && h && h.cards.length === 2 && NC.wallet.balance >= h.bet);
    q("split").disabled = !(playing && h && S.hands.length === 1 && h.cards.length === 2 && NC.cards.bjCardValue(h.cards[0]) === NC.cards.bjCardValue(h.cards[1]) && NC.wallet.balance >= h.bet);
    NC.ui.lockBet(ID, !(S.phase === "bet" || S.phase === "done"));
    const st = S.area.querySelector("#bj-stake");
    if (st) st.textContent = money(S.round ? S.round.stake : 0);
    const sh = S.area.querySelector("#bj-shoe");
    if (sh) sh.textContent = S.shoe.length;
  }

  function totalLabel(cards) {
    const v = val(cards);
    if (v.soft && v.total < 21 && cards.length >= 2) return `${v.total - 10}/${v.total}`;
    return String(v.total);
  }

  /** Appends only new cards so existing ones don't re-animate. */
  function syncHand(el, cards, hideSecond) {
    const kids = el.children;
    for (let i = 0; i < cards.length; i++) {
      const hidden = hideSecond && i === 1;
      const ex = kids[i];
      if (!ex) {
        el.insertAdjacentHTML("beforeend", NC.ui.card(cards[i], { hidden }));
      } else if (ex.classList.contains("pcard--back") && !hidden) {
        const n = NC.util.html(NC.ui.card(cards[i], { noAnim: true, cls: "pcard--flip" }));
        el.replaceChild(n, ex);
      }
    }
    while (el.children.length > cards.length) el.lastElementChild.remove();
  }

  function render(revealDealer) {
    const a = S.area;
    if (!a.isConnected) return;
    syncHand(a.querySelector("#bj-dealer"), S.dealer, !revealDealer);
    const dt = a.querySelector("#bj-dtotal");
    if (!S.dealer.length) dt.textContent = "";
    else dt.textContent = revealDealer ? totalLabel(S.dealer) : totalLabel([S.dealer[0]]) + " + ?";
    const wrap = a.querySelector("#bj-hands");
    while (wrap.children.length < S.hands.length) {
      wrap.insertAdjacentHTML("beforeend", `<div class="bj-hand"><div class="hand"></div><div class="bj-label">${t("Votre main")} <span class="bj-total"></span><span class="bj-bet"></span></div></div>`);
    }
    while (wrap.children.length > S.hands.length) wrap.lastElementChild.remove();
    S.hands.forEach((h, i) => {
      const box = wrap.children[i];
      syncHand(box.querySelector(".hand"), h.cards, false);
      box.querySelector(".bj-total").textContent = h.cards.length ? totalLabel(h.cards) : "";
      box.querySelector(".bj-bet").textContent = money(h.bet) + (h.doubled ? " ×2" : "");
      box.classList.toggle("is-active", S.phase === "play" && i === S.active && S.hands.length > 1);
      box.classList.toggle("is-bust", val(h.cards).total > 21);
      box.dataset.result = h.result || "";
    });
    renderControls();
  }
  function msg(t, cls) {
    const m = S.area.querySelector("#bj-msg");
    if (!m) return;
    m.textContent = t;
    m.className = "bj-msg" + (cls ? " bj-msg--" + cls : "");
  }

  // ---------------------------------------------------------------------------
  // Game flow
  // ---------------------------------------------------------------------------
  async function act(a) {
    if (S.busy) return;
    NC.audio.play("click");
    if (a === "deal") return deal();
    const h = S.hands[S.active];
    if (S.phase !== "play" || !h) return;
    if (a === "hit") {
      h.cards.push(draw());
      NC.audio.play("card");
      render(false);
      const v = val(h.cards).total;
      if (v > 21) { NC.fx.shake(S.area.querySelectorAll(".bj-hand")[S.active]); await next(); }
      else if (v === 21) await next();
    } else if (a === "stand") {
      await next();
    } else if (a === "double") {
      if (h.cards.length !== 2 || !S.round.addStake(h.bet)) return NC.ui.toast(t("Solde insuffisant pour doubler"), "error");
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(draw());
      NC.audio.play("chip");
      NC.audio.play("card");
      render(false);
      await next();
    } else if (a === "split") {
      if (S.hands.length !== 1 || !S.round.addStake(h.bet)) return NC.ui.toast(t("Solde insuffisant pour séparer"), "error");
      const second = { cards: [h.cards.pop()], bet: h.bet, fromSplit: true };
      h.fromSplit = true;
      S.hands.push(second);
      const aces = h.cards[0].r === "A";
      S.busy = true;
      render(false);
      await S.scope.sleep(250);
      h.cards.push(draw()); NC.audio.play("card"); render(false);
      await S.scope.sleep(250);
      second.cards.push(draw()); NC.audio.play("card");
      S.busy = false;
      render(false);
      if (aces) { S.active = 1; return finish(); } // split aces get one card each
      if (val(h.cards).total === 21) await next();
    }
  }

  async function deal() {
    if (S.phase !== "bet" && S.phase !== "done") return;
    const bet = NC.ui.readBet(ID);
    if (bet == null) return;
    const round = NC.startRound(ID, bet);
    if (!round) return NC.ui.toast(t("Mise invalide"), "error");
    S.round = round;
    S.hands = [{ cards: [], bet }];
    S.dealer = [];
    S.active = 0;
    S.phase = "play";
    S.busy = true;
    msg("");
    S.area.querySelector("#bj-hands").innerHTML = "";
    S.area.querySelector("#bj-dealer").innerHTML = "";
    render(false);
    const seq = [() => S.hands[0].cards.push(draw()), () => S.dealer.push(draw()), () => S.hands[0].cards.push(draw()), () => S.dealer.push(draw())];
    for (const f of seq) {
      f();
      NC.audio.play("card");
      render(false);
      await S.scope.sleep(NC.settings.reducedFx() ? 60 : 320);
    }
    S.busy = false;
    const player = S.hands[0];
    // Dealer peek on Ace / 10-value up-card
    const up = S.dealer[0];
    const dealerBJ = val(S.dealer).total === 21;
    if ((up.r === "A" || tenVal(up)) && dealerBJ) {
      msg(isBJ(player) ? t("Double blackjack") : t("La banque a un blackjack"), "lose");
      return settle();
    }
    if (isBJ(player)) {
      msg(t("BLACKJACK !"), "win");
      return settle();
    }
    if (up.r === "A" || tenVal(up)) msg(t("La banque vérifie… pas de blackjack"));
    render(false);
  }

  async function next() {
    if (S.active < S.hands.length - 1) {
      S.active++;
      const h = S.hands[S.active];
      render(false);
      if (val(h.cards).total === 21) return next();
      return;
    }
    return finish();
  }

  async function finish() {
    S.phase = "dealer";
    S.busy = true;
    render(true);
    NC.audio.play("card");
    const anyAlive = S.hands.some((h) => val(h.cards).total <= 21);
    if (anyAlive) {
      while (val(S.dealer).total < 17) {
        await S.scope.sleep(NC.settings.reducedFx() ? 80 : 650);
        S.dealer.push(draw());
        NC.audio.play("card");
        render(true);
      }
    }
    await S.scope.sleep(300);
    S.busy = false;
    settle();
  }

  /** Computes payouts for every hand. Safe to call once per round. */
  function computePayout() {
    const d = val(S.dealer).total;
    const dealerBJ = S.dealer.length === 2 && d === 21;
    let pay = 0;
    for (const h of S.hands) {
      const p = val(h.cards).total;
      let r;
      if (isBJ(h) && !dealerBJ) { r = "bj"; pay += Math.floor(h.bet * 2.5); }
      else if (dealerBJ) { r = isBJ(h) ? "push" : "lose"; if (r === "push") pay += h.bet; }
      else if (p > 21) r = "lose";
      else if (d > 21 || p > d) { r = "win"; pay += h.bet * 2; }
      else if (p === d) { r = "push"; pay += h.bet; }
      else r = "lose";
      h.result = r;
    }
    return pay;
  }

  function settle() {
    if (!S.round || S.round.settled) return;
    const pay = computePayout();
    const stake = S.round.stake;
    const net = S.round.settle(pay);
    S.phase = "done";
    render(true);
    const d = val(S.dealer).total;
    const hasBJ = S.hands.some((h) => h.result === "bj");
    let title;
    if (net > 0) title = hasBJ ? t("BLACKJACK !") : d > 21 ? t("La banque saute !") : t("Gagné");
    else if (net === 0) title = t("Égalité");
    else title = S.hands.every((h) => val(h.cards).total > 21) ? t("Dépassé") : t("Perdu");
    msg(title + (S.dealer.length ? " · " + t("Banque {n}", { n: d }) : ""), net > 0 ? "win" : net < 0 ? "lose" : "push");
    NC.ui.banner(S.area.querySelector(".felt"), net > 0 ? (hasBJ ? "big" : "win") : net < 0 ? "lose" : "push", title, (net >= 0 ? "+" : "−") + money(Math.abs(net)));
    NC.ui.announce(net, pay, { target: S.area.querySelector("#bj-hands"), stake });
  }

  /** Leaving mid-hand: remaining hands stand and the dealer plays instantly. */
  function leave() {
    if (S.round && !S.round.settled && S.hands.length) {
      // complete an interrupted deal / split first
      S.hands.forEach((h) => { while (h.cards.length < 2) h.cards.push(draw()); });
      while (S.dealer.length < 2) S.dealer.push(draw());
      const dealerBJ = val(S.dealer).total === 21;
      if (!dealerBJ && !isBJ(S.hands[0]) && S.hands.some((h) => val(h.cards).total <= 21)) {
        while (val(S.dealer).total < 17) S.dealer.push(draw());
      }
      const pay = computePayout();
      const net = S.round.settle(pay);
      NC.ui.toast(t("Main terminée automatiquement : {v}", { v: (net >= 0 ? "+" : "−") + money(Math.abs(net)) }), net >= 0 ? "success" : "info");
    }
    S.round = null;
    S.phase = "bet";
    S.busy = false;
  }

  NC.registerGame({
    id: ID,
    title: "Blackjack",
    tagline: t("Le 21 mythique. Doublez, séparez, battez la banque."),
    category: "cards",
    badge: t("Classique"),
    payout: "3:2",
    accent: "#00f0ff",
    accent2: "#2f7bff",
    icon: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="11" height="15" rx="2"/><path d="M9 7v.01M9 14v.01"/><rect x="9" y="6" width="11" height="15" rx="2"/></svg>',
    art: `<svg viewBox="0 0 320 210"><defs><linearGradient id="bj-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00f0ff"/><stop offset="1" stop-color="#2f7bff"/></linearGradient></defs>
      <ellipse cx="160" cy="190" rx="130" ry="20" fill="#00f0ff" opacity=".12"/>
      <g class="art-float">
        <g transform="translate(98 34) rotate(-14 40 60)"><rect width="80" height="114" rx="10" fill="#0b0a22" stroke="url(#bj-g)" stroke-width="2.5"/><text x="12" y="28" fill="#fff" font-family="Unbounded" font-weight="900" font-size="22">A</text><text x="40" y="80" text-anchor="middle" fill="#00f0ff" font-size="42">♠</text></g>
        <g transform="translate(148 40) rotate(10 40 60)"><rect width="80" height="114" rx="10" fill="#0b0a22" stroke="#ff2bd6" stroke-width="2.5"/><text x="12" y="28" fill="#fff" font-family="Unbounded" font-weight="900" font-size="22">K</text><text x="40" y="80" text-anchor="middle" fill="#ff2bd6" font-size="42">♥</text></g>
      </g>
      <text x="160" y="196" text-anchor="middle" font-family="Unbounded" font-weight="900" font-size="22" fill="#fff" opacity=".9" class="a-pulse">21</text></svg>`,
    rules: () => NC.i18n.pick({ fr: `<h4>Objectif</h4><p>Approcher 21 sans le dépasser et battre la banque.</p>
      <h4>Règles</h4><ul><li>Sabot de 6 jeux, remélangé automatiquement.</li><li>Figures = 10, As = 1 ou 11.</li><li>La banque tire jusqu'à 16 et reste sur tous les 17.</li><li>La banque vérifie le blackjack avec un As ou un 10 visible.</li><li><b>Doubler</b> : sur vos 2 premières cartes, mise doublée, une seule carte.</li><li><b>Séparer</b> : deux cartes de même valeur, une fois. As séparés : une carte chacun. 21 après séparation n'est pas un blackjack.</li></ul>
      <h4>Paiements</h4><table><tr><td>Blackjack</td><td>3:2 (2,5× la mise)</td></tr><tr><td>Victoire</td><td>1:1 (2×)</td></tr><tr><td>Égalité</td><td>mise rendue</td></tr></table>
      <p class="muted small">Si vous quittez en pleine main, vos mains restent et la banque joue instantanément.</p>`, tr: `<h4>Amaç</h4><p>21'i geçmeden ona yaklaşmak ve krupiyeyi yenmek.</p>
      <h4>Kurallar</h4><ul><li>6 desteli sabot, otomatik olarak yeniden karıştırılır.</li><li>Resimli kartlar = 10, As = 1 veya 11.</li><li>Krupiye 16'ya kadar kart çeker ve tüm 17'lerde durur.</li><li>Açık kartı As veya 10 olduğunda krupiye blackjack kontrolü yapar.</li><li><b>Double</b>: ilk 2 kartınızda bahis ikiye katlanır, tek kart alırsınız.</li><li><b>Böl (split)</b>: aynı değerde iki kart, bir kez. Bölünen Aslara birer kart verilir. Bölmeden sonraki 21 blackjack sayılmaz.</li></ul>
      <h4>Ödemeler</h4><table><tr><td>Blackjack</td><td>3:2 (bahsin 2,5 katı)</td></tr><tr><td>Kazanç</td><td>1:1 (2×)</td></tr><tr><td>Beraberlik</td><td>bahis iade</td></tr></table>
      <p class="muted small">Elin ortasında çıkarsanız elleriniz durur ve krupiye anında oynar.</p>` }),
    mount,
    leave,
  });
})();
