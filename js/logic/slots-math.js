/* =============================================================================
   SLOTS — REEL STRIPS, PAYLINES & PAYTABLE (pure, DOM-free)
   3 reels × 3 visible rows, 5 paylines. The visible window is always three
   consecutive positions of the real strip, so what you see is what is paid.
   The total bet is split evenly over the 5 lines.
============================================================================= */
(function (root) {
  "use strict";
  const NC = (root.NC = root.NC || {});

  const SYMBOLS = ["seven", "diamond", "bar", "bell", "star", "cherry"];
  // Each reel strip (top → bottom, wraps around).
  const STRIPS = [
    ["cherry", "star", "bell", "cherry", "bar", "star", "diamond", "cherry", "bell", "star", "seven", "cherry", "star", "bell", "bar", "cherry", "star", "diamond", "bell", "star"],
    ["star", "cherry", "bell", "star", "bar", "cherry", "diamond", "star", "bell", "cherry", "seven", "star", "bell", "cherry", "bar", "star", "diamond", "bell", "cherry", "star"],
    ["bell", "star", "cherry", "bell", "bar", "star", "diamond", "cherry", "star", "bell", "seven", "star", "cherry", "bell", "bar", "star", "cherry", "diamond", "star", "bell"],
  ];
  // Paylines as row index per reel (0 = top, 1 = middle, 2 = bottom)
  const LINES = [
    [1, 1, 1],
    [0, 0, 0],
    [2, 2, 2],
    [0, 1, 2],
    [2, 1, 0],
  ];
  // Pays (× line bet) for three of a kind on a line
  const PAY3 = { seven: 250, diamond: 75, bar: 40, bell: 20, star: 12, cherry: 15 };
  const PAY_CHERRY2 = 2; // two cherries from the left on a line

  function windowAt(stops) {
    // grid[reel][row]
    return stops.map((s, r) => {
      const strip = STRIPS[r];
      const L = strip.length;
      return [strip[(s - 1 + L) % L], strip[s], strip[(s + 1) % L]];
    });
  }

  /** Returns { mult (× total bet), wins: [{line, sym, mult}] } */
  function evaluate(grid) {
    const wins = [];
    let lineMultSum = 0;
    LINES.forEach((ln, i) => {
      const a = grid[0][ln[0]];
      const b = grid[1][ln[1]];
      const c = grid[2][ln[2]];
      let m = 0;
      if (a === b && b === c) m = PAY3[a];
      else if (a === "cherry" && b === "cherry") m = PAY_CHERRY2;
      if (m) { wins.push({ line: i, sym: a, mult: m, count: a === b && b === c ? 3 : 2 }); lineMultSum += m; }
    });
    return { mult: lineMultSum / LINES.length, wins };
  }

  function spin() {
    const stops = STRIPS.map((s) => NC.util.randInt(s.length));
    const grid = windowAt(stops);
    return Object.assign({ stops, grid }, evaluate(grid));
  }

  function exactRTP() {
    let sum = 0;
    let n = 0;
    for (let a = 0; a < STRIPS[0].length; a++)
      for (let b = 0; b < STRIPS[1].length; b++)
        for (let c = 0; c < STRIPS[2].length; c++) {
          sum += evaluate(windowAt([a, b, c])).mult;
          n++;
        }
    return sum / n;
  }

  NC.slotsMath = { SYMBOLS, STRIPS, LINES, PAY3, PAY_CHERRY2, windowAt, evaluate, spin, exactRTP };
})(typeof window !== "undefined" ? window : globalThis);
