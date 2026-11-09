/* =============================================================================
   TEXAS HOLD'EM — HAND EVALUATION, POTS & EQUITY (pure, DOM-free)
============================================================================= */
(function (root) {
  "use strict";
  const NC = (root.NC = root.NC || {});
  const RV = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 };
  const CAT_NAMES = ["Carte haute", "Paire", "Double paire", "Brelan", "Quinte", "Couleur", "Full", "Carré", "Quinte flush", "Quinte flush royale"];

  function rv(c) { return RV[c.r]; }

  /** Score a 5-card hand. Higher score = better hand. */
  function eval5(cards) {
    const vals = cards.map(rv).sort((a, b) => b - a);
    const flush = cards.every((c) => c.s === cards[0].s);
    const uniq = [...new Set(vals)];
    let straightHigh = 0;
    if (uniq.length === 5) {
      if (vals[0] - vals[4] === 4) straightHigh = vals[0];
      else if (vals[0] === 14 && vals[1] === 5) straightHigh = 5; // wheel A-2-3-4-5
    }
    const counts = {};
    vals.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
    // groups sorted by count desc then value desc
    const groups = Object.keys(counts).map((v) => [counts[v], +v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    let cat;
    let kick;
    if (straightHigh && flush) { cat = 8; kick = [straightHigh]; }
    else if (groups[0][0] === 4) { cat = 7; kick = [groups[0][1], groups[1][1]]; }
    else if (groups[0][0] === 3 && groups[1][0] === 2) { cat = 6; kick = [groups[0][1], groups[1][1]]; }
    else if (flush) { cat = 5; kick = vals; }
    else if (straightHigh) { cat = 4; kick = [straightHigh]; }
    else if (groups[0][0] === 3) { cat = 3; kick = groups.map((g) => g[1]); }
    else if (groups[0][0] === 2 && groups[1][0] === 2) { cat = 2; kick = groups.map((g) => g[1]); }
    else if (groups[0][0] === 2) { cat = 1; kick = groups.map((g) => g[1]); }
    else { cat = 0; kick = vals; }
    let score = cat;
    for (let i = 0; i < 5; i++) score = score * 15 + (kick[i] || 0);
    return { score, cat };
  }

  const COMBOS7 = [];
  (function () {
    for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
      const keep = [];
      for (let i = 0; i < 7; i++) if (i !== a && i !== b) keep.push(i);
      COMBOS7.push(keep);
    }
  })();

  /** Best 5-card hand out of 5–7 cards. */
  function evaluate(cards) {
    if (cards.length === 5) {
      const e = eval5(cards);
      return { score: e.score, cat: e.cat, best: cards.slice(), name: catName(e.cat, cards) };
    }
    let best = null;
    const n = cards.length;
    const combos = n === 7 ? COMBOS7 : combosOf(n);
    for (const idx of combos) {
      const five = idx.map((i) => cards[i]);
      const e = eval5(five);
      if (!best || e.score > best.score) best = { score: e.score, cat: e.cat, best: five };
    }
    best.name = catName(best.cat, best.best);
    return best;
  }
  function combosOf(n) {
    const out = [];
    const rec = (start, acc) => {
      if (acc.length === 5) { out.push(acc.slice()); return; }
      for (let i = start; i < n; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
    };
    rec(0, []);
    return out;
  }
  function catName(cat, five) {
    if (cat === 8 && five.some((c) => c.r === "A") && five.some((c) => c.r === "K")) return CAT_NAMES[9];
    return CAT_NAMES[cat];
  }

  /**
   * Builds main/side pots from each player's total contribution.
   * players: [{ id, contributed, folded }]
   * Returns [{ amount, eligible: [ids] }]
   */
  function buildPots(players) {
    const levels = [...new Set(players.filter((p) => p.contributed > 0).map((p) => p.contributed))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const lvl of levels) {
      let amount = 0;
      for (const p of players) amount += Math.max(0, Math.min(p.contributed, lvl) - prev);
      const eligible = players.filter((p) => !p.folded && p.contributed >= lvl).map((p) => p.id);
      if (amount > 0) {
        // merge with previous pot when the eligible set is identical
        const last = pots[pots.length - 1];
        if (last && last.eligible.join() === eligible.join()) last.amount += amount;
        else pots.push({ amount, eligible });
      }
      prev = lvl;
    }
    // A pot nobody can win (everyone eligible folded) goes to the previous pot.
    for (let i = pots.length - 1; i > 0; i--) {
      if (!pots[i].eligible.length) { pots[i - 1].amount += pots[i].amount; pots.splice(i, 1); }
    }
    return pots;
  }

  /**
   * Distributes pots. scores: { id: score } for players still in.
   * order: seat ids starting left of the button (odd chips go first there).
   * Returns { id: amountWon }
   */
  function distribute(pots, scores, order) {
    const won = {};
    for (const pot of pots) {
      const contenders = pot.eligible.filter((id) => scores[id] != null);
      if (!contenders.length) continue;
      const top = Math.max(...contenders.map((id) => scores[id]));
      const winners = order.filter((id) => contenders.includes(id) && scores[id] === top);
      const share = Math.floor(pot.amount / winners.length);
      let rem = pot.amount - share * winners.length;
      for (const id of winners) {
        won[id] = (won[id] || 0) + share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
      }
    }
    return won;
  }

  /** Monte-Carlo win probability (ties count as split share). */
  function equity(hole, board, opponents, iterations) {
    const known = new Set(hole.concat(board).map((c) => c.r + c.s));
    const deck = NC.cards.createDeck().filter((c) => !known.has(c.r + c.s));
    const iters = iterations || 300;
    let total = 0;
    const need = 5 - board.length;
    for (let it = 0; it < iters; it++) {
      // partial shuffle of what we need
      const draws = need + opponents * 2;
      for (let i = 0; i < draws; i++) {
        const j = i + Math.floor(Math.random() * (deck.length - i));
        const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
      }
      const fullBoard = board.concat(deck.slice(0, need));
      const mine = evaluate(hole.concat(fullBoard)).score;
      let best = 0;
      let tie = 0;
      let lose = false;
      for (let o = 0; o < opponents; o++) {
        const oh = [deck[need + o * 2], deck[need + o * 2 + 1]];
        const s = evaluate(oh.concat(fullBoard)).score;
        if (s > mine) { lose = true; break; }
        if (s === mine) tie++;
        best = Math.max(best, s);
      }
      if (!lose) total += 1 / (tie + 1);
    }
    return total / iters;
  }

  /** Quick preflop strength 0..1 (Chen-like), used to speed up AI decisions. */
  function preflopStrength(hole) {
    const [a, b] = hole.map(rv).sort((x, y) => y - x);
    const suited = hole[0].s === hole[1].s;
    let s = a >= 14 ? 10 : a === 13 ? 8 : a === 12 ? 7 : a === 11 ? 6 : a / 2;
    if (a === b) s = Math.max(5, s * 2);
    if (suited) s += 2;
    const gap = a - b - 1;
    if (a !== b) s -= gap <= 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (a !== b && gap <= 1 && a < 12) s += 1;
    return Math.max(0, Math.min(1, s / 20));
  }

  NC.poker = { eval5, evaluate, buildPots, distribute, equity, preflopStrength, CAT_NAMES, rv };
})(typeof window !== "undefined" ? window : globalThis);
