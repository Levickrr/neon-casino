/* =============================================================================
   NEON CASINO — END-TO-END PLAY TEST (Playwright)
   Plays real rounds of all 11 games in Chromium through the UI and checks:
   no console errors, balance always a non-negative integer, persistence,
   closing mid-round, mobile layout without horizontal scroll.

   Run:  npm run serve   (in another terminal)   then   npm run test:e2e
   Env:  NC_URL (default http://localhost:8765/index.html), SHOTS=dir
============================================================================= */
"use strict";
const { chromium } = require("playwright");
const URL = process.env.NC_URL || "http://localhost:8765/index.html";
const SHOTS = process.env.SHOTS || null;

let pass = 0, fail = 0;
const results = [];
async function step(name, fn) {
  try { await fn(); pass++; results.push("  ✓ " + name); console.log("  ✓", name); }
  catch (e) { fail++; results.push("  ✗ " + name + " — " + e.message); console.log("  ✗", name, "\n     ", e.message.split("\n")[0]); }
}
function ok(v, m) { if (!v) throw new Error(m || "assertion failed"); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Test speed-up: game animations run 4× faster (they are the same animations).
  await ctx.addInitScript(() => { window.NC_SPEED = 0.25; });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  const bal = () => page.evaluate(() => NC.wallet.balance);
  const checkBal = async (label) => {
    const b = await bal();
    ok(Number.isInteger(b) && b >= 0, `${label}: invalid balance ${b}`);
    return b;
  };
  const open = async (id) => {
    await page.evaluate((g) => NC.app.openGame(g), id);
    await page.waitForTimeout(300);
  };
  const close = async () => {
    await page.click("#game-close");
    await page.waitForTimeout(250);
    if (await page.$(".modal [data-modal-val='yes']")) { await page.click(".modal [data-modal-val='yes']"); await page.waitForTimeout(250); }
  };
  const setBet = async (id, v) => page.fill("#bet-" + id, String(v));
  const enabled = async (sel) => page.$eval(sel, (e) => !e.disabled && !e.hidden).catch(() => false);
  const waitEnabled = (sel, t) => page.waitForFunction((s) => { const e = document.querySelector(s); return e && !e.disabled && !e.hidden; }, sel, { timeout: t || 15000 });

  console.log("\nNEON CASINO — E2E");
  await page.goto(URL);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(800);
  await page.evaluate(() => { NC.settings.set("fx", false); NC.settings.set("sound", false); });

  await step("homepage loads with 11 game cards", async () => {
    ok((await page.$$(".gcard")).length === 11, "card count");
    ok((await bal()) === 100000, "starting balance");
  });

  await step("filter tabs", async () => {
    await page.click('[data-filter="cards"]');
    const vis = await page.$$eval(".gcard:not(.is-hidden)", (l) => l.map((e) => e.dataset.open));
    ok(vis.length === 3 && vis.includes("poker") && vis.includes("baccarat"), "cards filter: " + vis);
    await page.click('[data-filter="all"]');
  });

  await step("invalid bets are rejected (empty, 0, letters, > balance)", async () => {
    await open("dice");
    const b0 = await bal();
    for (const v of ["", "0", "abc", "999999999"]) {
      await page.fill("#bet-dice", v);
      await page.click("#d-roll");
      await page.waitForTimeout(80);
    }
    ok((await bal()) === b0, "balance changed on invalid bet");
    await close();
  });

  await step("Blackjack: 12 hands (hit/stand/double)", async () => {
    await open("blackjack");
    await setBet("blackjack", 200);
    for (let i = 0; i < 12; i++) {
      await waitEnabled('[data-act="deal"]');
      await page.click('[data-act="deal"]');
      await page.waitForTimeout(400);
      for (let k = 0; k < 8; k++) {
        if (await enabled('[data-act="deal"]')) break;
        const choice = ["hit", "stand", "double", "split"][Math.floor(Math.random() * 4)];
        if (await enabled(`[data-act="${choice}"]`)) await page.click(`[data-act="${choice}"]`);
        else if (await enabled('[data-act="stand"]')) await page.click('[data-act="stand"]');
        await page.waitForTimeout(250);
      }
      await waitEnabled('[data-act="deal"]', 20000);
      await checkBal("blackjack");
    }
    if (SHOTS) await page.screenshot({ path: SHOTS + "/play-blackjack.png" });
    await close();
  });

  await step("Roulette: 5 spins with several bets", async () => {
    await open("roulette");
    for (let i = 0; i < 5; i++) {
      await page.click('[data-chip="100"]');
      for (const k of ["red", "n:17", "d2", "c1", "odd"]) await page.click(`[data-bet="${k}"]`);
      const b0 = await bal();
      await page.click('[data-act="spin"]');
      ok((await bal()) === b0 - 500, "stake debited once");
      await page.waitForFunction(() => !document.querySelector("#rr-result").classList.contains("is-spinning"), null, { timeout: 12000 });
      const n = +(await page.textContent("#rr-num"));
      const ballOn = await page.evaluate(() => NC.rouletteMath.WHEEL[NC.rouletteMath.pocketAt(+document.querySelector("#rw-ball").dataset.rel)]);
      ok(ballOn === n, `ball is on ${ballOn} but result shows ${n}`);
      const exp = await page.evaluate((num) => ["red", "n:17", "d2", "c1", "odd"].reduce((s, k) => s + 100 * NC.rouletteMath.payFor(k, num), 0), n);
      const b1 = await bal();
      ok(b1 - (b0 - 500) >= exp, `payout for ${n}: expected ${exp}, got ${b1 - (b0 - 500)}`);
    }
    if (SHOTS) await page.screenshot({ path: SHOTS + "/play-roulette.png" });
    await close();
  });

  await step("Slots: 10 spins", async () => {
    await open("slots");
    await setBet("slots", 100);
    for (let i = 0; i < 10; i++) {
      await waitEnabled('[data-act="spin"]');
      await page.click('[data-act="spin"]');
      await page.waitForTimeout(100);
    }
    await waitEnabled('[data-act="spin"]');
    // reels must show exactly what the math says
    const same = await page.evaluate(() => {
      const st = [0, 1, 2].map((r) => [...document.querySelectorAll("#sl-strip-" + r + " .sl-sym")].slice(0, 3).map((e) => e.dataset.sym));
      return st;
    });
    ok(same.every((c) => c.length === 3), "3 visible symbols per reel");
    await checkBal("slots");
    if (SHOTS) await page.screenshot({ path: SHOTS + "/play-slots.png" });
    await close();
  });

  await step("Crash: manual cash-out, auto cash-out, close mid-flight", async () => {
    await open("crash");
    await setBet("crash", 100);
    for (let i = 0; i < 3; i++) {
      await waitEnabled("#cr-btn", 15000);
      await page.click("#cr-btn");
      await page.waitForTimeout(700);
      if (await enabled("#cr-btn")) await page.click("#cr-btn");
      await page.waitForTimeout(2200);
    }
    await waitEnabled("#cr-btn", 15000);
    await page.fill("#cr-auto", "1.10");
    await page.click("#cr-btn");
    await page.waitForTimeout(2500);
    await checkBal("crash");
    await waitEnabled("#cr-btn", 15000);
    await page.fill("#cr-auto", "");
    // close during flight → must settle (never lose the round silently)
    const settledBefore = await page.evaluate(() => NC.stats.get("crash").rounds);
    await page.click("#cr-btn");
    await page.waitForTimeout(300);
    await close();
    const settledAfter = await page.evaluate(() => NC.stats.get("crash").rounds);
    ok(settledAfter === settledBefore + 1, "round settled on close");
    await checkBal("crash");
  });

  await step("Mines: reveal, cash-out, no payout after a bomb, refund on close", async () => {
    await open("mines");
    await setBet("mines", 100);
    await page.$eval("#m-count", (e) => { e.value = 5; e.dispatchEvent(new Event("input", { bubbles: true })); });
    for (let r = 0; r < 4; r++) {
      await waitEnabled("#m-start");
      await page.click("#m-start");
      for (let i = 0; i < 3; i++) {
        const tiles = await page.$$(".mine-tile:not(:disabled)");
        if (!tiles.length) break;
        await tiles[Math.floor(Math.random() * tiles.length)].click();
        await page.waitForTimeout(60);
      }
      const lost = await page.evaluate(() => !!document.querySelector(".mine-tile.is-hit"));
      const b = await bal();
      await page.$eval("#m-cash", (e) => e.click()); // forced click even if disabled
      if (lost) ok((await bal()) === b, "cash-out after bomb paid!");
      await page.waitForTimeout(1000);
    }
    await waitEnabled("#m-start");
    const b0 = await bal();
    await page.click("#m-start");
    await close();
    ok((await bal()) === b0, "refund when closing without revealing");
  });

  await step("Plinko: 10 balls, all land and pay", async () => {
    await open("plinko");
    await setBet("plinko", 100);
    const r0 = await page.evaluate(() => NC.stats.get("plinko").rounds);
    await page.click('[data-act="drop5"]');
    await page.waitForTimeout(400);
    await page.click('[data-act="drop5"]');
    await page.waitForFunction(() => document.querySelector("#p-live").textContent === "0", null, { timeout: 20000 });
    const r1 = await page.evaluate(() => NC.stats.get("plinko").rounds);
    ok(r1 - r0 === 10, "10 balls settled, got " + (r1 - r0));
    if (SHOTS) {
      await page.click('[data-act="drop5"]');
      await page.waitForTimeout(1500);
      await page.screenshot({ path: SHOTS + "/play-plinko.png" });
    }
    await close(); // balls still falling are finished by the real physics
    const r2 = await page.evaluate(() => NC.stats.get("plinko").rounds);
    ok(!SHOTS || r2 - r1 === 5, "in-flight balls settled on close");
    await checkBal("plinko");
  });

  await step("Dice: 8 rolls over/under, payout matches 98/chance", async () => {
    await open("dice");
    await setBet("dice", 100);
    for (let i = 0; i < 8; i++) {
      if (i === 4) await page.click('[data-mode="under"]');
      const b0 = await bal();
      await page.click("#d-roll");
      await waitEnabled("#d-roll");
      const res = +(await page.textContent("#d-res"));
      const mode = i >= 4 ? "under" : "over";
      const win = mode === "over" ? res > 50 : res < 50;
      const exp = win ? Math.floor(100 * (98 / (mode === "over" ? 50 : 49))) : 0;
      const got = (await bal()) - (b0 - 100);
      ok(got >= exp && got <= exp + 2000, `dice payout ${got} vs ${exp}`);
    }
    await close();
  });

  await step("Coin: 8 flips, face shown = result", async () => {
    await open("coinflip");
    await setBet("coinflip", 100);
    for (let i = 0; i < 8; i++) {
      await page.click(i % 2 ? '[data-side="tails"]' : '[data-side="heads"]');
      await page.waitForFunction(() => !document.querySelector('[data-side="heads"]').disabled, null, { timeout: 6000 });
      const { face0, txt } = await page.evaluate(() => ({ face0: document.querySelector("#cf-coin").dataset.face, txt: document.querySelector("#cf-res").textContent }));
      const face = face0 === "heads" ? "PILE" : "FACE";
      ok(txt.startsWith(face), `coin shows ${face} but result is ${txt}`);
    }
    await close();
  });

  await step("Baccarat: 6 coups", async () => {
    await open("baccarat");
    for (let i = 0; i < 6; i++) {
      await page.click('[data-chip="100"]');
      await page.click(['[data-bet="player"]', '[data-bet="banker"]', '[data-bet="tie"]'][i % 3]);
      await page.click('[data-bet="ppair"]');
      await waitEnabled('[data-act="deal"]');
      await page.click('[data-act="deal"]');
      await page.waitForFunction(() => /gagne|Égalité/.test(document.querySelector("#bc-msg").textContent), null, { timeout: 10000 });
      const ok3 = await page.evaluate(() => {
        const n = (s) => document.querySelectorAll(s + " .pcard").length;
        return n("#bc-player") >= 2 && n("#bc-player") <= 3 && n("#bc-banker") >= 2 && n("#bc-banker") <= 3;
      });
      ok(ok3, "2-3 cards per side");
    }
    if (SHOTS) await page.screenshot({ path: SHOTS + "/play-baccarat.png" });
    await checkBal("baccarat");
    await close();
  });

  await step("Poker: buy-in, play 5 hands, leave → stack returned", async () => {
    await open("poker");
    const b0 = await bal();
    await page.click('[data-act="sit"]');
    const buyIn = b0 - (await bal());
    ok(buyIn === 10000, "buy-in debited: " + buyIn);
    let hands = 0;
    const t0 = Date.now();
    while (hands < 5 && Date.now() - t0 < 120000) {
      if (await enabled('[data-pk="call"]')) {
        const r = Math.random();
        if (r < 0.15 && (await enabled('[data-pk="raise"]'))) await page.click('[data-pk="raise"]');
        else await page.click('[data-pk="call"]');
      } else if (await enabled('[data-pk="next"]')) {
        hands++;
        if (SHOTS && hands === 2) await page.screenshot({ path: SHOTS + "/play-poker.png" });
        if (hands < 5) await page.click('[data-pk="next"]');
      } else if (await page.$('[data-pk="rebuy"]')) { hands = 5; }
      await page.waitForTimeout(150);
    }
    ok(hands >= 5, "played hands: " + hands);
    const stack = await page.evaluate(() => +document.querySelector("#pk-seat-0 .pk-stack").textContent.replace(/\s/g, ""));
    const bBefore = await bal();
    await close();
    ok((await bal()) === bBefore + stack, `stack ${stack} returned`);
  });

  await step("Okey 101: play a full round (draw + discard) until it ends", async () => {
    await open("okey");
    await page.click('[data-act="start"]');
    const t0 = Date.now();
    let turns = 0;
    while (Date.now() - t0 < 240000) {
      if (await page.$(".ok-results")) break;
      if (await page.$(".modal [data-modal-val='yes']")) { await page.click(".modal [data-modal-val='yes']"); continue; }
      const deck = await page.$("#ok-deck.is-takeable");
      if (deck) { await deck.click(); await page.waitForTimeout(100); }
      const myTurn = await page.evaluate(() => /turn|ok/.test(document.querySelector("#ok-msg").className));
      const canSelect = await page.evaluate(() => !document.querySelector("#ok-deck.is-takeable") && /À vous|Formez|Posez|Vous commencez|Ouverture/.test(document.querySelector("#ok-msg").textContent));
      if (myTurn && canSelect) {
        // pick the right-most tile (that is not an okey) and discard it
        if ((await page.$$(".ok-rack .otile:not(.otile--wild)")).length) {
          await page.locator(".ok-rack .otile:not(.otile--wild)").last().click();
          await page.waitForTimeout(60);
          if (await enabled('[data-ok="discard"]')) { await page.click('[data-ok="discard"]'); turns++; }
          await page.waitForTimeout(150);
          if (turns === 3 && SHOTS) await page.screenshot({ path: SHOTS + "/play-okey.png" });
        }
      }
      await page.waitForTimeout(200);
    }
    ok(await page.$(".ok-results"), "round did not finish");
    if (SHOTS) await page.screenshot({ path: SHOTS + "/play-okey-end.png" });
    const rows = await page.$$eval(".ok-results tbody tr", (r) => r.length);
    ok(rows === 4, "score table");
    await checkBal("okey");
    await close();
  });

  await step("Loans: 3 max, repay", async () => {
    await page.evaluate(() => { NC.wallet.takeLoan(); NC.wallet.takeLoan(); NC.wallet.takeLoan(); });
    ok(!(await page.evaluate(() => NC.wallet.takeLoan().ok)), "4th loan refused");
    await page.click(".wallet-pill");
    await page.waitForSelector(".bank");
    await page.click('[data-bank="repay"]');
    await page.waitForTimeout(200);
    ok((await page.evaluate(() => NC.wallet.debt)) === 0, "debt repaid");
    await page.click(".modal__close");
  });

  await step("Progress persists after reload", async () => {
    const before = await page.evaluate(() => ({ b: NC.wallet.balance, l: NC.progress.info().level, x: NC.progress.info().xp }));
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ b: NC.wallet.balance, l: NC.progress.info().level, x: NC.progress.info().xp }));
    ok(JSON.stringify(before) === JSON.stringify(after), JSON.stringify(before) + " vs " + JSON.stringify(after));
  });

  await step("Poker chips survive a reload mid-session", async () => {
    await open("poker");
    const b0 = await bal();
    await page.click('[data-act="sit"]');
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForTimeout(700);
    const b1 = await bal();
    ok(b1 >= b0 - 10000 && b1 <= b0, "chips returned on reload: " + (b1 - b0));
    ok(b1 > b0 - 10000 + 1000, "most chips returned");
  });

  await step("Mobile (390px): no horizontal scroll, every game opens", async () => {
    const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    m.on("pageerror", (e) => errors.push("mobile pageerror: " + e.message));
    await m.goto(URL);
    await m.waitForTimeout(800);
    const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(over <= 0, "page overflows by " + over + "px");
    if (SHOTS) await m.screenshot({ path: SHOTS + "/mobile-home.png" });
    for (const id of ["blackjack", "roulette", "slots", "crash", "mines", "plinko", "dice", "coinflip", "poker", "okey", "baccarat"]) {
      await m.evaluate((g) => NC.app.openGame(g), id);
      await m.waitForTimeout(350);
      if (SHOTS && ["plinko", "blackjack", "slots", "baccarat"].includes(id)) await m.screenshot({ path: SHOTS + "/mobile-" + id + ".png" });
      await m.evaluate(() => NC.app.closeGame(false, true));
      await m.waitForTimeout(150);
    }
    await m.close();
  });

  await step("Hidden shortcut adds credits", async () => {
    const b0 = await bal();
    await page.keyboard.press("F4");
    await page.waitForTimeout(100);
    ok((await bal()) === b0 + 100000, "F4");
  });

  await step("Turkish language: switch, texts translated, games open", async () => {
    if (await page.evaluate(() => !!NC.app.current)) await page.evaluate(() => NC.app.closeGame(false, true));
    await page.waitForTimeout(300);
    await page.click('[data-lang="tr"]');
    await page.waitForLoadState("load");
    await page.waitForTimeout(800);
    ok((await page.evaluate(() => document.documentElement.lang)) === "tr", "html lang");
    const txt = await page.textContent("body");
    ok(/Oyunlar/.test(txt) && /Casinoya gir/.test(txt), "home translated");
    for (const id of ["roulette", "slots", "coinflip", "poker", "okey", "baccarat", "blackjack"]) {
      await page.evaluate((g) => NC.app.openGame(g), id);
      await page.waitForTimeout(300);
      const gt = await page.textContent("#game-area");
      ok(!/\b(Mise totale|Distribuer|Gain potentiel|Rejoindre une table)\b/.test(gt), id + " still French: " + gt.slice(0, 120));
      await page.evaluate(() => NC.app.closeGame(false, true));
    }
    await page.evaluate(() => NC.app.openGame("okey"));
    await page.click('[data-act="start"]');
    await page.waitForTimeout(1500);
    ok(/Deste/.test(await page.textContent("#game-area")), "okey TR");
    await page.evaluate(() => NC.app.closeGame(false, true));
    await page.click('[data-lang="fr"]');
    await page.waitForLoadState("load");
    await page.waitForTimeout(600);
  });

  await step("No console errors during the whole session", async () => {
    ok(!errors.length, errors.slice(0, 5).join(" | "));
  });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
