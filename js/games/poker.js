/* =============================================================================
   TEXAS HOLD'EM — you vs. 3 AI opponents (No-Limit, cash table).
   - Buy-in comes from the shared wallet; your stack goes back when you leave.
     Chips at the table are saved, so a page reload returns them.
   - Blinds, 4 betting rounds, check/call/raise/fold/all-in, minimum raise,
     side pots, split pots, odd chip to the first seat left of the button.
   - An unmatched bet (nobody can call it) is RETURNED, not shown as a win.
   - AI styles: Viper (tight-aggressive), Bubbles (calls a lot), Blaze
     (maniac). Decisions use Monte-Carlo equity, pot odds and a defence
     frequency so they don't fold to every bet.
   - Natural pacing: cards are dealt one by one, AIs take time to think,
     each street and the showdown are revealed step by step.
============================================================================= */
(function () {
  "use strict";
  const { money, fmt, escapeHtml } = NC.util;
  const t = NC.t;
  const P = NC.poker;
  const ID = "poker";
  const STAKES = [
    { sb: 10, bb: 20, label: "10 / 20" },
    { sb: 50, bb: 100, label: "50 / 100" },
    { sb: 250, bb: 500, label: "250 / 500" },
    { sb: 1000, bb: 2000, label: "1k / 2k" },
  ];
  const STYLES = {
    tag: { tag: "Serré-agressif", tight: 0.04, aggr: 0.6, bluff: 0.08, call: 0.02, defend: 0.3, color: "#00f0ff" },
    station: { tag: "Suiveur", tight: -0.05, aggr: 0.2, bluff: 0.03, call: 0.08, defend: 0.55, color: "#2bff88" },
    maniac: { tag: "Maniaque", tight: -0.1, aggr: 0.8, bluff: 0.22, call: 0.04, defend: 0.4, color: "#ff2bd6" },
  };
  const AI_NAMES = { tag: ["Viper", "Nyx", "Kaito"], station: ["Bubbles", "Momo", "Pixel"], maniac: ["Blaze", "Rex", "Volt"] };
  // Pacing (ms) — between "too fast" and "too slow"
  const PACE = { deal: 260, think: [1000, 1900], afterAct: 450, street: 1000, collect: 650, reveal: 900, showdown: 1600 };

  const S = {
    phase: "lobby", // lobby | table
    stake: STAKES[1], buyIn: 0, round: null,
    players: [], button: 0, board: [], deck: [], street: "", currentBet: 0, minRaise: 0,
    handNo: 0, inHand: false, waiting: null, log: [], area: null, scope: null,
  };

  // ---------------------------------------------------------------------------
  // Lobby (buy-in)
  // ---------------------------------------------------------------------------
  function mount(area, scope) {
    S.area = area;
    S.scope = scope;
    scope.on(area, "click", (e) => (S.phase === "lobby" ? lobbyClick(e) : onTableClick(e)));
    scope.on(area, "input", (e) => {
      if (e.target.id === "pk-buy") updLobby();
      if (e.target.id === "pk-raise") updateRaiseLabel();
    });
    S.phase = "lobby";
    renderLobby();
  }

  function updLobby() {
    const a = S.area;
    const el = a.querySelector("#pk-buy");
    if (!el) return;
    const bbs = +el.value;
    a.querySelector("#pk-buyval").textContent = money(bbs * S.stake.bb);
    a.querySelector("#pk-bbs").textContent = t("({n} big blinds)", { n: bbs });
    a.querySelector("#pk-range").textContent = `${money(20 * S.stake.bb)} – ${money(200 * S.stake.bb)}`;
  }
  function lobbyClick(e) {
    const a = S.area;
    const st = e.target.closest("[data-stake]");
    if (st) {
      S.stake = STAKES[+st.dataset.stake];
      a.querySelectorAll("[data-stake]").forEach((b) => b.classList.toggle("is-active", b === st));
      updLobby();
      return NC.audio.play("click");
    }
    const b = e.target.closest("[data-act]");
    if (b && b.dataset.act === "sit") sit(+a.querySelector("#pk-buy").value * S.stake.bb);
  }

  function renderLobby() {
    const a = S.area;
    const idx = Math.max(0, STAKES.indexOf(S.stake));
    a.innerHTML = `
      <div class="pk-lobby">
        <div class="pk-lobby__art">${artSVG()}</div>
        <div class="pk-lobby__panel glass">
          <h3>${t("Rejoindre une table")}</h3>
          <p class="muted">${t("No-Limit Hold'em · 4 joueurs · vous contre Viper, Bubbles et Blaze.")}</p>
          <span class="lbl">Blinds</span>
          <div class="seg seg--block" id="pk-stakes">${STAKES.map((s, i) => `<button data-stake="${i}" class="${i === idx ? "is-active" : ""}">${s.label}</button>`).join("")}</div>
          <div class="field"><span class="lbl">${t("Cave (buy-in)")} — <span id="pk-range"></span></span>
            <input type="range" class="range" id="pk-buy" min="20" max="200" step="10" value="100">
            <div class="pk-buyval"><strong class="num" id="pk-buyval"></strong> <span class="muted" id="pk-bbs"></span></div>
          </div>
          <button class="btn btn--primary btn--lg btn--block" data-act="sit">${t("S'asseoir à la table")}</button>
          <p class="muted small">${t("Vos jetons restants retournent dans votre portefeuille quand vous quittez la table.")}</p>
        </div>
      </div>`;
    updLobby();
  }

  function sit(amount) {
    if (amount > NC.wallet.balance) return NC.ui.toast(t("Solde insuffisant pour cette cave"), "error");
    const round = NC.startRound(ID, amount);
    if (!round) return NC.ui.toast(t("Cave invalide"), "error");
    S.round = round;
    S.buyIn = amount;
    S.phase = "table";
    S.handNo = 0;
    S.log = [];
    S.inHand = false;
    S.button = NC.util.randInt(4);
    S.players = [
      { id: 0, name: t("Vous"), human: true, stack: amount },
      newAI(1, "tag"),
      newAI(2, "station"),
      newAI(3, "maniac"),
    ];
    NC.wallet.setEscrow(ID, amount);
    NC.audio.play("chip");
    renderTableShell();
  }

  function newAI(seat, style) {
    const names = AI_NAMES[style];
    const prev = S.players[seat];
    const name = prev ? names[(names.indexOf(prev.name) + 1) % names.length] : names[0];
    const bbs = 80 + NC.util.randInt(9) * 10;
    return { id: seat, name, human: false, style, stack: bbs * S.stake.bb };
  }

  // ---------------------------------------------------------------------------
  // Table UI
  // ---------------------------------------------------------------------------
  function renderTableShell() {
    const a = S.area;
    a.innerHTML = `
      <div class="pk">
        <div class="pk-table" id="pk-table">
          <div class="pk-felt">
            <div class="pk-pot" id="pk-pot"><span class="lbl">Pot</span><strong class="num">0</strong></div>
            <div class="pk-board" id="pk-board"></div>
            <div class="pk-street" id="pk-street"></div>
            <div class="pk-felt__logo">NEON HOLD'EM · ${S.stake.label}</div>
          </div>
          ${[0, 1, 2, 3].map((i) => `
            <div class="pk-seat pk-seat--${i}" id="pk-seat-${i}">
              <div class="pk-seat__cards" id="pk-cards-${i}"></div>
              <div class="pk-seat__plate">
                <div class="pk-avatar" id="pk-av-${i}"></div>
                <div class="pk-seat__info"><b class="pk-name"></b><span class="pk-stack num"></span><small class="pk-style"></small></div>
                <span class="pk-dealer" hidden>D</span>
                <span class="pk-think" aria-hidden="true"><i></i><i></i><i></i></span>
              </div>
              <div class="pk-action" id="pk-act-${i}"></div>
              <div class="pk-bet" id="pk-bet-${i}"></div>
            </div>`).join("")}
        </div>
        <div class="pk-controls" id="pk-controls">
          <div class="pk-controls__main">
            <button class="btn btn--danger" data-pk="fold" disabled>${t("Se coucher")}</button>
            <button class="btn btn--ghost" data-pk="call" disabled>${t("Parole")}</button>
            <div class="pk-raise">
              <div class="pk-raise__presets">
                <button class="btn btn--ghost btn--sm" data-preset="min">Min</button>
                <button class="btn btn--ghost btn--sm" data-preset="half">½ pot</button>
                <button class="btn btn--ghost btn--sm" data-preset="pot">Pot</button>
              </div>
              <input type="range" class="range" id="pk-raise" min="0" max="0" step="1" value="0" disabled>
            </div>
            <button class="btn btn--primary btn--uv" data-pk="raise" disabled>${t("Relancer")}</button>
            <button class="btn btn--primary btn--pink" data-pk="allin" disabled>${t("Tapis")}</button>
          </div>
          <div class="pk-controls__side">
            <div class="pk-log" id="pk-log"></div>
            <div class="pk-side-btns">
              <button class="btn btn--primary btn--green" data-pk="next" hidden>${t("Main suivante")}</button>
              <button class="btn btn--ghost btn--sm" data-pk="leave">${t("Quitter la table")}</button>
            </div>
          </div>
        </div>
      </div>`;
    renderSeats();
    if (!S.inHand) S.scope.timeout(startHand, 600);
  }

  function onTableClick(e) {
    const pre = e.target.closest("[data-preset]");
    if (pre && S.waiting) return applyPreset(pre.dataset.preset);
    const b = e.target.closest("[data-pk]");
    if (!b || b.disabled) return;
    const k = b.dataset.pk;
    NC.audio.play("click");
    if (k === "leave") return leaveTable();
    if (k === "next") { b.hidden = true; return startHand(); }
    if (k === "rebuy") return rebuy();
    if (!S.waiting) return;
    const me = S.players[0];
    const toCall = S.currentBet - me.bet;
    if (k === "fold") S.waiting({ type: "fold" });
    else if (k === "call") S.waiting(toCall > 0 ? { type: "call" } : { type: "check" });
    else if (k === "raise") S.waiting({ type: "raise", to: +S.area.querySelector("#pk-raise").value });
    else if (k === "allin") S.waiting({ type: "raise", to: me.bet + me.stack });
  }

  function renderSeats() {
    const a = S.area;
    S.players.forEach((p, i) => {
      const seat = a.querySelector("#pk-seat-" + i);
      if (!seat) return;
      seat.querySelector(".pk-name").textContent = p.name;
      seat.querySelector(".pk-stack").textContent = fmt(p.stack);
      seat.querySelector(".pk-style").textContent = p.human ? t("Humain") : t(STYLES[p.style].tag);
      seat.querySelector(".pk-dealer").hidden = S.button !== i;
      seat.style.setProperty("--pc", p.human ? "#b6ff00" : STYLES[p.style].color);
      seat.classList.toggle("is-folded", !!p.folded);
      seat.classList.toggle("is-allin", !!p.allIn);
      const av = a.querySelector("#pk-av-" + i);
      if (!av.innerHTML) av.innerHTML = avatar(p);
      const bet = a.querySelector("#pk-bet-" + i);
      bet.innerHTML = p.bet ? `<i class="pk-chip"></i>${fmt(p.bet)}` : "";
      bet.classList.toggle("has-bet", !!p.bet);
    });
    const pot = S.players.reduce((s, p) => s + (p.total || 0) - (p.bet || 0), 0);
    a.querySelector("#pk-pot strong").textContent = fmt(pot);
    NC.wallet.setEscrow(ID, S.players[0] ? S.players[0].stack : 0);
  }

  function avatar(p) {
    const c = p.human ? "#b6ff00" : STYLES[p.style].color;
    const initial = escapeHtml(p.name[0]);
    return `<svg viewBox="0 0 48 48"><defs><linearGradient id="av${p.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#14112e"/></linearGradient></defs><circle cx="24" cy="24" r="22" fill="url(#av${p.id})" stroke="${c}" stroke-width="2"/><text x="24" y="31" text-anchor="middle" font-family="Unbounded" font-weight="900" font-size="20" fill="#fff">${initial}</text></svg>`;
  }

  function showCards(i, reveal) {
    const p = S.players[i];
    const el = S.area.querySelector("#pk-cards-" + i);
    if (!p.hole || !p.hole.length) { el.innerHTML = ""; return; }
    const show = p.human || reveal;
    el.innerHTML = p.hole.map((c) => NC.ui.card(c, { hidden: !show, noAnim: true, cls: "pcard--sm" + (reveal && !p.human ? " pcard--flip" : "") + (p.folded ? " is-mucked" : "") })).join("");
  }

  function actionTag(i, text, cls) {
    const el = S.area.querySelector("#pk-act-" + i);
    if (!el) return;
    el.textContent = text;
    el.className = "pk-action is-on" + (cls ? " pk-action--" + cls : "");
  }
  function clearTags() {
    S.area.querySelectorAll(".pk-action").forEach((e) => (e.className = "pk-action"));
  }
  function log(msg) {
    S.log.push(msg);
    if (S.log.length > 40) S.log.shift();
    const el = S.area.querySelector("#pk-log");
    if (el) { el.innerHTML = S.log.slice(-8).map((x) => `<div>${escapeHtml(x)}</div>`).join(""); el.scrollTop = el.scrollHeight; }
  }
  const handName = (n) => t(n);

  // ---------------------------------------------------------------------------
  // Hand engine
  // ---------------------------------------------------------------------------
  const sleep = (ms) => S.scope.sleep(NC.util.dur(ms));
  const nextSeat = (i) => (i + 1) % 4;
  const inHand = () => S.players.filter((p) => !p.folded);
  const canAct = () => S.players.filter((p) => !p.folded && !p.allIn);

  async function startHand() {
    if (S.inHand || S.phase !== "table") return;
    const me = S.players[0];
    if (me.stack <= 0) return busted();
    for (let i = 1; i < 4; i++) if (S.players[i].stack <= 0) { S.players[i] = newAI(i, S.players[i].style); S.area.querySelector("#pk-av-" + i).innerHTML = ""; log(t("{p} rejoint la table", { p: S.players[i].name })); }
    S.inHand = true;
    S.handNo++;
    S.button = nextSeat(S.button);
    S.deck = NC.cards.createShoe(1);
    S.board = [];
    S.players.forEach((p) => Object.assign(p, { hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, result: null }));
    clearTags();
    S.area.querySelectorAll(".pk-seat").forEach((s) => s.classList.remove("is-winner", "is-turn"));
    S.area.querySelector("#pk-board").innerHTML = "";
    S.area.querySelector("#pk-street").textContent = t("Pré-flop");
    [0, 1, 2, 3].forEach((i) => (S.area.querySelector("#pk-cards-" + i).innerHTML = ""));
    log(t("— Main #{n} —", { n: S.handNo }));
    const sb = nextSeat(S.button);
    const bb = nextSeat(sb);
    post(sb, S.stake.sb, "SB");
    renderSeats();
    await sleep(350);
    post(bb, S.stake.bb, "BB");
    renderSeats();
    await sleep(400);
    // deal two cards each, one at a time starting left of the button
    for (let r = 0; r < 2; r++) {
      for (let k = 1; k <= 4; k++) {
        const i = (S.button + k) % 4;
        S.players[i].hole.push(S.deck.pop());
        const el = S.area.querySelector("#pk-cards-" + i);
        el.insertAdjacentHTML("beforeend", NC.ui.card(S.players[i].hole[r], { hidden: !S.players[i].human, cls: "pcard--sm" }));
        NC.audio.play("card");
        await sleep(PACE.deal);
      }
    }
    await sleep(300);
    S.currentBet = S.stake.bb;
    S.minRaise = S.stake.bb;
    S.street = "preflop";
    const res = await bettingRound(nextSeat(bb));
    if (res === "won") return endHand();
    for (const st of ["flop", "turn", "river"]) {
      await collectBets();
      await sleep(400);
      const n = st === "flop" ? 3 : 1;
      S.deck.pop(); // burn
      for (let k = 0; k < n; k++) {
        const c = S.deck.pop();
        S.board.push(c);
        S.area.querySelector("#pk-board").insertAdjacentHTML("beforeend", NC.ui.card(c));
        NC.audio.play("card");
        await sleep(PACE.deal + 60);
      }
      S.area.querySelector("#pk-street").textContent = { flop: "Flop", turn: "Turn", river: "River" }[st];
      S.street = st;
      showMyHand();
      clearTags();
      await sleep(PACE.street);
      if (canAct().length >= 2) {
        S.currentBet = 0;
        S.minRaise = S.stake.bb;
        S.players.forEach((p) => (p.acted = false));
        const r2 = await bettingRound(nextSeat(S.button));
        if (r2 === "won") return endHand();
      }
    }
    await collectBets();
    return endHand(true);
  }

  function post(i, amt, label) {
    const p = S.players[i];
    const a = Math.min(amt, p.stack);
    p.stack -= a;
    p.bet += a;
    p.total += a;
    if (p.stack === 0) p.allIn = true;
    actionTag(i, `${label} ${fmt(a)}`, "blind");
    NC.audio.play("chip");
  }

  function showMyHand() {
    const me = S.players[0];
    if (me.folded || !S.board.length) return;
    const e = P.evaluate(me.hole.concat(S.board));
    S.area.querySelector("#pk-street").textContent += " · " + t("Vous : {h}", { h: handName(e.name) });
  }

  async function bettingRound(first) {
    let i = first;
    let guard = 0;
    while (guard++ < 200) {
      if (inHand().length === 1) return "won";
      const actors = canAct();
      const needs = actors.filter((p) => !p.acted || p.bet < S.currentBet);
      if (!needs.length) return "done";
      if (actors.length === 1 && actors[0].bet >= S.currentBet) return "done";
      const p = S.players[i];
      if (p.folded || p.allIn || (p.acted && p.bet >= S.currentBet)) { i = nextSeat(i); continue; }
      highlightTurn(i);
      const decision = p.human ? await humanDecision() : await aiDecision(p);
      apply(p, decision);
      renderSeats();
      await sleep(PACE.afterAct);
      i = nextSeat(i);
    }
    return "done";
  }

  function highlightTurn(i) {
    S.area.querySelectorAll(".pk-seat").forEach((s, k) => s.classList.toggle("is-turn", k === i));
  }

  function apply(p, d) {
    const toCall = S.currentBet - p.bet;
    if (d.type === "fold") {
      p.folded = true;
      actionTag(p.id, t("Couché"), "fold");
      log(t("{p} se couche", { p: p.name }));
      showCards(p.id, false);
      NC.audio.play("card");
    } else if (d.type === "check" || (d.type === "call" && toCall <= 0)) {
      actionTag(p.id, t("Parole"), "check");
      log(t("{p} parole", { p: p.name }));
      NC.audio.play("tick");
    } else if (d.type === "call") {
      const amt = Math.min(toCall, p.stack);
      p.stack -= amt; p.bet += amt; p.total += amt;
      if (p.stack === 0) p.allIn = true;
      actionTag(p.id, p.allIn ? t("Tapis {v}", { v: fmt(p.bet) }) : t("Suit {v}", { v: fmt(amt) }), p.allIn ? "allin" : "call");
      log(p.allIn ? t("{p} suit {v} (tapis)", { p: p.name, v: fmt(amt) }) : t("{p} suit {v}", { p: p.name, v: fmt(amt) }));
      NC.audio.play("chip");
    } else if (d.type === "raise") {
      const maxTo = p.bet + p.stack;
      let to = Math.min(Math.floor(d.to), maxTo);
      const minTo = S.currentBet + S.minRaise;
      if (to < minTo && to < maxTo) to = Math.min(minTo, maxTo);
      if (to <= S.currentBet) return apply(p, { type: "call" });
      const amt = to - p.bet;
      p.stack -= amt; p.bet = to; p.total += amt;
      if (p.stack === 0) p.allIn = true;
      const raiseSize = to - S.currentBet;
      if (raiseSize >= S.minRaise) S.minRaise = raiseSize;
      const wasBet = S.currentBet === 0;
      S.currentBet = to;
      S.players.forEach((o) => { if (o !== p && !o.folded && !o.allIn) o.acted = false; });
      actionTag(p.id, p.allIn ? t("Tapis {v}", { v: fmt(to) }) : (wasBet ? t("Mise {v}", { v: fmt(to) }) : t("Relance {v}", { v: fmt(to) })), p.allIn ? "allin" : "raise");
      log(p.allIn ? t("{p} fait tapis ({v})", { p: p.name, v: fmt(to) }) : wasBet ? t("{p} mise {v}", { p: p.name, v: fmt(to) }) : t("{p} relance à {v}", { p: p.name, v: fmt(to) }));
      NC.audio.play("chip");
    }
    p.acted = true;
  }

  // ---------------------------------------------------------------------------
  // Human input
  // ---------------------------------------------------------------------------
  function humanDecision() {
    const me = S.players[0];
    const a = S.area;
    const toCall = S.currentBet - me.bet;
    const q = (k) => a.querySelector(`[data-pk="${k}"]`);
    const range = a.querySelector("#pk-raise");
    const maxTo = me.bet + me.stack;
    const minTo = Math.min(maxTo, S.currentBet + S.minRaise);
    q("fold").disabled = false;
    q("call").disabled = false;
    q("call").textContent = toCall > 0 ? (toCall >= me.stack ? t("Suivre (tapis {v})", { v: fmt(me.stack) }) : t("Suivre {v}", { v: fmt(toCall) })) : t("Parole");
    const canRaise = maxTo > S.currentBet && toCall < me.stack;
    q("raise").disabled = !canRaise || maxTo <= minTo;
    q("allin").disabled = me.stack <= 0;
    range.disabled = !canRaise || maxTo <= minTo;
    range.min = minTo;
    range.max = maxTo;
    range.step = Math.max(1, Math.floor(S.stake.sb));
    range.value = minTo;
    a.querySelectorAll("[data-preset]").forEach((b) => (b.disabled = range.disabled));
    updateRaiseLabel();
    a.querySelector("#pk-controls").classList.add("is-active");
    NC.audio.play("tick");
    return new Promise((resolve) => {
      S.waiting = (d) => {
        S.waiting = null;
        ["fold", "call", "raise", "allin"].forEach((k) => (q(k).disabled = true));
        range.disabled = true;
        a.querySelectorAll("[data-preset]").forEach((b) => (b.disabled = true));
        a.querySelector("#pk-controls").classList.remove("is-active");
        resolve(d);
      };
    });
  }
  function updateRaiseLabel() {
    const r = S.area.querySelector("#pk-raise");
    const b = S.area.querySelector('[data-pk="raise"]');
    if (r && b) b.textContent = S.currentBet ? t("Relancer à {v}", { v: fmt(+r.value) }) : t("Miser {v}", { v: fmt(+r.value) });
  }
  function applyPreset(k) {
    const r = S.area.querySelector("#pk-raise");
    if (r.disabled) return;
    const pot = S.players.reduce((s, p) => s + p.total, 0);
    const me = S.players[0];
    const toCall = S.currentBet - me.bet;
    let to;
    if (k === "min") to = +r.min;
    else if (k === "half") to = S.currentBet + Math.floor((pot + toCall) / 2);
    else to = S.currentBet + pot + toCall;
    r.value = Math.max(+r.min, Math.min(+r.max, to));
    updateRaiseLabel();
  }

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------
  async function aiDecision(p) {
    const seat = S.area.querySelector("#pk-seat-" + p.id);
    seat.classList.add("is-thinking");
    await sleep(PACE.think[0] + NC.util.randInt(PACE.think[1] - PACE.think[0]));
    seat.classList.remove("is-thinking");
    const st = STYLES[p.style];
    const opp = Math.max(1, inHand().length - 1);
    const eq = P.equity(p.hole, S.board, opp, S.board.length ? 260 : 160);
    const pot = S.players.reduce((s, x) => s + x.total, 0);
    const toCall = S.currentBet - p.bet;
    const odds = toCall > 0 ? toCall / (pot + toCall) : 0;
    const fair = 1 / (opp + 1); // equity of an average hand vs. this many opponents
    const rel = (eq + (NC.util.random() - 0.5) * 0.06 - st.tight) / fair; // 1 = average hand
    const r = NC.util.random();
    const stackLeft = p.stack;
    const raiseTo = (frac) => {
      const size = Math.max(S.minRaise, Math.round(((pot + toCall) * frac) / S.stake.sb) * S.stake.sb);
      const to = S.currentBet + size;
      return to >= (p.bet + stackLeft) * 0.8 ? p.bet + stackLeft : to;
    };

    if (toCall === 0) {
      // nobody has bet: value bet, bluff or check
      if (rel > 1.55 && r < st.aggr + 0.15) return { type: "raise", to: raiseTo(0.55 + NC.util.random() * 0.45) };
      if (rel > 1.2 && r < st.aggr * 0.6) return { type: "raise", to: raiseTo(0.45) };
      if (r < st.bluff) return { type: "raise", to: raiseTo(0.5) };
      return { type: "check" };
    }
    // facing a bet
    if (rel > 1.9 && r < st.aggr) return { type: "raise", to: raiseTo(0.7 + NC.util.random() * 0.5) };
    if (eq + st.call >= odds * 0.95) {
      if (rel > 1.45 && r < st.aggr * 0.45) return { type: "raise", to: raiseTo(0.75) };
      return { type: "call" };
    }
    // defence: don't give up every time someone bets (minimum defence frequency)
    const mdf = pot / (pot + toCall);
    if (rel > 0.7 && r < st.defend * mdf && toCall <= stackLeft * 0.5) return { type: "call" };
    if (r < st.bluff * 0.5 && toCall < stackLeft * 0.25) return { type: "raise", to: raiseTo(0.8) };
    if (toCall <= S.stake.bb && rel > 0.6) return { type: "call" };
    return { type: "fold" };
  }

  // ---------------------------------------------------------------------------
  // End of hand
  // ---------------------------------------------------------------------------
  async function collectBets() {
    const a = S.area;
    const potEl = a.querySelector("#pk-pot");
    const pr = potEl.getBoundingClientRect();
    let any = false;
    S.players.forEach((p, i) => {
      if (!p.bet) return;
      any = true;
      const b = a.querySelector("#pk-bet-" + i);
      const br = b.getBoundingClientRect();
      b.style.setProperty("--tx", pr.left + pr.width / 2 - (br.left + br.width / 2) + "px");
      b.style.setProperty("--ty", pr.top + pr.height / 2 - (br.top + br.height / 2) + "px");
      b.classList.add("to-pot");
    });
    if (any) { NC.audio.play("chip"); await sleep(PACE.collect); }
    S.players.forEach((p) => (p.bet = 0));
    a.querySelectorAll(".pk-bet").forEach((b) => b.classList.remove("to-pot"));
    renderSeats();
  }

  /** Part of a bet nobody else matched goes straight back to its owner. */
  function returnUncalled() {
    const sorted = S.players.map((p) => p.total).sort((x, y) => y - x);
    const top = S.players.find((p) => p.total === sorted[0]);
    const excess = sorted[0] - sorted[1];
    if (excess > 0 && top) {
      top.total -= excess;
      top.stack += excess;
      log(t("Mise non suivie rendue à {p} : {v}", { p: top.name, v: fmt(excess) }));
      if (top.human) NC.ui.toast(t("Mise non suivie rendue : {v}", { v: money(excess) }), "info");
      return { id: top.id, amount: excess };
    }
    return null;
  }

  async function endHand() {
    await collectBets();
    highlightTurn(-1);
    returnUncalled();
    renderSeats();
    const alive = inHand();
    const order = [1, 2, 3, 4].map((k) => (S.button + k) % 4);
    const pots = P.buildPots(S.players.map((p) => ({ id: p.id, contributed: p.total, folded: p.folded })));
    const scores = {};
    const evals = {};
    if (alive.length === 1) {
      scores[alive[0].id] = 1;
      await sleep(500);
    } else {
      // run out the board if needed (all-in before the river)
      if (S.board.length < 5) { S.area.querySelector("#pk-street").textContent = t("Tapis — on dévoile le tableau"); await sleep(700); }
      while (S.board.length < 5) {
        S.deck.pop();
        const c = S.deck.pop();
        S.board.push(c);
        S.area.querySelector("#pk-board").insertAdjacentHTML("beforeend", NC.ui.card(c));
        NC.audio.play("card");
        await sleep(PACE.reveal);
      }
      S.area.querySelector("#pk-street").textContent = t("Abattage");
      // reveal hands one after another
      for (const id of order) {
        const p = S.players[id];
        if (p.folded) continue;
        evals[p.id] = P.evaluate(p.hole.concat(S.board));
        scores[p.id] = evals[p.id].score;
        showCards(p.id, true);
        actionTag(p.id, handName(evals[p.id].name), "hand");
        NC.audio.play("card");
        await sleep(PACE.reveal);
      }
    }
    const won = P.distribute(pots, scores, order);
    await sleep(alive.length > 1 ? 600 : 200);
    let humanWon = 0;
    for (const id of Object.keys(won)) {
      const p = S.players[id];
      p.stack += won[id];
      S.area.querySelector("#pk-seat-" + id).classList.add("is-winner");
      log(evals[id] ? t("{p} remporte {v} ({h})", { p: p.name, v: fmt(won[id]), h: handName(evals[id].name) }) : t("{p} remporte {v}", { p: p.name, v: fmt(won[id]) }));
      if (p.human) humanWon = won[id];
      flyChips(id);
    }
    if (alive.length > 1) {
      const best = Object.keys(won).map((id) => evals[id]).filter(Boolean);
      const keys = new Set(best.flatMap((e) => e.best.map((c) => c.r + c.s)));
      S.area.querySelectorAll(".pk-board .pcard, .pk-seat__cards .pcard").forEach((el) => {
        const lab = el.getAttribute("aria-label");
        if (!lab) return;
        const c = lab.replace(/[♠♥♦♣]/, (m) => ({ "♠": "S", "♥": "H", "♦": "D", "♣": "C" }[m]));
        el.classList.toggle("is-best", keys.has(c));
      });
    }
    S.area.querySelector("#pk-pot strong").textContent = "0";
    renderSeats();
    const me = S.players[0];
    const net = humanWon - me.total; // real result of this hand for you
    const felt = S.area.querySelector(".pk-felt");
    if (net > 0) {
      const big = net > S.stake.bb * 20;
      NC.audio.play(big ? "bigwin" : "win");
      NC.ui.banner(felt, big ? "big" : "win", evals[0] ? handName(evals[0].name) : t("Pot remporté"), "+" + money(net), 2600);
      if (big) NC.fx.confetti(S.area.querySelector("#pk-seat-0"), 140);
    } else if (!me.folded && humanWon > 0) {
      NC.audio.play("push");
      NC.ui.banner(felt, "push", t("Pot partagé"), net === 0 ? t("Mise rendue") : "−" + money(-net), 2400);
    } else if (!me.folded) {
      NC.audio.play("lose");
      NC.ui.banner(felt, "lose", t("Main perdue"), (evals[0] ? handName(evals[0].name) + " · " : "") + "−" + money(me.total), 2400);
    }
    S.inHand = false;
    NC.wallet.setEscrow(ID, me.stack);
    if (me.stack <= 0) return busted();
    await sleep(500);
    const nb = S.area.querySelector('[data-pk="next"]');
    if (nb) { nb.hidden = false; nb.focus({ preventScroll: true }); }
  }

  function flyChips(id) {
    if (NC.settings.reducedFx()) return;
    const a = S.area;
    const from = a.querySelector("#pk-pot").getBoundingClientRect();
    const to = a.querySelector("#pk-seat-" + id + " .pk-seat__plate").getBoundingClientRect();
    for (let k = 0; k < 8; k++) {
      const c = document.createElement("i");
      c.className = "pk-fly";
      c.style.left = from.left + from.width / 2 + "px";
      c.style.top = from.top + from.height / 2 + "px";
      c.style.setProperty("--tx", to.left + to.width / 2 - (from.left + from.width / 2) + (Math.random() * 30 - 15) + "px");
      c.style.setProperty("--ty", to.top + to.height / 2 - (from.top + from.height / 2) + (Math.random() * 20 - 10) + "px");
      c.style.animationDelay = k * 70 + "ms";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 1500);
    }
    NC.audio.play("chip");
  }

  function busted() {
    NC.ui.toast(t("Vous n'avez plus de jetons à cette table"), "error");
    settleSession();
    const ctl = S.area.querySelector(".pk-side-btns");
    if (ctl) ctl.innerHTML = `<button class="btn btn--primary" data-pk="rebuy">${t("Recaver")}</button><button class="btn btn--ghost btn--sm" data-pk="leave">${t("Quitter")}</button>`;
  }
  function rebuy() {
    S.phase = "lobby";
    renderLobby();
  }

  function settleSession() {
    if (!S.round || S.round.settled) return null;
    const me = S.players[0];
    const back = me ? me.stack : 0;
    const net = S.round.settle(back);
    NC.wallet.setEscrow(ID, 0);
    return net;
  }

  async function leaveTable() {
    if (S.inHand && !S.players[0].folded) {
      const ok = await NC.ui.confirm(t("Quitter la table ?"), t("Votre main sera couchée : les jetons déjà misés dans ce coup sont perdus."), t("Quitter"), t("Rester"));
      if (!ok) return;
    }
    const back = S.players[0] ? S.players[0].stack : 0;
    const net = settleSession();
    S.inHand = false;
    S.waiting = null;
    if (net != null) NC.ui.toast(t("Table quittée : {v} récupérés ({n})", { v: money(back), n: (net >= 0 ? "+" : "−") + money(Math.abs(net)) }), net >= 0 ? "success" : "info");
    NC.app.closeGame(false, true).then(() => NC.app.openGame(ID));
    S.phase = "lobby";
  }

  function canLeave() {
    if (S.phase === "table" && S.inHand && S.players[0] && !S.players[0].folded) return t("Votre main en cours sera couchée (jetons déjà misés perdus). Votre tapis restant retourne dans votre portefeuille.");
    return null;
  }

  function leave() {
    if (S.phase === "table") {
      const back = S.players[0] ? S.players[0].stack : 0;
      const net = settleSession();
      if (net != null && S.round) NC.ui.toast(t("Poker : {v} retournés au portefeuille", { v: money(back) }), "info");
    }
    S.phase = "lobby";
    S.inHand = false;
    S.waiting = null;
  }

  function artSVG() {
    return `<svg viewBox="0 0 320 210"><defs><radialGradient id="pk-felt-g" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#1a1060"/><stop offset="1" stop-color="#07061a"/></radialGradient></defs>
      <ellipse cx="160" cy="120" rx="140" ry="72" fill="url(#pk-felt-g)" stroke="#b14cff" stroke-width="3"/>
      <ellipse cx="160" cy="120" rx="120" ry="56" fill="none" stroke="#00f0ff" stroke-width="1" stroke-dasharray="4 6" class="a-dash"/>
      <g class="art-float">${["A♠", "K♠", "Q♠", "J♠", "10♠"].map((c, i) => `<g transform="translate(${86 + i * 30} ${92 + (i % 2) * 4})"><rect width="28" height="40" rx="4" fill="#0b0a22" stroke="${i < 2 ? "#ff2bd6" : "#00f0ff"}" stroke-width="1.5"/><text x="14" y="25" text-anchor="middle" font-family="Unbounded" font-weight="800" font-size="10" fill="#fff">${c}</text></g>`).join("")}</g>
      ${[0, 1, 2].map((i) => `<g class="a-bob" style="animation-delay:${i * 0.4}s"><ellipse cx="${120 + i * 40}" cy="168" rx="14" ry="5" fill="${["#ff2bd6", "#00f0ff", "#ffc94d"][i]}"/><ellipse cx="${120 + i * 40}" cy="164" rx="14" ry="5" fill="${["#ff2bd6", "#00f0ff", "#ffc94d"][i]}" stroke="#fff" stroke-width="1" stroke-dasharray="3 3"/></g>`).join("")}</svg>`;
  }

  NC.registerGame({
    id: ID,
    title: "Texas Hold'em",
    tagline: t("No-Limit contre 3 IA aux styles bien différents."),
    category: "cards",
    badge: t("Multijoueur IA"),
    payout: t("Tapis adverses"),
    accent: "#b14cff",
    accent2: "#00f0ff",
    isNew: true,
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
    art: artSVG(),
    rules: () => NC.i18n.pick({
      fr: `<h4>Déroulement</h4><ul><li>Small blind et big blind obligatoires, bouton tournant.</li><li>2 cartes privées, puis flop (3), turn (1), river (1) avec un tour d'enchères à chaque étape.</li><li>Actions : se coucher, parole, suivre, miser/relancer (minimum = dernière relance), tapis.</li><li>Abattage : meilleure main de 5 cartes parmi 7. Pots partagés et pots annexes gérés automatiquement.</li><li>Une mise que personne ne peut suivre est rendue à son auteur (ce n'est pas un gain).</li></ul>
      <h4>Ordre des mains</h4><p>Quinte flush royale › Quinte flush › Carré › Full › Couleur › Quinte › Brelan › Double paire › Paire › Carte haute.</p>
      <h4>Adversaires</h4><ul><li><b>Viper</b> : serré-agressif, joue peu de mains mais les joue fort.</li><li><b>Bubbles</b> : suit beaucoup, relance rarement.</li><li><b>Blaze</b> : maniaque, relance et bluffe souvent.</li></ul>
      <p>Votre cave est prise dans le portefeuille ; le tapis restant y retourne quand vous quittez la table.</p>`,
      tr: `<h4>Oyun akışı</h4><ul><li>Küçük kör (SB) ve büyük kör (BB) zorunludur, krupiye düğmesi her elde döner.</li><li>2 kapalı kart, ardından flop (3), turn (1), river (1); her aşamada bir bahis turu.</li><li>Hamleler: çekil (pas), kontrol, gör, bahis/artır (en az son artış kadar), all-in.</li><li>Showdown: 7 karttan en iyi 5'li el kazanır. Bölünen ve yan potlar otomatik hesaplanır.</li><li>Kimsenin göremediği bir bahis sahibine iade edilir (bu bir kazanç değildir).</li></ul>
      <h4>El sıralaması</h4><p>Royal flush › Straight flush › Kare › Full house › Renk (flush) › Kent (straight) › Üçlü › İki çift › Tek çift › Yüksek kart.</p>
      <h4>Rakipler</h4><ul><li><b>Viper</b>: sıkı-agresif, az el oynar ama sert oynar.</li><li><b>Bubbles</b>: çok görür, nadiren artırır.</li><li><b>Blaze</b>: çılgın, sık artırır ve blöf yapar.</li></ul>
      <p>Masaya giriş parası cüzdanınızdan alınır; masadan kalktığınızda kalan fişleriniz cüzdana döner.</p>`,
    }),
    mount,
    leave,
    canLeave,
  });
})();
