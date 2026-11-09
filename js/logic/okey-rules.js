/* =============================================================================
   OKEY 101 — RULES ENGINE (pure, DOM-free)

   Tiles: 4 colours × 1–13 × 2 copies = 104 + 2 false jokers = 106.
   The indicator tile ("gösterge") is turned face up; the OKEY (wild joker)
   is the same colour, one number higher (13 → 1). Both copies of that tile
   are wild. False jokers ("sahte okey") are NOT wild: they stand in for the
   okey's face value.

   Sets:
   - Run  : 3+ consecutive numbers of one colour. 1 can be low (1-2-3) or
            high after 13 (12-13-1, counted as 14 points). No wrap 13-1-2.
   - Group: 3 or 4 tiles of the same number, all different colours.
   - Pair : two identical tiles (opening "çift" with 5+ pairs).

   This file also contains the meld search used by the AI to open (≥101).
============================================================================= */
(function (root) {
  "use strict";
  const NC = (root.NC = root.NC || {});

  const COLORS = ["red", "yellow", "blue", "black"];
  const COLOR_NAMES = ["Rouge", "Jaune", "Bleu", "Noir"];
  const OPEN_POINTS = 101;
  const OPEN_PAIRS = 5;
  const HAND_SIZE = 21;

  // ---------------------------------------------------------------------------
  // Tiles
  // ---------------------------------------------------------------------------
  function createTiles() {
    const tiles = [];
    let id = 0;
    for (let copy = 0; copy < 2; copy++)
      for (let c = 0; c < 4; c++)
        for (let n = 1; n <= 13; n++) tiles.push({ id: id++, c, n, fake: false });
    tiles.push({ id: id++, c: -1, n: 0, fake: true });
    tiles.push({ id: id++, c: -1, n: 0, fake: true });
    return tiles;
  }

  /** okey = indicator + 1 (same colour, 13 wraps to 1). */
  function okeyFromIndicator(ind) {
    return { c: ind.c, n: ind.n === 13 ? 1 : ind.n + 1 };
  }
  function isWild(t, ctx) {
    return !t.fake && t.c === ctx.okey.c && t.n === ctx.okey.n;
  }
  /** The face a tile plays as (false joker = okey's face). Wild tiles have no fixed face. */
  function face(t, ctx) {
    return t.fake ? { c: ctx.okey.c, n: ctx.okey.n } : { c: t.c, n: t.n };
  }
  function faceKey(c, n) { return c * 13 + (n - 1); }

  /** Deal a round. Returns { hands[4], deck, indicator, okey }. Dealer gets 22 tiles. */
  function deal(dealer) {
    const tiles = NC.util.shuffle(createTiles());
    // indicator: any non-fake tile
    const idx = tiles.findIndex((t) => !t.fake);
    const indicator = tiles.splice(idx, 1)[0];
    const okey = okeyFromIndicator(indicator);
    const hands = [[], [], [], []];
    for (let p = 0; p < 4; p++) {
      const count = p === dealer ? HAND_SIZE + 1 : HAND_SIZE;
      for (let i = 0; i < count; i++) hands[p].push(tiles.pop());
    }
    return { hands, deck: tiles, indicator, okey };
  }

  // ---------------------------------------------------------------------------
  // Meld analysis
  // ---------------------------------------------------------------------------
  /** Value of a run position (14 = ace high). */
  const posVal = (p) => p;
  const posNum = (p) => (p === 14 ? 1 : p);

  function analyzeRun(tiles, ctx) {
    if (tiles.length < 3) return null;
    const wild = tiles.filter((t) => isWild(t, ctx));
    const real = tiles.filter((t) => !isWild(t, ctx));
    if (!real.length) return null; // all-wild sets are not allowed
    const color = face(real[0], ctx).c;
    if (!real.every((t) => face(t, ctx).c === color)) return null;
    const nums = real.map((t) => face(t, ctx).n);
    const ones = nums.filter((n) => n === 1).length;
    if (ones > 1) return null;
    let best = null;
    const options = ones ? [1, 14] : [null];
    for (const aceAs of options) {
      const pos = real.map((t) => {
        const n = face(t, ctx).n;
        return n === 1 ? aceAs : n;
      });
      const sorted = pos.slice().sort((a, b) => a - b);
      if (new Set(sorted).size !== sorted.length) continue;
      let lo = sorted[0];
      let hi = sorted[sorted.length - 1];
      const gaps = hi - lo + 1 - sorted.length;
      if (gaps > wild.length) continue;
      let extra = wild.length - gaps;
      // extend high first (more points), then low; never contain both 1 and 14
      while (extra > 0 && hi < 14 && !(lo === 1 && hi + 1 === 14)) { hi++; extra--; }
      while (extra > 0 && lo > 1 && !(lo - 1 === 1 && hi === 14)) { lo--; extra--; }
      if (extra > 0) continue;
      if (lo === 1 && hi === 14) continue;
      // build ordered placement
      const byPos = {};
      real.forEach((t, i) => (byPos[pos[i]] = t));
      const wq = wild.slice();
      const placed = [];
      let value = 0;
      for (let p = lo; p <= hi; p++) {
        const t = byPos[p] || wq.shift();
        placed.push({ t, pos: p, wild: !byPos[p] });
        value += posVal(p);
      }
      const res = { type: "run", color, lo, hi, value, tiles: placed };
      if (!best || res.value > best.value) best = res;
    }
    return best;
  }

  function analyzeGroup(tiles, ctx) {
    if (tiles.length < 3 || tiles.length > 4) return null;
    const wild = tiles.filter((t) => isWild(t, ctx));
    const real = tiles.filter((t) => !isWild(t, ctx));
    if (!real.length) return null;
    const num = face(real[0], ctx).n;
    if (!real.every((t) => face(t, ctx).n === num)) return null;
    const colors = real.map((t) => face(t, ctx).c);
    if (new Set(colors).size !== colors.length) return null;
    const missing = [0, 1, 2, 3].filter((c) => !colors.includes(c));
    const placed = real.map((t) => ({ t, color: face(t, ctx).c, wild: false }));
    wild.forEach((t, i) => placed.push({ t, color: missing[i], wild: true }));
    placed.sort((a, b) => a.color - b.color);
    return { type: "group", num, value: num * tiles.length, tiles: placed };
  }

  function analyzePair(tiles, ctx) {
    if (tiles.length !== 2) return null;
    const [a, b] = tiles;
    const wa = isWild(a, ctx);
    const wb = isWild(b, ctx);
    if (!wa && !wb) {
      const fa = face(a, ctx);
      const fb = face(b, ctx);
      if (fa.c !== fb.c || fa.n !== fb.n) return null;
    }
    const ref = wa ? (wb ? null : face(b, ctx)) : face(a, ctx);
    const v = ref ? ref.n * 2 : 0;
    return { type: "pair", value: v, tiles: tiles.map((t) => ({ t, wild: isWild(t, ctx) })) };
  }

  /** Analyse a selection as a run or group (best value; tie → run). */
  function analyzeMeld(tiles, ctx) {
    const r = analyzeRun(tiles, ctx);
    const g = analyzeGroup(tiles, ctx);
    if (r && g) return g.value > r.value ? g : r;
    return r || g || null;
  }

  // ---------------------------------------------------------------------------
  // Attaching to table melds ("işlemek") & taking the okey back by swapping
  // ---------------------------------------------------------------------------
  function runPositionsFor(t, ctx) {
    const f = face(t, ctx);
    return f.n === 1 ? [1, 14] : [f.n];
  }

  /** Returns where the tile could be added: {meld, side} or null. Does not mutate. */
  function attachOption(meld, t, ctx) {
    if (meld.type === "pair") return null;
    const wild = isWild(t, ctx);
    if (meld.type === "run") {
      const lo = meld.lo;
      const hi = meld.hi;
      const okHi = hi < 14 && !(lo === 1 && hi + 1 === 14);
      const okLo = lo > 1 && !(lo - 1 === 1 && hi === 14);
      if (wild) return okHi ? { side: "hi", pos: hi + 1 } : okLo ? { side: "lo", pos: lo - 1 } : null;
      if (face(t, ctx).c !== meld.color) return null;
      for (const p of runPositionsFor(t, ctx)) {
        if (p === hi + 1 && okHi) return { side: "hi", pos: p };
        if (p === lo - 1 && okLo) return { side: "lo", pos: p };
      }
      return null;
    }
    // group
    if (meld.tiles.length >= 4) return null;
    if (wild) return { side: "add" };
    const f = face(t, ctx);
    if (f.n !== meld.num) return null;
    const realColors = meld.tiles.filter((x) => !x.wild).map((x) => x.color);
    if (realColors.includes(f.c)) return null;
    return { side: "add" };
  }

  /** Mutates meld to include t. Returns true on success. */
  function attach(meld, t, ctx) {
    const opt = attachOption(meld, t, ctx);
    if (!opt) return false;
    const wild = isWild(t, ctx);
    if (meld.type === "run") {
      if (opt.side === "hi") { meld.tiles.push({ t, pos: opt.pos, wild }); meld.hi = opt.pos; }
      else { meld.tiles.unshift({ t, pos: opt.pos, wild }); meld.lo = opt.pos; }
      meld.value += posVal(opt.pos);
    } else {
      const used = meld.tiles.filter((x) => !x.wild).map((x) => x.color);
      if (!wild) used.push(face(t, ctx).c);
      meld.tiles.push({ t, color: wild ? -1 : face(t, ctx).c, wild });
      // reassign joker colours to missing ones
      const missing = [0, 1, 2, 3].filter((c) => !used.includes(c));
      meld.tiles.filter((x) => x.wild).forEach((x, i) => (x.color = missing[i]));
      meld.tiles.sort((a, b) => a.color - b.color);
      meld.value = meld.num * meld.tiles.length;
    }
    return true;
  }

  /** Can t replace a wild tile in this meld? Returns index in meld.tiles or -1. */
  function swapOption(meld, t, ctx) {
    if (meld.type === "pair" || isWild(t, ctx)) return -1;
    const f = face(t, ctx);
    if (meld.type === "run") {
      if (f.c !== meld.color) return -1;
      const ps = runPositionsFor(t, ctx);
      return meld.tiles.findIndex((x) => x.wild && ps.includes(x.pos));
    }
    if (f.n !== meld.num) return -1;
    const realColors = meld.tiles.filter((x) => !x.wild).map((x) => x.color);
    if (realColors.includes(f.c)) return -1;
    const exact = meld.tiles.findIndex((x) => x.wild && x.color === f.c);
    if (exact >= 0) return exact;
    return meld.tiles.findIndex((x) => x.wild);
  }
  /** Replaces the wild tile; returns the freed okey tile or null. */
  function swapJoker(meld, t, ctx) {
    const i = swapOption(meld, t, ctx);
    if (i < 0) return null;
    const freed = meld.tiles[i].t;
    meld.tiles[i] = Object.assign({}, meld.tiles[i], { t, wild: false });
    if (meld.type === "group") {
      meld.tiles[i].color = face(t, ctx).c;
      const used = meld.tiles.filter((x) => !x.wild).map((x) => x.color);
      const missing = [0, 1, 2, 3].filter((c) => !used.includes(c));
      meld.tiles.filter((x) => x.wild).forEach((x, k) => (x.color = missing[k]));
      meld.tiles.sort((a, b) => a.color - b.color);
    }
    return freed;
  }

  /** Is this tile playable on any table meld? (discarding it is penalised) */
  function isPlayable(t, melds, ctx) {
    return melds.some((m) => attachOption(m, t, ctx) || swapOption(m, t, ctx) >= 0);
  }

  // ---------------------------------------------------------------------------
  // Meld search (AI): best disjoint set of runs/groups from a hand
  // ---------------------------------------------------------------------------
  function handProfile(hand, ctx) {
    const counts = new Array(52).fill(0);
    const byKey = {};
    const wilds = [];
    for (const t of hand) {
      if (isWild(t, ctx)) { wilds.push(t); continue; }
      const f = face(t, ctx);
      const k = faceKey(f.c, f.n);
      counts[k]++;
      (byKey[k] = byKey[k] || []).push(t);
    }
    return { counts, byKey, wilds };
  }

  function genCandidates(counts, J) {
    const cands = [];
    // runs
    for (let c = 0; c < 4; c++) {
      for (let lo = 1; lo <= 12; lo++) {
        let missing = 0;
        const keys = [];
        for (let hi = lo; hi <= 14; hi++) {
          if (lo === 1 && hi === 14) break;
          const k = faceKey(c, posNum(hi));
          keys.push(k);
          if (!counts[k]) missing++;
          if (missing > J) break;
          if (hi - lo >= 2 && missing < keys.length) {
            let value = 0;
            for (let p = lo; p <= hi; p++) value += p;
            cands.push({ type: "run", c, lo, hi, keys: keys.slice(), value });
          }
        }
      }
    }
    // groups
    for (let n = 1; n <= 13; n++) {
      const subsets = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3], [0, 1, 2, 3]];
      for (const s of subsets) {
        const keys = s.map((c) => faceKey(c, n));
        const missing = keys.filter((k) => !counts[k]).length;
        if (missing <= J && missing < keys.length) cands.push({ type: "group", n, colors: s, keys, value: n * s.length });
      }
    }
    return cands;
  }

  /**
   * Finds the best set of melds in `hand`.
   * mode "points": maximise total points (for the 101 opening)
   * mode "tiles" : maximise tiles laid, then points
   * Returns { melds: [ [tiles...] ], value, tiles }
   */
  function bestMelds(hand, ctx, mode, nodeLimit) {
    const prof = handProfile(hand, ctx);
    const counts = prof.counts.slice();
    const J0 = prof.wilds.length;
    const cands = genCandidates(counts, J0);
    const byKey = {};
    cands.forEach((cd) => cd.keys.forEach((k) => (byKey[k] = byKey[k] || []).push(cd)));
    const keyVal = (k) => (k % 13) + 1;
    const score = (val, tiles) => (mode === "tiles" ? tiles * 1000 + val : val);
    let best = { s: -1, chosen: [], value: 0, tiles: 0 };
    let nodes = 0;
    const limit = nodeLimit || 40000;
    let J = J0;
    const chosen = [];

    function remainingBound() {
      let v = 0;
      let n = 0;
      for (let k = 0; k < 52; k++) if (counts[k]) { v += counts[k] * Math.max(keyVal(k), k % 13 === 0 ? 14 : 0); n += counts[k]; }
      v += J * 14;
      n += J;
      return { v, n };
    }

    function rec(curVal, curTiles, fromKey) {
      if (++nodes > limit) return;
      const cur = score(curVal, curTiles);
      if (cur > best.s) best = { s: cur, chosen: chosen.slice(), value: curVal, tiles: curTiles };
      const rb = remainingBound();
      if (score(curVal + rb.v, curTiles + rb.n) <= best.s) return;
      let k = fromKey;
      while (k < 52 && !counts[k]) k++;
      if (k >= 52) return;
      // option A: use this tile in a candidate
      const list = byKey[k] || [];
      for (const cd of list) {
        // apply: real tiles first, jokers for missing
        const used = [];
        let jUsed = 0;
        let ok = true;
        for (const kk of cd.keys) {
          if (counts[kk] > 0) { counts[kk]--; used.push(kk); }
          else if (J - jUsed > 0) jUsed++;
          else { ok = false; break; }
        }
        // the anchor tile must be real
        if (ok && !used.includes(k)) ok = false;
        if (ok) {
          J -= jUsed;
          chosen.push({ cd, used: used.slice(), jUsed });
          rec(curVal + cd.value, curTiles + cd.keys.length, k);
          chosen.pop();
          J += jUsed;
        }
        used.forEach((kk) => counts[kk]++);
        if (nodes > limit) return;
      }
      // option B: leave one copy of this tile out
      counts[k]--;
      rec(curVal, curTiles, k);
      counts[k]++;
    }
    rec(0, 0, 0);

    // Map chosen candidates back to concrete tiles
    const pools = {};
    Object.keys(prof.byKey).forEach((k) => (pools[k] = prof.byKey[k].slice()));
    const wq = prof.wilds.slice();
    const melds = best.chosen.map(({ cd, used }) => {
      const usedCopy = used.slice();
      return cd.keys.map((k) => {
        const i = usedCopy.indexOf(k);
        if (i >= 0) { usedCopy.splice(i, 1); return pools[k].shift(); }
        return wq.shift();
      });
    });
    return { melds, value: best.value, tiles: best.tiles };
  }

  /** Builds as many pairs as possible. Returns array of [t, t]. */
  function findPairs(hand, ctx) {
    const prof = handProfile(hand, ctx);
    const pairs = [];
    const singles = [];
    Object.keys(prof.byKey).forEach((k) => {
      const arr = prof.byKey[k];
      for (let i = 0; i + 1 < arr.length; i += 2) pairs.push([arr[i], arr[i + 1]]);
      if (arr.length % 2) singles.push(arr[arr.length - 1]);
    });
    const w = prof.wilds.slice();
    singles.sort((a, b) => face(b, ctx).n - face(a, ctx).n);
    while (w.length && singles.length) pairs.push([singles.shift(), w.shift()]);
    while (w.length >= 2) pairs.push([w.shift(), w.shift()]);
    return pairs;
  }

  // ---------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------
  /** Penalty value of a tile left in hand (okey left in hand = 101). */
  function handTileValue(t, ctx) {
    if (isWild(t, ctx)) return 101;
    return face(t, ctx).n;
  }

  /**
   * players: [{ hand, opened: false|'series'|'pairs', penalty }]
   * finisher: index or -1; finishedWithOkey: boolean
   */
  function scoreRound(players, ctx, finisher, finishedWithOkey) {
    return players.map((p, i) => {
      let s;
      if (i === finisher) s = finishedWithOkey ? -202 : -101;
      else if (!p.opened) s = 202;
      else {
        s = p.hand.reduce((a, t) => a + handTileValue(t, ctx), 0);
        if (p.opened === "pairs") s *= 2;
        if (finishedWithOkey) s *= 2;
      }
      return s + (p.penalty || 0);
    });
  }

  function tileLabel(t, ctx) {
    const tr = NC.t || ((x) => x);
    if (t.fake) return tr("Faux joker");
    return tr(COLOR_NAMES[t.c]) + " " + t.n + (ctx && isWild(t, ctx) ? " (OKEY)" : "");
  }

  NC.okey = {
    COLORS, COLOR_NAMES, OPEN_POINTS, OPEN_PAIRS, HAND_SIZE,
    createTiles, okeyFromIndicator, isWild, face, deal,
    analyzeRun, analyzeGroup, analyzePair, analyzeMeld,
    attachOption, attach, swapOption, swapJoker, isPlayable,
    bestMelds, findPairs, handTileValue, scoreRound, tileLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
