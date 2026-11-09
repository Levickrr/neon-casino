/* =============================================================================
   OKEY 101 — 1 human + 3 AI, one round ("el") per stake.
   Rules engine: js/logic/okey-rules.js (unit-tested).

   Layout (classic Okey 101 table, neon style):
   - blue felt table with a grid where opened sets are laid,
   - opponents around the table (left / top / right),
   - discard piles in the four corners (each player discards to their right;
     you take from the bottom-left pile = your left neighbour),
   - draw pile + indicator ("gösterge") on the right,
   - your two-row wooden rack (2 × 15 slots) with sort buttons on the sides.
     Tiles can be dragged between slots, to the discard corner or onto a set.

   Turn: draw → (open / lay / add) → discard. First to empty the rack wins.
   Opening: sets worth ≥ 101 in one turn, or 5 pairs.
============================================================================= */
(function () {
  "use strict";
  const { money, escapeHtml } = NC.util;
  const t = NC.t;
  const O = NC.okey;
  const ID = "okey";
  const SEATS = [t("Vous"), "Selin", "Mert", "Deniz"]; // 0 bottom, 1 right, 2 top, 3 left
  const STAKES = [500, 2000, 10000, 50000];
  const WIN_MULT = 3.8; // 4 stakes in the pot, 5 % commission
  const ROW = 15; // rack slots per row
  const SLOTS = ROW * 2;
  const PCOL = ["#b6ff00", "#00f0ff", "#ff2bd6", "#ffc94d"]; // player colours
  // discard pile corner of each player (they discard to their right)
  const PILE_POS = ["br", "tr", "tl", "bl"];

  const S = {
    phase: "lobby", stake: 2000, round: null, ctx: null, indicator: null, deck: [],
    players: [], melds: [], turn: 0, turnNo: 0, dealer: 0, meldId: 0,
    slots: Array(SLOTS).fill(null), // tile ids on the rack
    h: null, // human turn state
    area: null, scope: null, busy: false, log: [], lastDiscardWild: false,
  };

  // ---------------------------------------------------------------------------
  // Tile rendering
  // ---------------------------------------------------------------------------
  const SUIT = ["♥", "◆", "♣", "♠"]; // small mark under the number (by colour)
  function tileHTML(tl, opts) {
    opts = opts || {};
    const wild = S.ctx && O.isWild(tl, S.ctx);
    const cls = ["otile"];
    cls.push(tl.fake ? "otile--fake" : "otile--" + O.COLORS[tl.c]);
    if (wild) cls.push("otile--wild");
    if (opts.cls) cls.push(opts.cls);
    if (opts.small) cls.push("otile--sm");
    const inner = tl.fake
      ? `<span class="otile__n">★</span><span class="otile__s">${t("joker")}</span>`
      : `<span class="otile__n">${tl.n}</span><span class="otile__m">${SUIT[tl.c]}</span>${wild ? '<span class="otile__ok">OKEY</span>' : ""}`;
    return `<div class="${cls.join(" ")}" data-tid="${tl.id}" title="${escapeHtml(O.tileLabel(tl, S.ctx))}">${inner}</div>`;
  }

  // ---------------------------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------------------------
  function mount(area, scope) {
    S.area = area;
    S.scope = scope;
    S.phase = "lobby";
    S.busy = false;
    scope.on(area, "click", (e) => (S.phase === "lobby" ? lobbyClick(e) : tableClick(e)));
    bindDrag();
    renderLobby();
  }

  function renderLobby() {
    S.area.innerHTML = `
      <div class="ok-lobby">
        <div class="ok-lobby__art">${artSVG()}</div>
        <div class="ok-lobby__panel glass">
          <h3>Okey 101</h3>
          <p class="muted">${t("Une manche à quatre joueurs contre Selin, Mert et Deniz. Ouvrez avec 101 points ou 5 paires, videz votre chevalet le premier.")}</p>
          <span class="lbl">${t("Mise de la manche")}</span>
          <div class="seg seg--block" id="ok-stakes">${STAKES.map((s) => `<button data-stake="${s}" class="${s === S.stake ? "is-active" : ""}">${s >= 1000 ? s / 1000 + "k" : s}</button>`).join("")}</div>
          <div class="g-info">
            <div><span class="lbl">${t("Victoire")}</span><strong>${t("{m}× la mise", { m: WIN_MULT })}</strong></div>
            <div><span class="lbl">${t("Gain potentiel")}</span><strong id="ok-pot">${money(Math.floor(S.stake * WIN_MULT))}</strong></div>
          </div>
          <button class="btn btn--primary btn--lg btn--block btn--uv" data-act="start">${t("Distribuer les tuiles")}</button>
          <p class="muted small">${t("Gagnant : le joueur qui termine, ou le score le plus bas si la pioche s'épuise. Les règles complètes sont dans le bouton « ? ».")}</p>
        </div>
      </div>`;
  }
  function lobbyClick(e) {
    const st = e.target.closest("[data-stake]");
    if (st) {
      S.stake = +st.dataset.stake;
      S.area.querySelectorAll("[data-stake]").forEach((b) => b.classList.toggle("is-active", b === st));
      S.area.querySelector("#ok-pot").textContent = money(Math.floor(S.stake * WIN_MULT));
      return NC.audio.play("click");
    }
    if (e.target.closest('[data-act="start"]')) startRound();
  }

  // ---------------------------------------------------------------------------
  // Round setup
  // ---------------------------------------------------------------------------
  function startRound() {
    if (S.stake > NC.wallet.balance) return NC.ui.toast(t("Solde insuffisant pour cette mise"), "error");
    const round = NC.startRound(ID, S.stake);
    if (!round) return;
    S.round = round;
    S.dealer = NC.util.randInt(4);
    const d = O.deal(S.dealer);
    S.ctx = { okey: d.okey };
    S.indicator = d.indicator;
    S.deck = d.deck;
    S.players = SEATS.map((name, i) => ({ name, human: i === 0, hand: d.hands[i], opened: false, openedTurn: -1, penalty: 0, discards: [] }));
    S.melds = [];
    S.turn = S.dealer;
    S.turnNo = 0;
    S.log = [];
    S.slots = Array(SLOTS).fill(null);
    S.phase = "play";
    S.h = null;
    arrange("series");
    renderTable();
    log(t("{p} distribue et commence avec 22 tuiles. Okey : {o}.", { p: S.players[S.dealer].name, o: O.tileLabel({ c: S.ctx.okey.c, n: S.ctx.okey.n, fake: false }) }));
    NC.audio.play("tile");
    S.scope.timeout(() => beginTurn(), 900);
  }

  // ---------------------------------------------------------------------------
  // Rack (2 × 15 slots)
  // ---------------------------------------------------------------------------
  const me = () => S.players[0];
  const byId = (id) => me().hand.find((x) => x.id === id);

  /** Keeps rack slots consistent with the hand (new tiles go to a free slot on the right). */
  function syncRack() {
    const ids = new Set(me().hand.map((x) => x.id));
    for (let i = 0; i < SLOTS; i++) if (S.slots[i] != null && !ids.has(S.slots[i])) S.slots[i] = null;
    const placed = new Set(S.slots.filter((x) => x != null));
    for (const tl of me().hand) {
      if (placed.has(tl.id)) continue;
      let last = -1;
      S.slots.forEach((x, i) => { if (x != null) last = i; });
      let pos = S.slots.findIndex((x, i) => x == null && i > last);
      if (pos < 0) pos = S.slots.findIndex((x) => x == null);
      S.slots[pos] = tl.id;
    }
  }

  /** Places groups of tiles on the rack, separated by a gap, without splitting a group across rows. */
  function layout(groups, rest) {
    S.slots = Array(SLOTS).fill(null);
    let pos = 0;
    const put = (arr) => {
      if (!arr.length) return;
      const rowEnd = pos < ROW ? ROW : SLOTS;
      if (pos + arr.length > rowEnd && pos < ROW && arr.length <= ROW) pos = ROW; // jump to row 2
      for (const tl of arr) {
        while (pos < SLOTS && S.slots[pos] != null) pos++;
        if (pos >= SLOTS) pos = S.slots.findIndex((x) => x == null);
        S.slots[pos++] = tl.id;
      }
      if (pos !== ROW) pos++; // gap
    };
    groups.forEach(put);
    rest.forEach((tl) => put([tl]));
    // compact singles if we ran out of room
    syncRack();
  }
  function faceKey(tl, mode) {
    if (O.isWild(tl, S.ctx)) return [9, 99];
    const f = O.face(tl, S.ctx);
    return mode === "groups" ? [f.n, f.c] : [f.c, f.n];
  }
  function arrange(mode) {
    const hand = me().hand.slice();
    let groups = [];
    if (mode === "pairs") {
      groups = O.findPairs(hand, S.ctx);
    } else {
      groups = O.bestMelds(hand, S.ctx, "tiles", 25000).melds.map((m) => {
        const a = O.analyzeMeld(m, S.ctx);
        return a ? a.tiles.map((x) => x.t) : m;
      });
    }
    const used = new Set(groups.flat().map((x) => x.id));
    const rest = hand.filter((x) => !used.has(x.id)).sort((a, b) => {
      const ka = faceKey(a, mode === "groups" ? "groups" : "series");
      const kb = faceKey(b, mode === "groups" ? "groups" : "series");
      return ka[0] - kb[0] || ka[1] - kb[1];
    });
    // keep the singles of a colour next to each other
    const restGroups = [];
    rest.forEach((tl) => {
      const g = restGroups[restGroups.length - 1];
      const k = faceKey(tl, "series")[0];
      if (g && g.k === k && mode !== "groups") g.items.push(tl);
      else restGroups.push({ k, items: [tl] });
    });
    layout(groups.concat(restGroups.map((g) => g.items)), []);
  }

  // ---------------------------------------------------------------------------
  // Table rendering
  // ---------------------------------------------------------------------------
  function plate(i) {
    const p = S.players[i];
    return `<div class="ok-plate ok-plate--${i}" id="ok-plate-${i}" style="--pc:${PCOL[i]}">
      <div class="ok-plate__av">${escapeHtml(p.name[0])}</div>
      <div class="ok-plate__info"><b>${escapeHtml(p.name)}</b><span class="ok-plate__count"></span></div>
      <span class="ok-plate__badge"></span>
      <span class="ok-plate__think"><i></i><i></i><i></i></span>
    </div>`;
  }

  function renderTable() {
    const a = S.area;
    a.innerHTML = `
      <div class="ok">
        <div class="ok-table" id="ok-table">
          <div class="ok-felt">
            <div class="ok-board" id="ok-melds" data-drop="board"></div>
          </div>
          ${plate(2)}${plate(3)}${plate(1)}
          ${PILE_POS.map((pos, i) => `<div class="ok-pile ok-pile--${pos}${i === 0 ? " ok-dropzone" : ""}" id="ok-dis-${i}" ${i === 0 ? 'data-drop="discard"' : ""} ${i === 3 ? 'data-ok="take"' : ""} style="--pc:${PCOL[i]}"><span class="ok-pile__lbl">${i === 0 ? t("Jeter ici") : i === 3 ? t("Prendre") : ""}</span></div>`).join("")}
          <div class="ok-side">
            <button class="ok-deck" data-ok="deck" id="ok-deck" title="${t("Piocher une tuile")}">
              <span class="ok-deck__stack"><i></i><i></i><i></i></span>
              <span class="ok-deck__lbl">${t("Pioche")}</span>
              <strong class="ok-deck__n num"></strong>
            </button>
            <div class="ok-ind">
              <span class="lbl">${t("Indicateur")}</span>
              ${tileHTML(S.indicator, { small: true })}
              <span class="lbl">Okey</span>
              ${tileHTML({ id: -9, c: S.ctx.okey.c, n: S.ctx.okey.n, fake: false }, { small: true })}
            </div>
          </div>
          <div class="ok-msg" id="ok-msg"></div>
        </div>
        <div class="ok-staged" id="ok-staged" hidden></div>
        <div class="ok-me">
          ${plate(0)}
          <div class="ok-score" id="ok-score"></div>
        </div>
        <div class="ok-rackbar">
          <div class="ok-sortcol">
            <button class="ok-sortbtn" data-ok="sort-series" title="${t("Trier en séries")}"><b>123</b><span>${t("Séries")}</span></button>
            <button class="ok-sortbtn" data-ok="sort-groups" title="${t("Trier en groupes")}"><b>777</b><span>${t("Groupes")}</span></button>
          </div>
          <div class="ok-rack" id="ok-rack">
            ${Array.from({ length: SLOTS }, (_, i) => `<div class="ok-slot" data-slot="${i}"></div>`).join("")}
          </div>
          <div class="ok-sortcol">
            <button class="ok-sortbtn" data-ok="sort-pairs" title="${t("Trier en paires")}"><b>77</b><span>${t("Paires")}</span></button>
            <button class="ok-sortbtn" data-ok="hint" title="${t("Suggestion")}"><b>?</b><span>${t("Aide")}</span></button>
          </div>
        </div>
        <div class="ok-controls">
          <button class="btn btn--ghost btn--sm" data-ok="stage">${t("Former")}</button>
          <button class="btn btn--ghost btn--sm" data-ok="unstage">${t("Reprendre")}</button>
          <button class="btn btn--primary btn--sm btn--green" data-ok="open">${t("Ouvrir")}</button>
          <button class="btn btn--primary btn--sm" data-ok="lay">${t("Poser")}</button>
          <button class="btn btn--ghost btn--sm" data-ok="giveback">${t("Rendre la tuile")}</button>
          <button class="btn btn--primary btn--sm btn--pink" data-ok="discard">${t("Jeter")}</button>
        </div>
        <div class="ok-log" id="ok-log"></div>
      </div>`;
    render();
  }

  function render() {
    const a = S.area;
    if (!a.isConnected || S.phase === "lobby") return;
    syncRack();
    const h = S.h;
    const myTurn = S.phase === "play" && S.turn === 0 && h;
    // plates
    [0, 1, 2, 3].forEach((i) => {
      const p = S.players[i];
      const el = a.querySelector("#ok-plate-" + i);
      if (!el) return;
      el.querySelector(".ok-plate__count").textContent = t("{n} tuiles", { n: p.hand.length });
      el.querySelector(".ok-plate__badge").textContent = p.opened ? (p.opened === "pairs" ? t("Ouvert · paires") : t("Ouvert")) : "";
      el.classList.toggle("is-turn", S.turn === i && S.phase === "play");
      el.classList.toggle("is-opened", !!p.opened);
    });
    // deck
    const deck = a.querySelector("#ok-deck");
    deck.querySelector(".ok-deck__n").textContent = S.deck.length;
    deck.classList.toggle("is-empty", !S.deck.length);
    deck.classList.toggle("is-takeable", !!(myTurn && !h.drawn && S.deck.length));
    // discard piles (show the last 3, fanned)
    [0, 1, 2, 3].forEach((i) => {
      const el = a.querySelector("#ok-dis-" + i);
      const pile = S.players[i].discards;
      const lbl = el.querySelector(".ok-pile__lbl");
      el.querySelectorAll(".otile").forEach((x) => x.remove());
      pile.slice(-3).forEach((tl, k, arr) => el.insertAdjacentHTML("beforeend", tileHTML(tl, { cls: "ok-pile__tile" + (k === arr.length - 1 ? " is-top" : "") })));
      if (lbl) lbl.hidden = pile.length > 0;
    });
    a.querySelector("#ok-dis-3").classList.toggle("is-takeable", !!(myTurn && !h.drawn && S.players[3].discards.length));
    // melds on the board (grouped per player)
    const board = a.querySelector("#ok-melds");
    board.innerHTML = S.melds.length
      ? S.melds.map((m) => `<div class="ok-meld ok-meld--${m.type}" data-meld="${m.id}" data-drop="meld" style="--pc:${PCOL[m.owner]}" title="${escapeHtml(S.players[m.owner].name)}">${m.tiles.map((x) => tileHTML(x.t, { small: true, cls: x.wild ? "is-joker" : "" })).join("")}</div>`).join("")
      : `<div class="ok-board__empty">${t("Les combinaisons posées apparaîtront ici")}</div>`;
    // staged opening
    const st = a.querySelector("#ok-staged");
    if (h && h.staged.length) {
      st.hidden = false;
      const val = stagedValue();
      st.innerHTML = `<span class="lbl">${t("Préparation de l'ouverture")}</span>${h.staged.map((m, i) => `<div class="ok-meld ok-meld--staged" data-staged="${i}">${m.tiles.map((x) => tileHTML(x.t, { small: true })).join("")}<b>${m.type === "pair" ? t("paire") : m.value}</b></div>`).join("")}
        <strong class="ok-staged__total ${val.ok ? "is-ok" : ""}">${val.pairs ? t("{n} / {m} paires", { n: val.count, m: O.OPEN_PAIRS }) : t("{n} / {m} pts", { n: val.points, m: O.OPEN_POINTS })}</strong>`;
    } else st.hidden = true;
    // rack
    const sel = h ? h.selected : new Set();
    const must = h && h.tookDiscard && !h.usedDiscard ? h.tookDiscard.id : -1;
    a.querySelectorAll(".ok-slot").forEach((slot, i) => {
      const id = S.slots[i];
      const tl = id != null ? byId(id) : null;
      slot.innerHTML = tl ? tileHTML(tl, { cls: (sel.has(tl.id) ? "is-sel " : "") + (tl.id === must ? "is-must " : "") + (h && tl.id === h.justDrawn ? "is-new" : "") }) : "";
    });
    // controls
    const q = (k) => a.querySelector(`[data-ok="${k}"]`);
    const canPlay = myTurn && h.drawn && !S.busy;
    const nSel = sel.size;
    const M = me();
    q("stage").disabled = !(canPlay && !M.opened && nSel >= 2);
    q("unstage").disabled = !(canPlay && h.staged.length);
    q("open").disabled = !(canPlay && !M.opened && stagedValue().ok);
    q("lay").disabled = !(canPlay && M.opened && M.openedTurn !== S.turnNo && nSel >= 2);
    q("discard").disabled = !(canPlay && nSel === 1);
    q("giveback").hidden = !(myTurn && h.tookDiscard && !h.usedDiscard && !h.tableActs);
    q("hint").disabled = !(myTurn && h.drawn);
    a.querySelector("#ok-score").innerHTML = `<span class="lbl">${t("Statut")}</span> <b>${M.opened ? (M.opened === "pairs" ? t("Ouvert (paires)") : t("Ouvert")) : t("Pas encore ouvert")}</b>${M.penalty ? ` · <span class="neon-red">${t("pénalité +{v}", { v: M.penalty })}</span>` : ""}`;
    a.querySelectorAll("[data-ok^='sort']").forEach((b) => (b.disabled = S.phase !== "play"));
  }

  function msg(text, cls) {
    const el = S.area.querySelector("#ok-msg");
    if (el) { el.textContent = text; el.className = "ok-msg" + (cls ? " ok-msg--" + cls : ""); }
  }
  function log(text) {
    S.log.push(text);
    const el = S.area.querySelector("#ok-log");
    if (el) el.innerHTML = S.log.slice(-5).map((x) => `<div>${escapeHtml(x)}</div>`).join("");
  }
  function thinking(i, on) {
    const el = S.area.querySelector("#ok-plate-" + i);
    if (el) el.classList.toggle("is-thinking", on);
  }

  // ---------------------------------------------------------------------------
  // Turn flow
  // ---------------------------------------------------------------------------
  const sleep = (ms) => S.scope.sleep(NC.util.dur(ms));

  function beginTurn() {
    if (S.phase !== "play") return;
    S.turnNo++;
    const p = S.players[S.turn];
    const isFirst = S.turnNo === 1; // dealer starts with 22 tiles: no draw
    if (p.human) {
      S.h = { drawn: isFirst, tookDiscard: null, usedDiscard: false, staged: [], selected: new Set(), tableActs: 0, justDrawn: -1 };
      msg(isFirst ? t("Vous commencez : 22 tuiles, jetez une tuile (vous pouvez ouvrir avant).") : t("À vous : piochez au centre ou prenez la tuile de Deniz (en bas à gauche)."), "turn");
      render();
    } else {
      S.h = null;
      render();
      aiTurn(S.turn, isFirst);
    }
  }

  function endTurn() {
    const p = S.players[S.turn];
    if (!p.hand.length) return endRound(S.turn);
    if (!S.deck.length) return endRound(-1);
    S.turn = (S.turn + 1) % 4;
    S.h = null;
    S.scope.timeout(beginTurn, NC.util.dur(350));
  }

  // ---------------------------------------------------------------------------
  // Human actions
  // ---------------------------------------------------------------------------
  function tableClick(e) {
    if (S.phase === "end") {
      const b = e.target.closest("[data-ok]");
      if (b && b.dataset.ok === "again") { S.phase = "lobby"; renderLobby(); }
      return;
    }
    const tile = e.target.closest(".ok-rack .otile");
    if (tile && !dragState.moved) return toggleSel(+tile.dataset.tid);
    const meld = e.target.closest("[data-meld]");
    if (meld) return tryAttach(+meld.dataset.meld);
    const b = e.target.closest("[data-ok]");
    if (!b || b.disabled) return;
    const k = b.dataset.ok;
    NC.audio.play("click");
    if (k.startsWith("sort-")) { arrange(k.slice(5)); return render(); }
    if (k === "deck") return humanDraw("deck");
    if (k === "take") return humanDraw("discard");
    if (k === "stage") return stage();
    if (k === "unstage") return unstage();
    if (k === "open") return openHand();
    if (k === "lay") return lay();
    if (k === "discard") return humanDiscard([...S.h.selected][0]);
    if (k === "giveback") return giveBack();
    if (k === "hint") return hint();
  }

  function toggleSel(id) {
    const h = S.h;
    if (!h || S.turn !== 0) return;
    if (h.selected.has(id)) h.selected.delete(id);
    else h.selected.add(id);
    NC.audio.play("tile");
    render();
  }

  function humanDraw(src) {
    const h = S.h;
    if (!h || h.drawn || S.turn !== 0 || S.busy) return;
    const M = me();
    let tl;
    if (src === "deck") {
      if (!S.deck.length) return NC.ui.toast(t("La pioche est vide"), "error");
      tl = S.deck.pop();
      log(t("Vous piochez une tuile."));
    } else {
      const pile = S.players[3].discards;
      if (!pile.length) return;
      tl = pile.pop();
      h.tookDiscard = tl;
      log(t("Vous prenez {x} jeté par Deniz.", { x: O.tileLabel(tl, S.ctx) }));
      msg(M.opened ? t("Vous devez utiliser cette tuile ce tour-ci.") : t("Vous devez ouvrir ce tour-ci en utilisant cette tuile (ou la rendre)."), "warn");
    }
    M.hand.push(tl);
    h.drawn = true;
    h.justDrawn = tl.id;
    NC.audio.play("tile");
    if (src === "deck") msg(M.opened ? t("Posez ou ajoutez des tuiles, puis jetez-en une.") : t("Formez des combinaisons pour ouvrir (101 pts ou 5 paires), puis jetez une tuile."), "turn");
    render();
  }

  function giveBack() {
    const h = S.h;
    if (!h || !h.tookDiscard || h.usedDiscard || h.tableActs) return;
    unstage(true);
    const M = me();
    M.hand = M.hand.filter((x) => x.id !== h.tookDiscard.id);
    S.players[3].discards.push(h.tookDiscard);
    h.tookDiscard = null;
    h.drawn = false;
    h.selected.clear();
    msg(t("Tuile rendue. Piochez au centre."), "turn");
    render();
  }

  function selectedTiles() { return me().hand.filter((x) => S.h.selected.has(x.id)); }

  function stage() {
    const M = me();
    const tiles = selectedTiles();
    const m = tiles.length === 2 ? O.analyzePair(tiles, S.ctx) : O.analyzeMeld(tiles, S.ctx);
    if (!m) return NC.ui.toast(tiles.length === 2 ? t("Ce n'est pas une paire identique") : t("Combinaison invalide (suite de même couleur ou groupe de couleurs différentes)"), "error");
    const types = new Set(S.h.staged.map((x) => (x.type === "pair" ? "pair" : "set")));
    const myType = m.type === "pair" ? "pair" : "set";
    if (types.size && !types.has(myType)) return NC.ui.toast(t("On ouvre soit avec des séries (101 pts), soit avec des paires — pas les deux"), "error");
    S.h.staged.push(m);
    M.hand = M.hand.filter((x) => !S.h.selected.has(x.id));
    S.h.selected.clear();
    NC.audio.play("tile");
    render();
  }

  function unstage(silent) {
    const h = S.h;
    if (!h || !h.staged.length) return;
    const M = me();
    h.staged.forEach((m) => m.tiles.forEach((x) => M.hand.push(x.t)));
    h.staged = [];
    if (!silent) NC.audio.play("tile");
    render();
  }

  function stagedValue() {
    const h = S.h;
    if (!h || !h.staged.length) return { ok: false, points: 0, pairs: false, count: 0 };
    const pairs = h.staged[0].type === "pair";
    if (pairs) return { ok: h.staged.length >= O.OPEN_PAIRS, pairs: true, count: h.staged.length };
    const points = h.staged.reduce((s, m) => s + m.value, 0);
    return { ok: points >= O.OPEN_POINTS, pairs: false, points };
  }

  function openHand() {
    const h = S.h;
    const M = me();
    const v = stagedValue();
    if (!v.ok) return NC.ui.toast(v.pairs ? t("Il faut au moins 5 paires") : t("Il faut au moins {n} points", { n: O.OPEN_POINTS }), "error");
    if (h.tookDiscard && !h.staged.some((m) => m.tiles.some((x) => x.t.id === h.tookDiscard.id))) return NC.ui.toast(t("La tuile prise doit faire partie de l'ouverture"), "error");
    if (M.hand.length < 1) return NC.ui.toast(t("Gardez au moins une tuile à jeter"), "error");
    h.staged.forEach((m) => S.melds.push(Object.assign(m, { id: ++S.meldId, owner: 0 })));
    if (h.tookDiscard) h.usedDiscard = true;
    M.opened = v.pairs ? "pairs" : "series";
    M.openedTurn = S.turnNo;
    h.staged = [];
    h.tableActs++;
    log(v.pairs ? t("Vous ouvrez avec {n} paires !", { n: v.count }) : t("Vous ouvrez avec {n} points !", { n: v.points }));
    NC.audio.play("win");
    NC.fx.sparks(S.area.querySelector("#ok-melds"), "#b6ff00", 40);
    msg(t("Ouverture réussie ! Jetez une tuile pour finir votre tour."), "ok");
    render();
  }

  function lay() {
    const M = me();
    if (!M.opened || M.openedTurn === S.turnNo) return;
    const tiles = selectedTiles();
    const m = M.opened === "pairs" ? O.analyzePair(tiles, S.ctx) : O.analyzeMeld(tiles, S.ctx);
    if (!m) return NC.ui.toast(M.opened === "pairs" ? t("Ouvert en paires : vous ne pouvez poser que des paires") : t("Combinaison invalide"), "error");
    if (M.hand.length - tiles.length < 1) return NC.ui.toast(t("Gardez au moins une tuile à jeter"), "error");
    m.id = ++S.meldId;
    m.owner = 0;
    S.melds.push(m);
    M.hand = M.hand.filter((x) => !S.h.selected.has(x.id));
    markUsed(tiles);
    S.h.selected.clear();
    S.h.tableActs++;
    NC.audio.play("tile");
    log(t("Vous posez une combinaison."));
    render();
  }

  function markUsed(tiles) {
    const h = S.h;
    if (h && h.tookDiscard && tiles.some((x) => x.id === h.tookDiscard.id)) h.usedDiscard = true;
  }

  function tryAttach(meldId, tileId) {
    const h = S.h;
    const M = me();
    if (!h || S.turn !== 0 || !h.drawn || S.busy) return;
    if (!M.opened) return NC.ui.toast(t("Ouvrez d'abord votre main pour ajouter aux combinaisons"), "error");
    if (M.openedTurn === S.turnNo) return NC.ui.toast(t("Vous pourrez ajouter des tuiles au prochain tour"), "info");
    const ids = tileId != null ? [tileId] : [...h.selected];
    if (ids.length !== 1) return NC.ui.toast(t("Sélectionnez une seule tuile à ajouter"), "info");
    if (M.hand.length <= 1) return NC.ui.toast(t("Gardez au moins une tuile à jeter"), "error");
    const tl = byId(ids[0]);
    const m = S.melds.find((x) => x.id === meldId);
    if (!tl || !m) return;
    const freed = O.swapJoker(m, tl, S.ctx);
    if (freed) {
      M.hand = M.hand.filter((x) => x.id !== tl.id);
      M.hand.push(freed);
      log(t("Vous récupérez l'okey en le remplaçant !"));
      NC.fx.sparks(S.area.querySelector(`[data-meld="${meldId}"]`), "#ffc94d", 30);
    } else if (O.attach(m, tl, S.ctx)) {
      M.hand = M.hand.filter((x) => x.id !== tl.id);
      log(t("Vous ajoutez {x}.", { x: O.tileLabel(tl, S.ctx) }));
    } else return NC.ui.toast(t("Cette tuile ne s'ajoute pas à cette combinaison"), "error");
    markUsed([tl]);
    h.selected.delete(tl.id);
    h.tableActs++;
    NC.audio.play("tile");
    render();
  }

  async function humanDiscard(tileId) {
    const h = S.h;
    const M = me();
    if (!h || S.turn !== 0 || S.busy) return;
    if (!h.drawn) return NC.ui.toast(t("Piochez d'abord une tuile"), "error");
    const tl = byId(tileId);
    if (!tl) return;
    if (h.tookDiscard && !h.usedDiscard) {
      if (h.tookDiscard.id === tl.id) return NC.ui.toast(t("Vous ne pouvez pas rejeter la tuile prise"), "error");
      return NC.ui.toast(M.opened ? t("Utilisez d'abord la tuile prise (ou rendez-la)") : t("Ouvrez avec la tuile prise, ou rendez-la"), "error");
    }
    if (h.staged.length) { unstage(true); NC.ui.toast(t("Combinaisons non ouvertes remises sur le chevalet"), "info"); }
    if (S.melds.length && O.isPlayable(tl, S.melds, S.ctx) && M.hand.length > 1) {
      S.busy = true;
      const ok = await NC.ui.confirm(t("Pénalité +101"), t("Cette tuile peut s'ajouter à une combinaison posée. La jeter coûte 101 points de pénalité."), t("Jeter quand même"), t("Annuler"));
      S.busy = false;
      if (!ok) return;
      M.penalty += 101;
      log(t("Pénalité de 101 points (tuile jouable jetée)."));
    }
    M.hand = M.hand.filter((x) => x.id !== tl.id);
    M.discards.push(tl);
    S.lastDiscardWild = O.isWild(tl, S.ctx);
    NC.audio.play("tile");
    h.selected.clear();
    log(t("Vous jetez {x}.", { x: O.tileLabel(tl, S.ctx) }));
    render();
    endTurn();
  }

  function hint() {
    const M = me();
    if (!M.opened) {
      const r = O.bestMelds(M.hand, S.ctx, "points");
      const pairs = O.findPairs(M.hand, S.ctx).length;
      if (r.value >= O.OPEN_POINTS) {
        S.h.selected = new Set(r.melds.flat().map((x) => x.id));
        NC.ui.toast(t("Ouverture possible : {v} points ({n} combinaisons sélectionnées — formez-les une par une)", { v: r.value, n: r.melds.length }), "success");
      } else if (pairs >= O.OPEN_PAIRS) {
        NC.ui.toast(t("Ouverture en paires possible : {n} paires", { n: pairs }), "success");
      } else NC.ui.toast(t("Meilleure ouverture actuelle : {v} pts · {n} paires", { v: r.value, n: pairs }), "info");
    } else {
      const r = O.bestMelds(M.hand, S.ctx, "tiles");
      const att = M.hand.filter((x) => O.isPlayable(x, S.melds, S.ctx)).length;
      NC.ui.toast(t("{a} tuile(s) posables en combinaisons · {b} tuile(s) ajoutables", { a: r.tiles, b: att }), "info");
    }
    render();
  }

  // ---------------------------------------------------------------------------
  // Drag & drop (pointer events: mouse + touch)
  // ---------------------------------------------------------------------------
  const dragState = { id: null, ghost: null, sx: 0, sy: 0, moved: false };
  function bindDrag() {
    const a = S.area;
    S.scope.on(a, "pointerdown", (e) => {
      const tile = e.target.closest(".ok-rack .otile");
      if (!tile || e.button > 0 || S.phase !== "play") return;
      dragState.id = +tile.dataset.tid;
      dragState.sx = e.clientX;
      dragState.sy = e.clientY;
      dragState.moved = false;
      dragState.src = tile;
    });
    S.scope.on(window, "pointermove", (e) => {
      if (dragState.id == null) return;
      const dx = e.clientX - dragState.sx, dy = e.clientY - dragState.sy;
      if (!dragState.moved && Math.hypot(dx, dy) < 8) return;
      if (!dragState.moved) {
        dragState.moved = true;
        const g = dragState.src.cloneNode(true);
        g.classList.add("otile--ghost");
        g.classList.remove("is-sel");
        document.body.appendChild(g);
        dragState.ghost = g;
        dragState.src.classList.add("is-dragging");
      }
      e.preventDefault();
      dragState.ghost.style.left = e.clientX + "px";
      dragState.ghost.style.top = e.clientY + "px";
      const over = document.elementFromPoint(e.clientX, e.clientY);
      a.querySelectorAll(".is-drop").forEach((x) => x.classList.remove("is-drop"));
      const z = over && (over.closest("[data-drop='discard'],[data-drop='meld']") || over.closest(".ok-slot"));
      if (z) z.classList.add("is-drop");
    }, { passive: false });
    S.scope.on(window, "pointerup", (e) => {
      if (dragState.id == null) return;
      const id = dragState.id;
      const moved = dragState.moved;
      dragState.id = null;
      if (dragState.ghost) dragState.ghost.remove();
      dragState.ghost = null;
      a.querySelectorAll(".is-drop,.is-dragging").forEach((x) => x.classList.remove("is-drop", "is-dragging"));
      if (!moved) return;
      setTimeout(() => (dragState.moved = false), 0);
      const over = document.elementFromPoint(e.clientX, e.clientY);
      if (!over) return;
      const slot = over.closest(".ok-slot");
      const drop = over.closest("[data-drop]");
      if (slot) return moveToSlot(id, +slot.dataset.slot);
      if (drop && drop.dataset.drop === "discard") return humanDiscard(id);
      if (drop && drop.dataset.drop === "meld") return tryAttach(+drop.dataset.meld, id);
    });
  }
  /** Moves a tile to a rack slot (swap if occupied). Allowed at any time during the round. */
  function moveToSlot(id, target) {
    const from = S.slots.indexOf(id);
    if (from < 0 || from === target) return;
    const other = S.slots[target];
    S.slots[target] = id;
    S.slots[from] = other;
    NC.audio.play("tile");
    render();
  }

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------
  async function aiTurn(i, isFirst) {
    const p = S.players[i];
    msg(t("{p} réfléchit…", { p: p.name }));
    thinking(i, true);
    await sleep(900 + NC.util.randInt(700));
    let took = null;
    if (!isFirst) {
      const prev = S.players[(i + 3) % 4];
      const d = prev.discards[prev.discards.length - 1];
      if (d && aiWantsDiscard(p, d)) {
        took = prev.discards.pop();
        p.hand.push(took);
        log(t("{p} prend {x}.", { p: p.name, x: O.tileLabel(took, S.ctx) }));
      } else {
        if (!S.deck.length) { thinking(i, false); return endRound(-1); }
        p.hand.push(S.deck.pop());
        log(t("{p} pioche.", { p: p.name }));
      }
      NC.audio.play("tile");
      render();
      await sleep(600);
    }
    if (!p.opened) {
      const r = O.bestMelds(p.hand, S.ctx, "points");
      const usesTook = !took || r.melds.some((m) => m.some((x) => x.id === took.id));
      if (r.value >= O.OPEN_POINTS && usesTook && r.tiles < p.hand.length) {
        layMelds(i, r.melds);
        p.opened = "series";
        p.openedTurn = S.turnNo;
        log(t("{p} ouvre avec {n} points !", { p: p.name, n: r.value }));
        NC.audio.play("chip");
        render();
        await sleep(800);
      } else {
        const pairs = O.findPairs(p.hand, S.ctx);
        const usesTookP = !took || pairs.some((m) => m.some((x) => x.id === took.id));
        if (pairs.length >= O.OPEN_PAIRS && usesTookP && pairs.length * 2 < p.hand.length && r.value < 70) {
          layMelds(i, pairs, true);
          p.opened = "pairs";
          p.openedTurn = S.turnNo;
          log(t("{p} ouvre avec {n} paires !", { p: p.name, n: pairs.length }));
          render();
          await sleep(800);
        }
      }
    } else if (p.openedTurn !== S.turnNo) {
      if (p.opened === "series") {
        const r = O.bestMelds(p.hand, S.ctx, "tiles");
        let melds = r.melds;
        while (melds.length && melds.reduce((s, m) => s + m.length, 0) >= p.hand.length) melds = melds.slice(0, -1);
        if (melds.length) { layMelds(i, melds); log(t("{p} pose {n} combinaison(s).", { p: p.name, n: melds.length })); render(); await sleep(600); }
      } else {
        const pairs = O.findPairs(p.hand, S.ctx).filter((m) => !m.some((x) => O.isWild(x, S.ctx)));
        let use = pairs;
        while (use.length && use.length * 2 >= p.hand.length) use = use.slice(0, -1);
        if (use.length) { layMelds(i, use, true); render(); await sleep(500); }
      }
      let changed = true;
      let guard = 0;
      while (changed && guard++ < 30 && p.hand.length > 1) {
        changed = false;
        for (const tl of p.hand.slice()) {
          if (p.hand.length <= 1) break;
          for (const m of S.melds) {
            const freed = O.swapJoker(m, tl, S.ctx);
            if (freed) { p.hand = p.hand.filter((x) => x.id !== tl.id); p.hand.push(freed); changed = true; log(t("{p} récupère un okey !", { p: p.name })); break; }
            if (!O.isWild(tl, S.ctx) && O.attach(m, tl, S.ctx)) { p.hand = p.hand.filter((x) => x.id !== tl.id); changed = true; break; }
          }
        }
        if (changed) { NC.audio.play("tile"); render(); await sleep(450); }
      }
    }
    if (took && !p.opened) {
      p.hand = p.hand.filter((x) => x.id !== took.id);
      S.players[(i + 3) % 4].discards.push(took);
      if (S.deck.length) p.hand.push(S.deck.pop());
    }
    const d = chooseDiscard(p);
    p.hand = p.hand.filter((x) => x.id !== d.id);
    p.discards.push(d);
    S.lastDiscardWild = O.isWild(d, S.ctx);
    if (S.melds.length && O.isPlayable(d, S.melds, S.ctx) && p.hand.length > 0) { p.penalty += 101; log(t("{p} jette une tuile jouable : +101.", { p: p.name })); }
    log(t("{p} jette {x}.", { p: p.name, x: O.tileLabel(d, S.ctx) }));
    thinking(i, false);
    NC.audio.play("tile");
    render();
    const pileEl = S.area.querySelector("#ok-dis-" + i + " .is-top");
    if (pileEl) pileEl.classList.add("is-landing");
    await sleep(450);
    endTurn();
  }

  function aiWantsDiscard(p, d) {
    if (O.isWild(d, S.ctx)) return p.opened || O.bestMelds(p.hand.concat([d]), S.ctx, "points").value >= O.OPEN_POINTS;
    const hand = p.hand.concat([d]);
    if (!p.opened) {
      const r = O.bestMelds(hand, S.ctx, "points");
      return r.value >= O.OPEN_POINTS && r.melds.some((m) => m.some((x) => x.id === d.id)) && r.tiles < hand.length;
    }
    if (p.openedTurn === S.turnNo) return false;
    if (p.opened === "series" && O.isPlayable(d, S.melds, S.ctx)) return p.hand.length > 1;
    if (p.opened === "series") {
      const r = O.bestMelds(hand, S.ctx, "tiles");
      return r.melds.some((m) => m.some((x) => x.id === d.id)) && r.tiles < hand.length;
    }
    return false;
  }

  function layMelds(i, melds, pairs) {
    const p = S.players[i];
    for (const tiles of melds) {
      const m = pairs ? O.analyzePair(tiles, S.ctx) : O.analyzeMeld(tiles, S.ctx);
      if (!m) continue;
      const ids = new Set(tiles.map((x) => x.id));
      if (p.hand.length - ids.size < 1) break;
      p.hand = p.hand.filter((x) => !ids.has(x.id));
      m.id = ++S.meldId;
      m.owner = i;
      S.melds.push(m);
    }
  }

  function chooseDiscard(p) {
    const ctx = S.ctx;
    const hand = p.hand;
    const protectedIds = new Set();
    if (!p.opened) O.bestMelds(hand, ctx, "points", 15000).melds.flat().forEach((x) => protectedIds.add(x.id));
    else if (p.opened === "series") O.bestMelds(hand, ctx, "tiles", 15000).melds.flat().forEach((x) => protectedIds.add(x.id));
    let cands = hand.filter((x) => !O.isWild(x, ctx));
    if (!cands.length) cands = hand.slice();
    const safe = cands.filter((x) => !S.melds.length || !O.isPlayable(x, S.melds, ctx));
    if (safe.length) cands = safe;
    const free = cands.filter((x) => !protectedIds.has(x.id));
    if (free.length) cands = free;
    const useful = (tl) => {
      const f = O.face(tl, ctx);
      let u = 0;
      for (const o of hand) {
        if (o === tl || O.isWild(o, ctx)) continue;
        const g = O.face(o, ctx);
        if (g.c === f.c && g.n === f.n) u += p.opened === "pairs" || !p.opened ? 2 : 0.5;
        else if (g.c === f.c && Math.abs(g.n - f.n) <= 2) u += 1.2;
        else if (g.n === f.n && g.c !== f.c) u += 1;
      }
      return u;
    };
    cands.sort((a, b) => useful(a) - useful(b) || O.face(b, ctx).n - O.face(a, ctx).n);
    return cands[0];
  }

  // ---------------------------------------------------------------------------
  // End of round
  // ---------------------------------------------------------------------------
  function endRound(finisher) {
    if (S.phase !== "play") return;
    S.phase = "end";
    S.h = null;
    const withOkey = finisher >= 0 && S.lastDiscardWild;
    const scores = O.scoreRound(S.players, S.ctx, finisher, withOkey);
    const min = Math.min(...scores);
    const winners = scores.map((s, i) => (s === min ? i : -1)).filter((i) => i >= 0);
    let payout = 0;
    if (winners.includes(0)) payout = Math.floor((S.stake * WIN_MULT) / winners.length);
    const net = S.round.settle(payout);
    render();
    const title = finisher === 0 ? t("Vous avez terminé !") : finisher > 0 ? t("{p} termine", { p: S.players[finisher].name }) : t("Pioche épuisée");
    const a = S.area;
    a.querySelector(".ok-controls").innerHTML = `
      <div class="ok-results glass">
        <h4>${escapeHtml(title)}${withOkey ? t(" — avec l'okey (×2)") : ""}</h4>
        <div class="table-wrap"><table class="stats-table"><thead><tr><th>${t("Joueur")}</th><th>${t("Statut")}</th><th>${t("Tuiles")}</th><th>${t("Score")}</th></tr></thead><tbody>
        ${S.players.map((p, i) => `<tr class="${winners.includes(i) ? "is-best" : ""}"><td>${escapeHtml(p.name)}</td><td>${i === finisher ? t("Terminé") : p.opened ? (p.opened === "pairs" ? t("Ouvert (paires)") : t("Ouvert")) : t("Non ouvert")}${p.penalty ? " · " + t("pén. {v}", { v: p.penalty }) : ""}</td><td>${p.hand.length}</td><td>${scores[i]}</td></tr>`).join("")}
        </tbody></table></div>
        <p class="${net > 0 ? "neon-green" : "neon-red"}">${net > 0 ? t("Victoire : +{v}", { v: money(net) }) : t("Défaite : −{v}", { v: money(-net) })}${winners.length > 1 && winners.includes(0) ? " " + t("(égalité partagée)") : ""}</p>
        <button class="btn btn--primary btn--uv" data-ok="again">${t("Nouvelle manche")}</button>
      </div>`;
    msg(winners.includes(0) ? t("Score le plus bas : vous gagnez la manche !") : t("Gagnant : {p}", { p: winners.map((w) => S.players[w].name).join(", ") }), winners.includes(0) ? "ok" : "warn");
    NC.ui.banner(a.querySelector(".ok-table"), net > 0 ? "big" : "lose", net > 0 ? t("Manche gagnée") : t("Manche perdue"), net > 0 ? "+" + money(net) : "−" + money(-net), 2800);
    NC.ui.announce(net, payout, { target: a.querySelector(".ok-table"), stake: S.stake, big: net > 0 });
  }

  function canLeave() {
    if (S.phase === "play") return t("La manche en cours sera abandonnée et votre mise ({v}) perdue.", { v: money(S.stake) });
    return null;
  }
  function leave() {
    if (S.phase === "play" && S.round && !S.round.settled) S.round.settle(0);
    S.phase = "lobby";
    S.h = null;
    S.busy = false;
  }

  function artSVG() {
    const ink = ["#e0123f", "#d69200", "#1a6fe0", "#14112e"];
    return `<svg viewBox="0 0 320 210"><defs><linearGradient id="ok-felt-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16348a"/><stop offset="1" stop-color="#0a1440"/></linearGradient>
      <linearGradient id="ok-rack-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5a2b"/><stop offset="1" stop-color="#4a2c12"/></linearGradient></defs>
      <rect x="22" y="14" width="276" height="112" rx="14" fill="url(#ok-felt-g)" stroke="#00f0ff" stroke-width="2" opacity=".95"/>
      <g stroke="rgba(255,255,255,.08)">${Array.from({ length: 12 }, (_, i) => `<line x1="${44 + i * 21}" y1="18" x2="${44 + i * 21}" y2="122"/>`).join("")}</g>
      <g class="art-float">${[[5, 0], [6, 0], [7, 0], [11, 2], [11, 3], [11, 1]].map(([n, c], i) => `<g transform="translate(${62 + i * 32} ${44})"><rect width="28" height="40" rx="5" fill="#f6f1e2"/><text x="14" y="27" text-anchor="middle" font-family="Unbounded" font-weight="900" font-size="15" fill="${ink[c]}">${n}</text></g>`).join("")}</g>
      <rect x="18" y="140" width="284" height="58" rx="10" fill="url(#ok-rack-g)" stroke="#ffc94d" stroke-width="1.5"/>
      ${[1, 2, 3, 9, 9, 12, 12, 13].map((n, i) => `<g transform="translate(${30 + i * 33} 146)" class="${i === 3 ? "a-bob" : ""}"><rect width="29" height="44" rx="5" fill="#f6f1e2" ${i === 7 ? 'stroke="#b6ff00" stroke-width="2.5"' : ""}/><text x="14.5" y="29" text-anchor="middle" font-family="Unbounded" font-weight="900" font-size="15" fill="${ink[i % 4]}">${n}</text></g>`).join("")}</svg>`;
  }

  NC.registerGame({
    id: ID,
    title: "Okey 101",
    tagline: t("Le grand classique turc : ouvrez à 101 et videz votre chevalet."),
    category: "table",
    badge: t("4 joueurs"),
    payout: t("{m}× la mise", { m: WIN_MULT }),
    accent: "#2f7bff",
    accent2: "#b6ff00",
    isNew: true,
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="5" height="8" rx="1"/><rect x="9.5" y="6" width="5" height="8" rx="1"/><rect x="16" y="6" width="5" height="8" rx="1"/><path d="M2 17h20"/></svg>',
    art: artSVG(),
    rules: () => NC.i18n.pick({
      fr: `<h4>Matériel</h4><p>106 tuiles : 4 couleurs (rouge, jaune, bleu, noir) × 1–13 en double + 2 faux jokers. La tuile indicatrice (gösterge) désigne l'<b>okey</b> : même couleur, numéro suivant (13 → 1). Les deux okeys sont des jokers. Les faux jokers (★) valent la tuile okey.</p>
      <h4>Distribution</h4><p>21 tuiles par joueur, 22 pour le donneur, qui commence en jetant une tuile.</p>
      <h4>Tour de jeu</h4><ul><li>Piochez au centre <b>ou</b> prenez la tuile que votre voisin de gauche vient de jeter (coin en bas à gauche).</li><li>Ouvrez / posez / ajoutez des tuiles, puis jetez une tuile dans le coin en bas à droite (glisser-déposer ou bouton « Jeter »).</li><li>Rangez votre chevalet librement en glissant les tuiles ; les boutons sur les côtés trient en séries, groupes ou paires.</li></ul>
      <h4>Combinaisons</h4><ul><li><b>Série</b> : 3+ numéros qui se suivent, même couleur. 12-13-1 autorisé (le 1 vaut alors 14), pas 13-1-2.</li><li><b>Groupe</b> : 3 ou 4 tuiles du même numéro, couleurs toutes différentes.</li><li><b>Paire</b> : deux tuiles identiques.</li></ul>
      <h4>Ouvrir</h4><ul><li>Séries/groupes totalisant au moins <b>101 points</b> en un seul tour (sélectionnez les tuiles puis « Former » pour chaque combinaison, puis « Ouvrir »), ou <b>5 paires</b>.</li><li>Si vous prenez la tuile jetée sans avoir ouvert, vous devez ouvrir avec elle ce tour-ci (sinon « Rendre la tuile »).</li><li>Après l'ouverture : poser de nouvelles combinaisons et ajouter des tuiles aux combinaisons de tous les joueurs (à partir du tour suivant). Vous pouvez récupérer un okey posé en le remplaçant par la vraie tuile.</li></ul>
      <h4>Fin et scores</h4><table><tr><td>Joueur qui termine</td><td>−101 (−202 en jetant l'okey)</td></tr><tr><td>Ouvert</td><td>somme des tuiles restantes (okey en main = 101), ×2 si ouvert en paires</td></tr><tr><td>Non ouvert</td><td>202</td></tr><tr><td>Tuile jouable jetée</td><td>+101</td></tr></table>
      <p>Score le plus bas = vainqueur (gain ${WIN_MULT}× la mise, partagé en cas d'égalité). Si la pioche s'épuise, les mains sont comptées.</p>`,
      tr: `<h4>Taşlar</h4><p>106 taş: 4 renk (kırmızı, sarı, mavi, siyah) × 1–13, her biri iki adet + 2 sahte okey. Gösterge taşı <b>okey</b>'i belirler: aynı renk, bir üst sayı (13 → 1). İki okey taşı jokerdir. Sahte okeyler (★) okey taşının değerini alır.</p>
      <h4>Dağıtım</h4><p>Her oyuncuya 21 taş, dağıtana 22 taş verilir; dağıtan bir taş atarak başlar.</p>
      <h4>Oyun sırası</h4><ul><li>Ortadan taş çekin <b>veya</b> solunuzdaki oyuncunun attığı taşı alın (sol alt köşe).</li><li>Elinizi açın / per dizin / işleyin, sonra sağ alt köşeye bir taş atın (sürükle-bırak veya « At » düğmesi).</li><li>Istakanızı taşları sürükleyerek dilediğiniz gibi dizin; yandaki düğmeler seri, grup veya çift dizer.</li></ul>
      <h4>Perler</h4><ul><li><b>Seri</b>: aynı renkte ardışık 3+ sayı. 12-13-1 geçerlidir (1 burada 14 sayılır), 13-1-2 geçersizdir.</li><li><b>Grup</b>: aynı sayıdan, hepsi farklı renkte 3 veya 4 taş.</li><li><b>Çift</b>: birebir aynı iki taş.</li></ul>
      <h4>El açmak</h4><ul><li>Tek turda toplamı en az <b>101 puan</b> olan seri/gruplar (taşları seçip her per için « Per yap », sonra « Elini aç ») veya <b>5 çift</b>.</li><li>Açmadan yerden taş alırsanız o tur o taşla açmak zorundasınız (yoksa « Taşı geri ver »).</li><li>Açtıktan sonra: yeni perler dizebilir ve bir sonraki turdan itibaren tüm oyuncuların perlerine taş işleyebilirsiniz. Yerdeki okeyi gerçek taşla değiştirip alabilirsiniz.</li></ul>
      <h4>Bitiş ve puanlar</h4><table><tr><td>Biten oyuncu</td><td>−101 (okey atarak biterse −202)</td></tr><tr><td>Açmış oyuncu</td><td>eldeki taşların toplamı (elde kalan okey = 101), çiftten açtıysa ×2</td></tr><tr><td>Açmamış oyuncu</td><td>202</td></tr><tr><td>İşlek taş atmak</td><td>+101 ceza</td></tr></table>
      <p>En düşük puan kazanır (ödeme bahsin ${WIN_MULT} katı, beraberlikte paylaşılır). Taşlar biterse eller sayılır.</p>`,
    }),
    mount,
    leave,
    canLeave,
  });
})();
