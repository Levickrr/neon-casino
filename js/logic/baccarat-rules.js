/* =============================================================================
   BACCARAT (Punto Banco) — RULES & PAYOUTS (pure, DOM-free)
============================================================================= */
(function (root) {
  "use strict";
  const NC = (root.NC = root.NC || {});

  function total(hand) {
    return hand.reduce((s, c) => s + NC.cards.bacValue(c), 0) % 10;
  }

  /** Banker's third-card rule given banker total and the player's third card value (or null). */
  function bankerDraws(bankerTotal, playerThird) {
    if (playerThird == null) return bankerTotal <= 5;
    if (bankerTotal <= 2) return true;
    if (bankerTotal === 3) return playerThird !== 8;
    if (bankerTotal === 4) return playerThird >= 2 && playerThird <= 7;
    if (bankerTotal === 5) return playerThird >= 4 && playerThird <= 7;
    if (bankerTotal === 6) return playerThird === 6 || playerThird === 7;
    return false;
  }

  /**
   * Plays one coup from `draw()` (a function returning the next card).
   * Returns { player, banker, pTotal, bTotal, winner, natural, order }
   * `order` is the dealing sequence for the animation: [{to:'P'|'B', card}]
   */
  function playCoup(draw) {
    const player = [];
    const banker = [];
    const order = [];
    const deal = (h, to) => { const c = draw(); h.push(c); order.push({ to, card: c }); return c; };
    deal(player, "P"); deal(banker, "B"); deal(player, "P"); deal(banker, "B");
    let p = total(player);
    let b = total(banker);
    const natural = p >= 8 || b >= 8;
    if (!natural) {
      let playerThird = null;
      if (p <= 5) {
        const c = deal(player, "P");
        playerThird = NC.cards.bacValue(c);
        p = total(player);
      }
      if (bankerDraws(b, playerThird)) {
        deal(banker, "B");
        b = total(banker);
      }
    }
    const winner = p > b ? "player" : b > p ? "banker" : "tie";
    return { player, banker, pTotal: p, bTotal: b, winner, natural, order };
  }

  /** Total returned for each bet type (stake included). */
  const PAYOUT = { player: 2, banker: 1.95, tie: 9, ppair: 12, bpair: 12 };

  /** bets: {player, banker, tie, ppair, bpair} -> total payout (integer, floored). */
  function settle(bets, coup) {
    let pay = 0;
    const pPair = coup.player[0].r === coup.player[1].r;
    const bPair = coup.banker[0].r === coup.banker[1].r;
    const lines = {};
    const add = (k, v) => { lines[k] = Math.floor(v); pay += Math.floor(v); };
    if (bets.player) add("player", coup.winner === "player" ? bets.player * PAYOUT.player : coup.winner === "tie" ? bets.player : 0);
    if (bets.banker) add("banker", coup.winner === "banker" ? bets.banker * PAYOUT.banker : coup.winner === "tie" ? bets.banker : 0);
    if (bets.tie) add("tie", coup.winner === "tie" ? bets.tie * PAYOUT.tie : 0);
    if (bets.ppair) add("ppair", pPair ? bets.ppair * PAYOUT.ppair : 0);
    if (bets.bpair) add("bpair", bPair ? bets.bpair * PAYOUT.bpair : 0);
    return { total: pay, lines, pPair, bPair };
  }

  NC.baccarat = { total, bankerDraws, playCoup, settle, PAYOUT };
})(typeof window !== "undefined" ? window : globalThis);
