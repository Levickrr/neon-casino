/* =============================================================================
   NEON CASINO — LOGIC UNIT TESTS (Node, no dependencies)
   Run:  node tests/logic.test.js
============================================================================= */
"use strict";
const path = require("path");
const load = (f) => require(path.join(__dirname, "..", "js", f));
// Minimal globals the modules expect
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
globalThis.matchMedia = () => ({ matches: false });
load("core/utils.js");
load("core/i18n.js");
load("core/store.js");
load("logic/cards.js");
load("logic/poker-eval.js");
load("logic/baccarat-rules.js");
load("logic/okey-rules.js");
load("logic/slots-math.js");
load("core/registry.js");
load("games/plinko.js");
const NC = globalThis.NC;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ✓", name); }
  catch (e) { fail++; console.log("  ✗", name, "\n     ", e.message); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || "") + " expected " + JSON.stringify(b) + " got " + JSON.stringify(a)); }
function ok(v, msg) { if (!v) throw new Error(msg || "assertion failed"); }
const C = (s) => { const m = s.match(/^(10|[2-9JQKA])([SHDC])$/); return { r: m[1], s: m[2] }; };
const H = (str) => str.split(" ").map(C);

// ---------------------------------------------------------------------------
console.log("\nWallet / economy");
t("rejects NaN, negative, decimal and oversize bets", () => {
  NC.store.reset();
  ok(!NC.wallet.validate("abc").ok); ok(!NC.wallet.validate("-5").ok); ok(!NC.wallet.validate("1.5").ok);
  ok(!NC.wallet.validate("").ok); ok(!NC.wallet.validate("0").ok);
  ok(!NC.wallet.validate(String(NC.wallet.balance + 1)).ok);
  ok(NC.wallet.validate("100").ok);
  ok(!NC.wallet.debit(NaN, "x")); ok(!NC.wallet.debit(-10, "x")); ok(!NC.wallet.debit(1.5, "x"));
});
t("round settles exactly once", () => {
  NC.store.reset();
  const start = NC.wallet.balance;
  const r = NC.startRound("dice", 1000);
  eq(NC.wallet.balance, start - 1000);
  r.settle(2000); r.settle(2000);
  ok(NC.wallet.balance >= start + 1000 && NC.wallet.balance < start + 1000 + 50000, "single payout (+ maybe level bonus)");
});
t("loans: max 3, repay resets counter, auto-repay at 2x debt", () => {
  NC.store.reset();
  NC.store.state.balance = 0;
  ok(NC.wallet.takeLoan().ok); ok(NC.wallet.takeLoan().ok); ok(NC.wallet.takeLoan().ok);
  ok(!NC.wallet.takeLoan().ok);
  eq(NC.wallet.debt, 3000); eq(NC.wallet.balance, 3000);
  ok(NC.wallet.repay(1000).ok); eq(NC.wallet.debt, 2000); eq(NC.wallet.loanCount, 3);
  NC.store.state.balance = 5000; NC.wallet.checkAutoRepay(); eq(NC.wallet.debt, 0); eq(NC.wallet.balance, 3000); eq(NC.wallet.loanCount, 0);
});
t("XP can grant several levels at once", () => {
  NC.store.reset();
  NC.progress.add(500 + 1000 + 10);
  eq(NC.progress.info().level, 3);
});
t("sanitize rejects corrupted saves", () => {
  const s = NC.store._sanitize({ balance: "NaN", debt: -4, level: 0, xp: null });
  eq(s.balance, NC.store.START_BALANCE); eq(s.debt, 0); eq(s.level, 1);
});

// ---------------------------------------------------------------------------
console.log("\nPoker hand evaluation");
const ev = (s) => NC.poker.evaluate(H(s));
t("category detection", () => {
  eq(ev("AS KS QS JS 10S 2D 3C").name, "Quinte flush royale");
  eq(ev("9H 8H 7H 6H 5H AD AC").cat, 8);
  eq(ev("9H 9D 9S 9C 5H AD 2C").cat, 7);
  eq(ev("9H 9D 9S 5C 5H AD 2C").cat, 6);
  eq(ev("2H 9H JH 5H KH AD 2C").cat, 5);
  eq(ev("AH 2D 3S 4C 5H KD QC").cat, 4);
  eq(ev("9H 9D 9S 4C 5H KD QC").cat, 3);
  eq(ev("9H 9D 4S 4C 5H KD QC").cat, 2);
  eq(ev("9H 9D 3S 4C 5H KD QC").cat, 1);
  eq(ev("9H 2D 3S 4C 7H KD QC").cat, 0);
});
t("wheel straight is lower than 6-high straight", () => {
  ok(ev("AH 2D 3S 4C 5H").score < ev("2D 3S 4C 5H 6D").score);
});
t("kickers decide", () => {
  ok(ev("AH AD KS 4C 2H 7D 8C").score > ev("AH AD QS 4C 2H 7D 8C").score);
  eq(ev("AH AD KS QC 2H 3D 4C").score, ev("AS AC KD QH 2C 3S 5C").score - (ev("AS AC KD QH 2C 3S 5C").score - ev("AH AD KS QC 2H 3D 4C").score));
});
t("board plays → split", () => {
  const board = H("AS KS QS JS 10S");
  eq(NC.poker.evaluate(H("2D 3C").concat(board)).score, NC.poker.evaluate(H("4D 5C").concat(board)).score);
});
t("two pair: best two pairs + kicker chosen from 7", () => {
  const a = ev("KH KD 9S 9C 4H 4D AC");
  const b = ev("KH KD 9S 9C 4H 4D QC");
  ok(a.score > b.score);
});
t("side pots", () => {
  const pots = NC.poker.buildPots([
    { id: 0, contributed: 100, folded: false },
    { id: 1, contributed: 300, folded: false },
    { id: 2, contributed: 300, folded: false },
    { id: 3, contributed: 50, folded: true },
  ]);
  eq(pots, [{ amount: 350, eligible: [0, 1, 2] }, { amount: 400, eligible: [1, 2] }]);
  const won = NC.poker.distribute(pots, { 0: 10, 1: 5, 2: 5 }, [0, 1, 2]);
  eq(won, { 0: 350, 1: 200, 2: 200 });
});
t("odd chip goes to first seat in order", () => {
  const won = NC.poker.distribute([{ amount: 101, eligible: [1, 2] }], { 1: 3, 2: 3 }, [2, 1]);
  eq(won, { 2: 51, 1: 50 });
});
t("equity sanity: AA vs 1 random ≈ 85%", () => {
  const e = NC.poker.equity(H("AS AH"), [], 1, 3000);
  ok(e > 0.8 && e < 0.9, "got " + e);
});

// ---------------------------------------------------------------------------
console.log("\nBaccarat");
t("card values", () => {
  eq(NC.baccarat.total(H("KS 9D")), 9); eq(NC.baccarat.total(H("AS 9D")), 0); eq(NC.baccarat.total(H("7S 8D")), 5);
});
t("banker third-card table", () => {
  const B = NC.baccarat.bankerDraws;
  ok(B(2, 8)); ok(B(3, 7)); ok(!B(3, 8)); ok(B(4, 2)); ok(!B(4, 1)); ok(!B(4, 8));
  ok(B(5, 4)); ok(!B(5, 3)); ok(B(6, 6)); ok(!B(6, 5)); ok(!B(7, 6));
  ok(B(5, null)); ok(!B(6, null));
});
function coupFrom(cards) { const q = H(cards); return NC.baccarat.playCoup(() => q.shift()); }
t("naturals stop the coup", () => {
  const c = coupFrom("8S 2D KH 3C"); // P: 8,K=8  B: 2,3=5
  eq(c.player.length, 2); eq(c.banker.length, 2); eq(c.winner, "player"); ok(c.natural);
});
t("player draws on 5, banker 3 vs player third 8 stands", () => {
  const c = coupFrom("2S AD 3H 2C 8D"); // P 2+3=5 → draws 8 → 3 ; B A+2=3, p3=8 → stands
  eq(c.player.length, 3); eq(c.banker.length, 2); eq(c.pTotal, 3); eq(c.bTotal, 3); eq(c.winner, "tie");
});
t("player stands 6, banker 5 draws", () => {
  const c = coupFrom("4S 3D 2H 2C 4D"); // P 4+2=6 stand; B 3+2=5 draws 4 → 9
  eq(c.player.length, 2); eq(c.banker.length, 3); eq(c.bTotal, 9); eq(c.winner, "banker");
});
t("payouts: banker 0.95, tie pushes P/B, tie 8:1", () => {
  const banker = coupFrom("4S 3D 2H 2C 4D");
  eq(NC.baccarat.settle({ banker: 100 }, banker).total, 195);
  eq(NC.baccarat.settle({ player: 100 }, banker).total, 0);
  const tie = coupFrom("2S AD 3H 2C 8D");
  eq(NC.baccarat.settle({ player: 100, banker: 100, tie: 10 }, tie).total, 290);
});
t("house edge sanity (simulation, 8 decks)", () => {
  let shoe = NC.cards.createShoe(8), pb = 0, pp = 0, N = 60000;
  for (let i = 0; i < N; i++) {
    if (shoe.length < 10) shoe = NC.cards.createShoe(8);
    const c = NC.baccarat.playCoup(() => shoe.pop());
    pb += NC.baccarat.settle({ banker: 100 }, c).total; pp += NC.baccarat.settle({ player: 100 }, c).total;
  }
  const rb = pb / (N * 100), rp = pp / (N * 100);
  ok(rb > 0.975 && rb < 0.997, "banker RTP " + rb); ok(rp > 0.97 && rp < 0.995, "player RTP " + rp);
});

// ---------------------------------------------------------------------------
console.log("\nOkey 101");
const O = NC.okey;
const ctx = { okey: { c: 2, n: 7 } }; // okey = blue 7 (indicator blue 6)
let nid = 1000;
const T = (c, n) => ({ id: nid++, c, n, fake: false });
const WILD = () => T(2, 7);
const FAKE = () => ({ id: nid++, c: -1, n: 0, fake: true });
t("tile set is 106 tiles with 2 false jokers", () => {
  const all = O.createTiles(); eq(all.length, 106); eq(all.filter((x) => x.fake).length, 2);
});
t("okey = indicator + 1, 13 wraps to 1", () => {
  eq(O.okeyFromIndicator({ c: 0, n: 13 }), { c: 0, n: 1 }); eq(O.okeyFromIndicator({ c: 3, n: 4 }), { c: 3, n: 5 });
});
t("deal: 21 tiles each, dealer 22, 20 left", () => {
  const d = O.deal(2);
  eq(d.hands.map((h) => h.length), [21, 21, 22, 21]); eq(d.deck.length, 106 - 1 - 85);
});
t("runs", () => {
  eq(O.analyzeMeld([T(0, 3), T(0, 4), T(0, 5)], ctx).value, 12);
  ok(!O.analyzeMeld([T(0, 3), T(1, 4), T(0, 5)], ctx), "mixed colours");
  eq(O.analyzeMeld([T(0, 12), T(0, 13), T(0, 1)], ctx).value, 39, "12-13-1 allowed (1 = 14)");
  ok(!O.analyzeMeld([T(0, 13), T(0, 1), T(0, 2)], ctx), "no wrap 13-1-2");
  eq(O.analyzeMeld([T(0, 3), WILD(), T(0, 5)], ctx).value, 12, "joker fills gap");
  eq(O.analyzeMeld([T(0, 11), T(0, 12), WILD()], ctx).value, 36, "joker extends high");
});
t("groups", () => {
  eq(O.analyzeMeld([T(0, 9), T(1, 9), T(3, 9)], ctx).type, "group");
  ok(!O.analyzeMeld([T(0, 9), T(0, 9), T(3, 9)], ctx), "duplicate colour");
  eq(O.analyzeMeld([T(0, 9), T(1, 9), T(3, 9), WILD()], ctx).value, 36);
  ok(!O.analyzeMeld([T(0, 9), T(1, 9), T(3, 9), T(2, 9), WILD()], ctx), "max 4");
});
t("false joker plays as the okey face (blue 7)", () => {
  eq(O.analyzeMeld([T(2, 5), T(2, 6), FAKE()], ctx).value, 18);
  ok(!O.isWild(FAKE(), ctx)); ok(O.isWild(WILD(), ctx));
});
t("pairs", () => {
  ok(O.analyzePair([T(1, 4), T(1, 4)], ctx)); ok(!O.analyzePair([T(1, 4), T(2, 4)], ctx)); ok(O.analyzePair([T(1, 4), WILD()], ctx));
});
t("attach and swap joker", () => {
  const m = O.analyzeMeld([T(0, 3), WILD(), T(0, 5)], ctx);
  ok(O.attach(m, T(0, 6), ctx)); eq(m.hi, 6);
  ok(O.attach(m, T(0, 2), ctx)); eq(m.lo, 2);
  ok(!O.attach(m, T(1, 7), ctx));
  const freed = O.swapJoker(m, T(0, 4), ctx);
  ok(freed && O.isWild(freed, ctx), "joker returned");
  const g = O.analyzeMeld([T(0, 9), T(1, 9), T(3, 9)], ctx);
  ok(O.attach(g, T(2, 9), ctx)); ok(!O.attach(g, T(2, 9), ctx));
});
t("bestMelds finds a ≥101 opening", () => {
  const hand = [T(0, 10), T(0, 11), T(0, 12), T(0, 13), T(1, 13), T(3, 13), T(1, 9), T(1, 10), T(1, 11), T(3, 2), T(0, 2), T(1, 5)];
  const r = O.bestMelds(hand, ctx, "points");
  // 10-11-12 red (33) + 13 group x3 (39) + 9-10-11 yellow (30) = 102
  ok(r.value >= 101, "value " + r.value);
  r.melds.forEach((m) => ok(O.analyzeMeld(m, ctx), "each meld valid"));
  const ids = r.melds.flat().map((x) => x.id); eq(new Set(ids).size, ids.length, "disjoint");
});
t("bestMelds uses jokers", () => {
  const hand = [T(0, 12), T(0, 13), WILD(), T(3, 5), T(1, 5), WILD()];
  const r = O.bestMelds(hand, ctx, "tiles");
  eq(r.tiles, 6);
});
t("bestMelds random hands always valid & fast", () => {
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) {
    const d = O.deal(0);
    const c = { okey: d.okey };
    const r = O.bestMelds(d.hands[0], c, "points");
    r.melds.forEach((m) => ok(O.analyzeMeld(m, c), "valid meld"));
    const ids = r.melds.flat().map((x) => x.id); eq(new Set(ids).size, ids.length);
  }
  ok(Date.now() - t0 < 8000, "too slow: " + (Date.now() - t0) + "ms");
});
t("pairs finder", () => {
  const hand = [T(0, 1), T(0, 1), T(1, 2), T(1, 2), T(3, 3), WILD()];
  eq(O.findPairs(hand, ctx).length, 3);
});
t("scoring", () => {
  const s = O.scoreRound([
    { hand: [], opened: "series" },
    { hand: [T(0, 5), T(1, 6)], opened: "series" },
    { hand: [T(0, 5)], opened: false },
    { hand: [T(0, 5), WILD()], opened: "pairs" },
  ], ctx, 0, false);
  eq(s, [-101, 11, 202, 212]);
});


// ---------------------------------------------------------------------------
console.log("\nPlinko physics (must match the ORIGINAL implementation exactly)");
// Verbatim copy of the original runPlinko() physics loop (script.js v1), run
// headless on a 600x450 board, used as the reference.
function originalDrop(W, H, rnd) {
  const pegsPct = [];
  for (let r = 2; r < 12; r++) { const pinsInRow = r + 1, spacing = 8, topPct = r * 7 + 5, offset = ((pinsInRow - 1) * spacing) / 2;
    for (let c = 0; c < pinsInRow; c++) pegsPct.push({ x: 50 - offset + c * spacing, y: topPct }); }
  const multipliers = [10, 3, 1.5, 0.5, 0.2, 0.5, 1.5, 3, 10];
  const ballSize = 12, pegRad = 4;
  const pegs = pegsPct.map(p => ({ cx: (p.x / 100) * W, cy: (p.y / 100) * H, r: pegRad }));
  let pos = { x: W / 2, y: 10 }; let vel = { x: 0, y: 0 };
  pos.x += (rnd() - 0.5) * 2;
  const gravity = 0.25, friction = 0.99, restitution = 0.5, collisionRad = (ballSize / 2) + pegRad;
  const path = [];
  for (let n = 0; n < 100000; n++) {
    vel.y += gravity; vel.x *= friction; pos.x += vel.x; pos.y += vel.y;
    if (pos.x < ballSize/2) { pos.x = ballSize/2; vel.x *= -0.8; } else if (pos.x > W - ballSize/2) { pos.x = W - ballSize/2; vel.x *= -0.8; }
    for (const peg of pegs) {
      if (Math.abs(pos.x - peg.cx) > collisionRad + 2 || Math.abs(pos.y - peg.cy) > collisionRad + 2) continue;
      const dx = pos.x - peg.cx, dy = pos.y - peg.cy, distSq = dx*dx + dy*dy, minDist = collisionRad;
      if (distSq < minDist * minDist) { const dist = Math.sqrt(distSq), nx = dx / dist, ny = dy / dist, overlap = minDist - dist;
        pos.x += nx * overlap; pos.y += ny * overlap; const dot = vel.x * nx + vel.y * ny;
        vel.x = vel.x - 2 * dot * nx; vel.y = vel.y - 2 * dot * ny; vel.x *= restitution; vel.y *= restitution; vel.x += (rnd() - 0.5) * 1.5; }
    }
    path.push(pos.x, pos.y);
    if (pos.y > H - 30) { const bW = W / multipliers.length; let b = Math.floor(pos.x / bW); if (b < 0) b = 0; if (b >= 9) b = 8; return { b, path }; }
  }
}
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
t("new step() reproduces the original trajectory exactly (2 000 seeded drops)", () => {
  const PP = NC.plinkoPhysics;
  const real = Math.random;
  try {
    for (let seed = 1; seed <= 2000; seed++) {
      const ref = originalDrop(600, 450, seeded(seed));
      Math.random = seeded(seed);
      const ball = PP.createBall();
      const path = []; let b = -1;
      while (b < 0) { b = PP.step(ball, PP.PEGS, null); path.push(ball.pos.x, ball.pos.y); }
      if (b !== ref.b || path.length !== ref.path.length || path.some((v, i) => v !== ref.path[i])) throw new Error("diverged at seed " + seed);
    }
  } finally { Math.random = real; }
});
t("bucket return over 100 000 drops ≈ 93 % (unchanged payouts)", () => {
  const PP = NC.plinkoPhysics; let sum = 0; const N = 100000;
  for (let i = 0; i < N; i++) { const ball = PP.createBall(); let b = -1; while (b < 0) b = PP.step(ball, PP.PEGS, null); sum += PP.MULTIPLIERS[b]; }
  const rtp = sum / N; console.log("     measured RTP:", (rtp * 100).toFixed(2) + "%"); ok(rtp > 0.9 && rtp < 0.96, "rtp " + rtp);
});

// ---------------------------------------------------------------------------
console.log("\nSlots math");
t("paytable return is between 94% and 98%", () => {
  const rtp = NC.slotsMath.exactRTP();
  ok(rtp > 0.94 && rtp < 0.98, "RTP " + rtp);
  console.log("     exact RTP:", (rtp * 100).toFixed(2) + "%");
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
