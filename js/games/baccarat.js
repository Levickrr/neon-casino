/* =============================================================================
   BACCARAT (Punto Banco) — 8-deck shoe, full third-card rules,
   Player 1:1, Banker 0.95:1, Tie 8:1, Pairs 11:1. Bead-plate history.
============================================================================= */
(function () {
  "use strict";
  const { money } = NC.util;
  const B = NC.baccarat;
  const t = NC.t;
  const ID = "baccarat";
  const CHIPS = [10, 50, 100, 500, 1000, 5000, 25000];
  const ZONES = [
    { key: "ppair", label: t("Paire Joueur"), pay: "11:1" },
    { key: "player", label: t("Joueur"), pay: "1:1" },
    { key: "tie", label: t("Égalité"), pay: "8:1" },
    { key: "banker", label: t("Banque"), pay: "0.95:1" },
    { key: "bpair", label: t("Paire Banque"), pay: "11:1" },
  ];

  const S = { shoe: [], bets: {}, last: null, chip: 100, dealing: false, pending: null, history: [], area: null, scope: null };

  function draw() {
    if (S.shoe.length < 16) { S.shoe = NC.cards.createShoe(8); NC.ui.toast(t("Nouveau sabot (8 jeux)"), "info"); }
    return S.shoe.pop();
  }

  function mount(area, scope) {
    S.area = area;
    S.scope = scope;
    S.dealing = false;
    S.bets = {};
    if (!S.shoe.length) S.shoe = NC.cards.createShoe(8);
    area.innerHTML = `
      <div class="bac">
        <div class="felt felt--bac">
          <div class="felt__arc">${t("PUNTO BANCO · LA BANQUE PAIE 0.95 · ÉGALITÉ 8 CONTRE 1")}</div>
          <div class="bac-hands">
            <div class="bac-side bac-side--player"><div class="bac-side__head"><span>${t("JOUEUR")}</span><b class="bac-total" id="bc-pt">–</b></div><div class="hand" id="bc-player"></div></div>
            <div class="bac-vs">VS</div>
            <div class="bac-side bac-side--banker"><div class="bac-side__head"><span>${t("BANQUE")}</span><b class="bac-total" id="bc-bt">–</b></div><div class="hand" id="bc-banker"></div></div>
          </div>
          <div class="bac-msg" id="bc-msg">${t("Faites vos jeux")}</div>
          <div class="bac-zones">
            ${ZONES.map((z) => `<button class="bac-zone bac-zone--${z.key}" data-bet="${z.key}"><span class="bac-zone__name">${z.label}</span><span class="bac-zone__pay">${z.pay}</span><span class="bac-zone__amt" data-amt="${z.key}"></span></button>`).join("")}
          </div>
        </div>
        <div class="bac-bottom">
          <div class="roul__controls">
            <div class="chips">${CHIPS.map((c) => `<button class="chip chip--${c}${c === S.chip ? " is-active" : ""}" data-chip="${c}">${c >= 1000 ? c / 1000 + "k" : c}</button>`).join("")}</div>
            <div class="roul__btns">
              <button class="btn btn--ghost btn--sm" data-act="clear">${t("Effacer")}</button>
              <button class="btn btn--ghost btn--sm" data-act="rebet">${t("Rejouer")}</button>
              <button class="btn btn--primary btn--lg btn--gold" data-act="deal">${t("Distribuer")}</button>
            </div>
          </div>
          <div class="bac-road">
            <div class="bac-road__head"><span class="lbl">${t("Historique (bead plate)")}</span><span class="bac-counts" id="bc-counts"></span></div>
            <div class="bead" id="bc-bead"></div>
          </div>
        </div>
      </div>`;
    scope.on(area, "click", onClick);
    scope.on(area, "contextmenu", (e) => { const z = e.target.closest("[data-bet]"); if (z && !S.dealing) { e.preventDefault(); delete S.bets[z.dataset.bet]; renderBets(); } });
    renderBets();
    renderRoad();
  }

  const staged = () => Object.values(S.bets).reduce((a, b) => a + b, 0);

  function onClick(e) {
    const chip = e.target.closest("[data-chip]");
    if (chip) {
      S.chip = +chip.dataset.chip;
      S.area.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === chip));
      return NC.audio.play("chip");
    }
    if (S.dealing) return;
    const z = e.target.closest("[data-bet]");
    if (z) {
      if (staged() + S.chip > NC.wallet.balance) return NC.ui.toast(t("Solde insuffisant"), "error");
      S.bets[z.dataset.bet] = (S.bets[z.dataset.bet] || 0) + S.chip;
      NC.audio.play("chip");
      return renderBets();
    }
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    if (b.dataset.act === "clear") { S.bets = {}; renderBets(); }
    if (b.dataset.act === "rebet") {
      if (!S.last) return NC.ui.toast(t("Aucune mise précédente"), "info");
      const tot = Object.values(S.last).reduce((x, y) => x + y, 0);
      if (tot > NC.wallet.balance) return NC.ui.toast(t("Solde insuffisant"), "error");
      S.bets = Object.assign({}, S.last);
      renderBets();
    }
    if (b.dataset.act === "deal") deal();
  }

  function renderBets() {
    const a = S.area;
    ZONES.forEach((z) => {
      const el = a.querySelector(`[data-amt="${z.key}"]`);
      const v = S.bets[z.key];
      el.textContent = v ? money(v) : "";
      el.parentElement.classList.toggle("has-bet", !!v);
    });
    a.querySelector('[data-act="deal"]').disabled = S.dealing || !staged();
    a.querySelectorAll("[data-act]").forEach((b) => { if (b.dataset.act !== "deal") b.disabled = S.dealing; });
  }

  async function deal() {
    const total = staged();
    if (!total) return NC.ui.toast(t("Placez une mise"), "error");
    const round = NC.startRound(ID, total);
    if (!round) return NC.ui.toast(t("Solde insuffisant"), "error");
    S.dealing = true;
    S.last = Object.assign({}, S.bets);
    const bets = Object.assign({}, S.bets);
    const coup = B.playCoup(draw);
    const res = B.settle(bets, coup);
    S.pending = { round, coup, res, bets, total };
    renderBets();
    const a = S.area;
    const pEl = a.querySelector("#bc-player");
    const bEl = a.querySelector("#bc-banker");
    pEl.innerHTML = "";
    bEl.innerHTML = "";
    a.querySelector("#bc-pt").textContent = "–";
    a.querySelector("#bc-bt").textContent = "–";
    a.querySelectorAll(".bac-side").forEach((s) => s.classList.remove("is-win"));
    a.querySelectorAll(".bac-zone").forEach((s) => s.classList.remove("is-win"));
    const msg = a.querySelector("#bc-msg");
    msg.className = "bac-msg";
    msg.textContent = t("Distribution…");
    const fast = NC.settings.reducedFx();
    const pc = [], bc = [];
    for (let i = 0; i < coup.order.length; i++) {
      const o = coup.order[i];
      if (i === 4) { msg.textContent = t("Troisième carte…"); await S.scope.sleep(fast ? 50 : 500); }
      const el = o.to === "P" ? pEl : bEl;
      const arr = o.to === "P" ? pc : bc;
      arr.push(o.card);
      el.insertAdjacentHTML("beforeend", NC.ui.card(o.card, { cls: i >= 4 ? "pcard--third" : "" }));
      NC.audio.play("card");
      a.querySelector(o.to === "P" ? "#bc-pt" : "#bc-bt").textContent = B.total(arr);
      await S.scope.sleep(fast ? 60 : 520);
    }
    resolve();
  }

  function resolve() {
    const p = S.pending;
    if (!p) return;
    S.pending = null;
    const net = p.round.settle(p.res.total);
    S.dealing = false;
    S.history.push({ w: p.coup.winner, pp: p.res.pPair, bp: p.res.bPair, pt: p.coup.pTotal, bt: p.coup.bTotal });
    S.bets = {};
    const a = S.area;
    if (!a.isConnected) return;
    a.querySelector("#bc-pt").textContent = p.coup.pTotal;
    a.querySelector("#bc-bt").textContent = p.coup.bTotal;
    const name = { player: t("Joueur gagne"), banker: t("Banque gagne"), tie: t("Égalité") }[p.coup.winner];
    const msg = a.querySelector("#bc-msg");
    msg.textContent = `${name} · ${p.coup.pTotal} – ${p.coup.bTotal}${p.coup.natural ? " " + t("(naturel)") : ""}`;
    msg.className = "bac-msg bac-msg--" + p.coup.winner;
    if (p.coup.winner !== "tie") a.querySelector(".bac-side--" + p.coup.winner).classList.add("is-win");
    a.querySelector(".bac-zone--" + p.coup.winner).classList.add("is-win");
    if (p.res.pPair) a.querySelector(".bac-zone--ppair").classList.add("is-win");
    if (p.res.bPair) a.querySelector(".bac-zone--bpair").classList.add("is-win");
    renderBets();
    renderRoad();
    NC.ui.banner(a.querySelector(".felt"), net > 0 ? (p.res.total >= p.total * 5 ? "big" : "win") : net === 0 ? "push" : "lose", name, net > 0 ? "+" + money(net) : net === 0 ? t("Mise rendue") : "−" + money(-net));
    NC.ui.announce(net, p.res.total, { target: a.querySelector(".bac-zones"), stake: p.total, msg: name + " — " + (net >= 0 ? t("retour {v}", { v: money(p.res.total) }) : t("perdu {v}", { v: money(-net) })) });
  }

  function renderRoad() {
    const a = S.area;
    const bead = a.querySelector("#bc-bead");
    const list = S.history.slice(-66);
    bead.innerHTML = list.map((h) => `<i class="bd bd--${h.w}" title="${h.pt}-${h.bt}">${h.w === "player" ? "J" : h.w === "banker" ? "B" : "É"}${h.pp ? '<s class="bd-pp"></s>' : ""}${h.bp ? '<s class="bd-bp"></s>' : ""}</i>`).join("");
    const c = { player: 0, banker: 0, tie: 0 };
    S.history.forEach((h) => c[h.w]++);
    a.querySelector("#bc-counts").innerHTML = `<b class="bc-p">J ${c.player}</b><b class="bc-b">B ${c.banker}</b><b class="bc-t">É ${c.tie}</b>`;
  }

  function leave() { if (S.pending) resolve(); }

  NC.registerGame({
    id: ID,
    title: "Baccarat",
    tagline: t("Joueur, Banque ou Égalité. L'élégance du Punto Banco."),
    category: "cards",
    badge: "Prestige",
    payout: t("Jusqu'à 12×"),
    accent: "#ffc94d",
    accent2: "#ff8a3d",
    isNew: true,
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="8" height="12" rx="1.5"/><rect x="13" y="6" width="8" height="12" rx="1.5"/><path d="M7 10v4M17 10v4"/></svg>',
    art: `<svg viewBox="0 0 320 210"><defs><linearGradient id="bc-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc94d"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>
      <ellipse cx="160" cy="186" rx="130" ry="18" fill="#ffc94d" opacity=".1"/>
      <g class="art-float">
      <g transform="translate(62 50)"><rect width="62" height="88" rx="8" fill="#0b0a22" stroke="#00f0ff" stroke-width="2"/><text x="31" y="56" text-anchor="middle" font-family="Unbounded" font-weight="900" font-size="30" fill="#00f0ff">8</text></g>
      <g transform="translate(196 50)"><rect width="62" height="88" rx="8" fill="#0b0a22" stroke="#ff3b5c" stroke-width="2"/><text x="31" y="56" text-anchor="middle" font-family="Unbounded" font-weight="900" font-size="30" fill="#ff3b5c">9</text></g>
      <circle cx="160" cy="94" r="26" fill="none" stroke="url(#bc-g)" stroke-width="3" class="a-pulse"/><text x="160" y="100" text-anchor="middle" font-family="Unbounded" font-weight="800" font-size="14" fill="#ffc94d">VS</text></g></svg>`,
    rules: () => NC.i18n.pick({ fr: `<h4>Valeurs</h4><p>As = 1, 2–9 = valeur, 10/J/Q/K = 0. Seul le chiffre des unités compte (7 + 8 = 5).</p>
      <h4>Tirage</h4><ul><li>8 ou 9 sur deux cartes (naturel) : personne ne tire.</li><li>Joueur : tire sur 0–5, reste sur 6–7.</li><li>Si le Joueur reste, la Banque tire sur 0–5.</li><li>Si le Joueur a tiré une 3<sup>e</sup> carte (valeur X), la Banque : 0–2 tire ; 3 tire sauf X=8 ; 4 tire si X=2–7 ; 5 si X=4–7 ; 6 si X=6–7 ; 7 reste.</li></ul>
      <h4>Paiements</h4><table><tr><td>Joueur</td><td>1:1</td></tr><tr><td>Banque</td><td>0,95:1 (commission 5 %)</td></tr><tr><td>Égalité</td><td>8:1 — mises Joueur/Banque rendues</td></tr><tr><td>Paire Joueur / Banque</td><td>11:1 (deux premières cartes de même rang)</td></tr></table>`, tr: `<h4>Değerler</h4><p>As = 1, 2–9 = kendi değeri, 10/J/Q/K = 0. Sadece birler basamağı sayılır (7 + 8 = 5).</p>
      <h4>Kart çekme</h4><ul><li>İlk iki kartta 8 veya 9 (natürel): kimse kart çekmez.</li><li>Oyuncu: 0–5'te çeker, 6–7'de durur.</li><li>Oyuncu durursa Kasa 0–5'te çeker.</li><li>Oyuncu 3. kart çektiyse (değeri X) Kasa: 0–2 çeker; 3 çeker (X=8 hariç); 4, X=2–7 ise çeker; 5, X=4–7 ise; 6, X=6–7 ise; 7 durur.</li></ul>
      <h4>Ödemeler</h4><table><tr><td>Oyuncu</td><td>1:1</td></tr><tr><td>Kasa</td><td>0,95:1 (%5 komisyon)</td></tr><tr><td>Beraberlik</td><td>8:1 — Oyuncu/Kasa bahisleri iade</td></tr><tr><td>Oyuncu çifti / Kasa çifti</td><td>11:1 (aynı değerde ilk iki kart)</td></tr></table>` }),
    mount,
    leave,
  });
})();
