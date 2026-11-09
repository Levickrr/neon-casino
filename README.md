# NEON CASINO — Next Gen

A futuristic, cyberpunk-styled **virtual casino** that runs entirely in your browser. Eleven games, one shared wallet, levels, loans, synthesized sound and a lot of neon. French and Turkish interface.

> **Virtual credits only.** The "₵" credits have no value and cannot be bought, sold or exchanged. There is no deposit, withdrawal or payment code anywhere in this project. It is made for entertainment and learning.

**Play online:** `https://YOUR-PROJECT.vercel.app` *(replace this with your own link after you deploy; see the guide below)*

![Home page](docs/screenshots/home.jpg)

---

## Contents

- [Games](#games)
- [Screenshots](#screenshots)
- [Run it on your computer](#run-it-on-your-computer)
- [Put it online with GitHub and Vercel (step by step)](#put-it-online-with-github-and-vercel-step-by-step)
- [How the virtual economy works](#how-the-virtual-economy-works)
- [Plinko: the protected physics](#plinko-the-protected-physics)
- [Sound, effects and accessibility](#sound-effects-and-accessibility)
- [Project layout](#project-layout)
- [Tests](#tests)

---

## Games

| # | Game | Highlights |
|---|------|-----------|
| 1 | **Blackjack** | 6-deck shoe, dealer stands on all 17s, dealer peeks for blackjack, 3:2 blackjack, Double, Split, keyboard shortcuts |
| 2 | **Roulette** | European single zero, full betting board, several chips, undo / ×2 / rebet. The wheel turns, the ball is launched, slows down, drops and bounces between pockets, and always stops in the pocket of the number drawn |
| 3 | **Slots Premium** | 3×3 grid, 5 paylines, real reel strips (what you see is what is paid), reels that really spin, exact return 95.8 %, jackpot 777 |
| 4 | **Rocket Crash** | Proper crash curve (chance to reach m× is 99 % ÷ m), auto cash-out, safe against late clicks |
| 5 | **Neon Mines** | 1–24 mines, fair multiplier × 0.98, live odds, full reveal after a loss |
| 6 | **Plinko Drop** | Original physics preserved (see below), glowing pegs, trails, up to 15 balls at once |
| 7 | **Dice Roll** | Over/Under, chance and multiplier shown (98 ÷ chance) |
| 8 | **Virtual Coin** | Real 3D coin with thickness (NC face and Alien face), tossed, flipped, bounced, always lands on the drawn face |
| 9 | **Texas Hold'em** | No-Limit against 3 AI players with different styles, blinds, side pots, split pots, natural pacing |
| 10 | **Okey 101** | Classic Okey table, two-row wooden rack with drag-and-drop, 106 tiles, jokers, 101-point or 5-pair opening, 3 AI opponents, real scoring |
| 11 | **Baccarat** | Punto Banco, 8-deck shoe, full third-card rules, pair bets, results history |

Every game has a **?** button with its full rules and payouts.

## Screenshots

| Lobby | Roulette |
|---|---|
| ![Lobby](docs/screenshots/lobby.jpg) | ![Roulette](docs/screenshots/roulette.jpg) |

| Okey 101 | Texas Hold'em |
|---|---|
| ![Okey 101](docs/screenshots/okey.jpg) | ![Poker](docs/screenshots/poker.jpg) |

| Plinko Drop | Mobile |
|---|---|
| ![Plinko](docs/screenshots/plinko.jpg) | <img src="docs/screenshots/mobile.jpg" width="240" alt="Mobile view"> |

---

## Run it on your computer

You do **not** need to install anything to try it.

**Easiest way:** open the file `index.html` in Chrome, Edge, Firefox or Safari (double-click it).

**Recommended way** (a tiny local web server, if you have Python installed):

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765> in your browser.

The page loads its fonts from Google Fonts. Offline, it falls back to system fonts and everything still works.

**Language:** use the **FR / TR** switch in the top bar. Your choice is saved. By default the site follows your browser language (Turkish if your browser is Turkish, otherwise French).

---

## Put it online with GitHub and Vercel (step by step)

This guide assumes **no technical knowledge**. You will do two things:

1. Put the project files on **GitHub** (a website that stores your project online).
2. Connect GitHub to **Vercel** (a service that turns your files into a real website with its own link). Both have a free plan.

Think of it like this: GitHub is the **storage room**, Vercel is the **shop window** that shows what is in the storage room to the world.

### Before you start

- Unzip `NEON_CASINO_NEXT_GEN.zip` on your computer. You get a folder named `NEON_CASINO_NEXT_GEN`.
- Open that folder. You should see files and folders like `index.html`, `css`, `js`, `assets`, `README.md`. **Remember what you see here**, you will need it in Part 2.

### Part 1: Put the files on GitHub

**Step 1. Create a GitHub account** (skip this if you already have one).

1. Go to <https://github.com> and click **Sign up**.
2. Enter your email, choose a password and a username. Follow the instructions on screen.
3. GitHub will email you a code. Type it in to confirm your email.

**Step 2. Create an empty "repository".** A repository (people say "repo") is just a folder for one project on GitHub.

1. After logging in, click the **+** button at the top right, then click **New repository**.
2. In **Repository name**, type `neon-casino` (no spaces).
3. Choose **Public**. (Vercel's free plan works with public projects without any extra setup.)
4. **Do not** tick any of the boxes like "Add a README file". Leave them all empty.
5. Click the green **Create repository** button.

**Step 3. Upload your files.**

1. You are now on an almost empty page. Look for the small link that says **uploading an existing file** and click it.
   - If you cannot find it, click **Add file** and then **Upload files**.
2. Open the unzipped `NEON_CASINO_NEXT_GEN` folder on your computer.
3. Select **everything inside the folder** (press `Ctrl + A` on Windows or `Cmd + A` on Mac) and **drag it into the GitHub page**.

> **Very important:** drag the things that are **inside** the folder (`index.html`, `css`, `js`, ...), **not the folder itself**.
> The file `index.html` must be at the very top level of your repository. If it ends up inside another folder, your website will show a "404 Not Found" error.
>
> Also do **not** upload the `.zip` file. GitHub does not unzip it.

4. Wait until every file has finished uploading (a green bar or a list of files appears).
5. Scroll down. In the box under **Commit changes**, you can leave the default text.
6. Click the green **Commit changes** button.

**Step 4. Check that it worked.** Your repository page should now list `index.html`, `css`, `js`, `assets`, `README.md` and the other items directly on the first page.

> **What if some files are missing?** Files whose name starts with a dot (like `.gitignore`) are hidden on some computers, so you may not see them to drag. That is fine: the website still works without them.

### Part 2: Turn it into a website with Vercel

**Step 5. Create a Vercel account.**

1. Go to <https://vercel.com> and click **Sign Up**.
2. Choose **Continue with GitHub**. (This is the simplest way: Vercel and GitHub get connected right away.)
3. Choose the **Hobby** plan (it is the free one, for personal projects).
4. GitHub will ask you to authorise Vercel. Click **Authorize**.

**Step 6. Import your project.**

1. On your Vercel dashboard, click **Add New...** and then **Project**.
2. You will see a list of your GitHub projects. Find `neon-casino` and click **Import** next to it.
   - If the list is empty or `neon-casino` is missing, click **Adjust GitHub App Permissions** (or "Configure GitHub App"), allow access to the `neon-casino` repository, then come back.

**Step 7. Deploy.** This is the easy part: **do not change any setting.**

1. On the "Configure Project" page, leave everything as it is. The project already contains a small file (`vercel.json`) that tells Vercel what to do. There is nothing to build and nothing to type.
2. Click **Deploy**.
3. Wait about 30 seconds. When confetti appears, it is done.

**Step 8. Open your website.**

1. Click the big picture of your site (or the **Visit** button).
2. Your link looks like `https://neon-casino-something.vercel.app`. **Copy it and share it with anyone**. It works on computers and phones.
3. Optional: put this link in the **Play online** line at the top of this README (see "Update later" below).

### Part 3: Change things later

Every time you change a file on GitHub, Vercel updates your website **by itself** in about a minute.

- **Edit a file:** open the file in your repository, click the pencil icon, make your change, click **Commit changes**.
- **Replace or add files:** click **Add file** then **Upload files**, drag the new files in (same name = replaced), click **Commit changes**.

### Optional: a nicer link name

1. In Vercel, open your project and click **Settings** then **Domains**.
2. Type a name like `my-neon-casino.vercel.app` (if it is free) and click **Add**.
3. If you own your own domain name (for example `mycasino.com`), you can add it in the same place. Vercel shows exactly what to do.

### If something goes wrong

| Problem | What to do |
|---|---|
| **"404: NOT_FOUND"** when you open the link | `index.html` is probably inside another folder in your repository. Open the repository on GitHub: if you see only one folder (for example `NEON_CASINO_NEXT_GEN`) and `index.html` is inside it, either re-upload the files so `index.html` is at the top, or in Vercel go to **Settings, General, Root Directory**, type that folder name and click **Save**, then **Deployments, Redeploy**. |
| The page is blank or has no style | Some files did not upload. Check that the folders `css`, `js` and `assets` exist in your repository and contain files. Upload the missing ones. |
| Vercel does not show my repository | Click **Adjust GitHub App Permissions** and give Vercel access to the repository. |
| The text looks plain / different font | The fonts come from Google Fonts. If the visitor is offline or blocks Google, the site uses the normal system font. Everything still works. |
| No sound | Browsers only allow sound after you click something on the page. Click anywhere, and check the speaker button in the top bar. |
| My progress disappeared | Progress (balance, level) is saved **in each visitor's own browser**. A different browser, device or private window starts fresh. This is normal: the project has no server and no accounts. |

> **Good to know:** because everything is saved in the visitor's browser, every person who opens your link has their own wallet. Nobody can see anyone else's. There is no real money anywhere.

---

## How the virtual economy works

- Starting balance: **100,000 ₵**. Progress from the first version of this project (`neon_casino_ultra` save) is migrated automatically.
- One wallet for all 11 games (`js/core/store.js`). Every round goes through `NC.startRound()` and `round.settle()`:
  - a bet is only taken if it is valid (whole number, at least 1, not more than the balance),
  - a round can be settled **only once** (no duplicate payouts),
  - the balance can never go below zero.
- **Loans:** 1,000 ₵ each, up to 3. Partial or full repayment. When the balance reaches twice the debt, the debt is collected automatically.
- **XP and levels:** XP comes from playing and winning. Level N needs N × 500 XP. Each level gives a bonus of level × 250 ₵.
- Saved in `localStorage`. Poker chips sitting on the table are saved too and returned to the wallet if the page is closed mid-session.
- Closing a game in the middle of a round is always fair: Crash and Mines cash out, Blackjack plays out your hand, Plinko finishes each ball's real trajectory, and so on.

## Plinko: the protected physics

The ball physics are kept **line for line** from the original project (`js/games/plinko.js`): gravity 0.25, friction 0.99, restitution 0.5, wall bounce −0.8, peg collisions with exact surface correction and reflection `v' = v − 2(v·n)n`, the same random kick on each hit, the same centred drop, the same peg layout and multipliers. The payout is the bucket the ball physically falls into.

A test (`tests/logic.test.js`) contains a verbatim copy of the original loop and checks that, for 2,000 seeded drops, the new code produces **exactly the same trajectory, coordinate for coordinate**.

Only two bugs were fixed, without touching any formula:

1. **Screen size changed the odds.** The original simulated in screen pixels, so on a phone the pegs were closer together than on desktop (measured return: 93 % on desktop, 231 % on a phone). The simulation now always runs on the original 600 × 450 board and is only scaled when drawn.
2. **Refresh rate changed the speed.** Balls fell twice as fast on 120/144 Hz screens. Physics now runs at exactly 60 steps per second.

## Sound, effects and accessibility

- Sounds are generated live with the Web Audio API (no audio files). Nothing plays before your first click. Use the speaker button to turn sound on or off.
- The sparkle button reduces optional effects (particles, confetti, animated backgrounds).
- Game animations (roulette, reels, coin, dealt cards) are the game itself and always play. When the operating system's "reduce motion" setting is on, only decorative background animations are calmed.
- Keyboard: `Esc` closes a game. In Blackjack, `H` / `S` / `D` / `P` and `Enter` play. In Slots and Crash, `Space` spins or launches.

## Project layout

```
index.html            page, header, game window
vercel.json           tells Vercel this is a plain static site (nothing to build)
css/main.css          design tokens, layout, lobby, components
css/games.css         interfaces of the 11 games
js/core/utils.js      secure random numbers, shuffling, formatting, timer/listener cleanup
js/core/i18n.js       language system (French / Turkish)
js/core/i18n-tr.js    Turkish dictionary
js/core/store.js      state, wallet, rounds, XP, loans, statistics, saving
js/core/audio.js      synthesized sound
js/core/fx.js         particles, confetti, floating text
js/core/ui.js         toasts, dialogs, bet control, cards, banners
js/core/registry.js   game registry
js/core/app.js        lobby, filters, navigation, bank, profile
js/logic/*.js         pure game rules (cards, poker, baccarat, okey, slots), no DOM
js/games/*.js         one module per game
tests/                unit tests, end-to-end tests, translation check
docs/screenshots/     images used in this README
```

Each game is a self-contained module registered with `NC.registerGame({ id, mount(area, scope), leave(), canLeave() })`. The `scope` object owns every timer, animation frame and listener of the game and cleans them all up when the game closes, which prevents memory leaks and duplicate listeners.

## Tests

```bash
node tests/logic.test.js       # 36 tests: economy, poker, baccarat, okey, slots, Plinko physics
```

```bash
node tests/i18n-keys.js        # checks that every French string has a Turkish translation
```

The browser test plays real rounds of all 11 games in Chromium (it needs Playwright):

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm run serve                  # first terminal
```

```bash
npm run test:e2e               # second terminal
```

It checks invalid bets, payouts, closing mid-round, loans, saving, the Turkish language, mobile layout (no sideways scrolling) and that no error appears in the browser console.
