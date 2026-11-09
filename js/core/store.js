/* =============================================================================
   NEON CASINO — STATE, WALLET & PROGRESSION
   Single source of truth for the shared virtual economy used by all 11 games.
   Only virtual credits ("₵") exist. There is no deposit/withdraw/payment code.

   Rules enforced here (so games can't get them wrong):
   - Bets must be whole numbers >= 1 and <= balance (no NaN, no negatives).
   - The balance can never go below zero.
   - Each Round can only be settled once (no duplicate payouts).
============================================================================= */
(function (root) {
  "use strict";
  const NC = (root.NC = root.NC || {});

  const STORAGE_KEY = "neon_casino_nextgen_v2";
  const LEGACY_KEY = "neon_casino_ultra"; // save key of the original version
  const START_BALANCE = 100000;
  const LOAN_AMOUNT = 1000;
  const MAX_LOANS = 3;

  // ---------------------------------------------------------------------------
  // Tiny event bus
  // ---------------------------------------------------------------------------
  const listeners = {};
  const bus = {
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => bus.off(evt, fn); },
    off(evt, fn) { listeners[evt] = (listeners[evt] || []).filter((f) => f !== fn); },
    emit(evt, data) { (listeners[evt] || []).slice().forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); },
  };

  function defaults() {
    return {
      version: 2,
      balance: START_BALANCE,
      debt: 0,
      loanCount: 0,
      xp: 0,
      level: 1,
      settings: { sound: true, fx: true, lang: (NC.i18n && NC.i18n.lang) || "fr" },
      lastBets: {},
      stats: {},          // per game: { rounds, wins, losses, pushes, wagered, returned, best }
      escrow: {},         // chips sitting at a table (poker) — returned on reload
      createdAt: Date.now(),
    };
  }

  let state = defaults();

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------
  function isInt(n) { return typeof n === "number" && Number.isFinite(n) && Math.floor(n) === n; }

  function sanitize(data) {
    const d = defaults();
    if (!data || typeof data !== "object") return d;
    if (isInt(data.balance) && data.balance >= 0) d.balance = data.balance;
    if (isInt(data.debt) && data.debt >= 0) d.debt = data.debt;
    if (isInt(data.loanCount) && data.loanCount >= 0) d.loanCount = Math.min(MAX_LOANS, data.loanCount);
    if (isInt(data.level) && data.level >= 1) d.level = data.level;
    if (typeof data.xp === "number" && data.xp >= 0) d.xp = Math.floor(data.xp);
    if (data.settings && typeof data.settings === "object") {
      d.settings.sound = data.settings.sound !== false;
      d.settings.fx = data.settings.fx !== false;
      if (data.settings.lang === "fr" || data.settings.lang === "tr") d.settings.lang = data.settings.lang;
    }
    if (data.lastBets && typeof data.lastBets === "object") d.lastBets = data.lastBets;
    if (data.stats && typeof data.stats === "object") d.stats = data.stats;
    if (data.escrow && typeof data.escrow === "object") d.escrow = data.escrow;
    if (isInt(data.createdAt)) d.createdAt = data.createdAt;
    return d;
  }

  function load() {
    let raw = null;
    try {
      raw = root.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Migrate progress from the original version of the casino.
        const legacy = root.localStorage.getItem(LEGACY_KEY);
        if (legacy) raw = legacy;
      }
    } catch (e) { /* storage blocked — play without persistence */ }
    if (raw) {
      try { state = sanitize(JSON.parse(raw)); } catch (e) { state = defaults(); }
    }
    // Chips left at the poker table (page closed mid-session) go back to the wallet.
    let restored = 0;
    for (const k of Object.keys(state.escrow)) {
      const v = state.escrow[k];
      if (isInt(v) && v > 0) restored += v;
    }
    state.escrow = {};
    if (restored > 0) state.balance += restored;
    save();
    return { restored };
  }

  let saveQueued = false;
  function save() {
    try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function saveSoon() {
    if (saveQueued) return;
    saveQueued = true;
    setTimeout(() => { saveQueued = false; save(); }, 50);
  }

  function reset() {
    const settings = state.settings;
    state = defaults();
    state.settings = settings;
    save();
    bus.emit("balance", { balance: state.balance, delta: 0 });
    bus.emit("progress", progress.info());
    bus.emit("debt", state.debt);
  }

  // ---------------------------------------------------------------------------
  // Wallet
  // ---------------------------------------------------------------------------
  const wallet = {
    get balance() { return state.balance; },
    get debt() { return state.debt; },
    get loanCount() { return state.loanCount; },
    LOAN_AMOUNT, MAX_LOANS,

    /** Validates a raw bet (string/number). Returns {ok, value, error}. */
    validate(raw, opts) {
      const min = (opts && opts.min) || 1;
      const s = String(raw == null ? "" : raw).trim().replace(/\s/g, "");
      if (!/^\d+$/.test(s)) return { ok: false, error: NC.t("Mise invalide : entrez un nombre entier.") };
      const v = parseInt(s, 10);
      if (!isInt(v) || v < min) return { ok: false, error: NC.t("Mise minimum : {v}", { v: NC.util.money(min) }) };
      if (v > state.balance) return { ok: false, error: NC.t("Solde insuffisant pour cette mise.") };
      return { ok: true, value: v };
    },

    /** Removes credits for a bet. Returns false (and changes nothing) if invalid. */
    debit(amount, gameId) {
      if (!isInt(amount) || amount < 1 || amount > state.balance) return false;
      state.balance -= amount;
      const st = stats.get(gameId);
      st.wagered += amount;
      saveSoon();
      bus.emit("balance", { balance: state.balance, delta: -amount });
      return true;
    },

    /** Adds credits (payout/refund). */
    credit(amount, gameId, kind) {
      if (!isInt(amount) || amount <= 0) return false;
      state.balance += amount;
      if (gameId && kind !== "refund") stats.get(gameId).returned += amount;
      if (kind === "refund" && gameId) stats.get(gameId).wagered = Math.max(0, stats.get(gameId).wagered - amount);
      saveSoon();
      bus.emit("balance", { balance: state.balance, delta: amount });
      return true;
    },

    /** Chips sitting at a table survive a page reload (returned on load). */
    setEscrow(key, amount) {
      if (amount > 0) state.escrow[key] = Math.floor(amount);
      else delete state.escrow[key];
      save();
    },

    takeLoan() {
      if (state.loanCount >= MAX_LOANS) return { ok: false, error: NC.t("Limite de prêts atteinte (3/3).") };
      state.loanCount++;
      state.debt += LOAN_AMOUNT;
      state.balance += LOAN_AMOUNT;
      save();
      bus.emit("balance", { balance: state.balance, delta: LOAN_AMOUNT });
      bus.emit("debt", state.debt);
      return { ok: true };
    },

    /** Repay `amount` (default: everything). Partial repayment allowed. */
    repay(amount) {
      if (state.debt <= 0) return { ok: false, error: NC.t("Aucune dette.") };
      const pay = Math.min(state.debt, amount == null ? state.debt : Math.floor(amount));
      if (pay <= 0 || pay > state.balance) return { ok: false, error: NC.t("Fonds insuffisants.") };
      state.balance -= pay;
      state.debt -= pay;
      if (state.debt === 0) state.loanCount = 0; // full repayment re-opens the credit line
      save();
      bus.emit("balance", { balance: state.balance, delta: -pay });
      bus.emit("debt", state.debt);
      return { ok: true, paid: pay };
    },

    /** Original rule kept: debt is auto-collected once the balance reaches 2× the debt. */
    checkAutoRepay() {
      if (state.debt > 0 && state.balance >= state.debt * 2) {
        const paid = state.debt;
        wallet.repay();
        bus.emit("autorepay", paid);
      }
    },
  };

  // ---------------------------------------------------------------------------
  // Progression (XP / levels) — threshold kept from the original: level × 500
  // ---------------------------------------------------------------------------
  const progress = {
    xpNeeded(level) { return level * 500; },
    info() {
      return { level: state.level, xp: state.xp, next: progress.xpNeeded(state.level) };
    },
    add(amount) {
      const gain = Math.max(0, Math.floor(amount));
      if (!gain) return;
      state.xp += gain;
      const ups = [];
      // while (not if): a big gain can grant several levels at once
      while (state.xp >= progress.xpNeeded(state.level)) {
        state.xp -= progress.xpNeeded(state.level);
        state.level++;
        const reward = state.level * 250;
        state.balance += reward;
        ups.push({ level: state.level, reward });
      }
      saveSoon();
      bus.emit("progress", progress.info());
      if (ups.length) {
        bus.emit("balance", { balance: state.balance, delta: ups.reduce((s, u) => s + u.reward, 0) });
        bus.emit("levelup", ups[ups.length - 1]);
      }
    },
  };

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------
  const stats = {
    get(gameId) {
      const id = gameId || "misc";
      if (!state.stats[id]) state.stats[id] = { rounds: 0, wins: 0, losses: 0, pushes: 0, wagered: 0, returned: 0, best: 0 };
      return state.stats[id];
    },
    all() { return state.stats; },
  };

  // ---------------------------------------------------------------------------
  // Round — one bet, settled exactly once.
  // ---------------------------------------------------------------------------
  class Round {
    constructor(gameId, stake) {
      this.gameId = gameId;
      this.stake = stake;
      this.settled = false;
    }
    /** Add to the stake mid-round (double down, split, raise...). */
    addStake(amount) {
      if (this.settled) return false;
      if (!wallet.debit(amount, this.gameId)) return false;
      this.stake += amount;
      return true;
    }
    /**
     * Pays `payout` (total returned, stake included). Returns net result.
     * Calling twice does nothing the second time.
     */
    settle(payout) {
      if (this.settled) return null;
      this.settled = true;
      payout = Math.max(0, Math.floor(payout || 0));
      if (payout > 0) wallet.credit(payout, this.gameId);
      const net = payout - this.stake;
      const st = stats.get(this.gameId);
      st.rounds++;
      if (net > 0) st.wins++;
      else if (net < 0) st.losses++;
      else st.pushes++;
      if (net > st.best) st.best = net;
      // XP: for playing (based on stake) + bonus for winning.
      const xp = 10 + Math.min(400, Math.floor(this.stake / 100)) + (net > 0 ? Math.min(600, Math.floor(net / 50)) : 0);
      progress.add(xp);
      wallet.checkAutoRepay();
      save();
      bus.emit("round", { gameId: this.gameId, stake: this.stake, payout, net });
      return net;
    }
  }

  /** Starts a round: validates & debits the bet. Returns a Round or null. */
  function startRound(gameId, amount) {
    if (!wallet.debit(amount, gameId)) return null;
    return new Round(gameId, amount);
  }

  const settings = {
    sound() { return state.settings.sound; },
    fx() { return state.settings.fx; },
    /** Optional effects (particles, ambient decor). Core game animations always run. */
    reducedFx() { return !state.settings.fx; },
    lang() { return state.settings.lang; },
    set(key, val) { state.settings[key] = key === "lang" ? val : !!val; save(); bus.emit("settings", state.settings); },
  };

  function lastBet(gameId, fallback) {
    const v = state.lastBets[gameId];
    return isInt(v) && v > 0 ? v : fallback;
  }
  function rememberBet(gameId, v) {
    state.lastBets[gameId] = v;
    saveSoon();
  }

  NC.bus = bus;
  NC.store = { load, save, reset, get state() { return state; }, START_BALANCE, lastBet, rememberBet, _sanitize: sanitize };
  NC.wallet = wallet;
  NC.progress = progress;
  NC.stats = stats;
  NC.settings = settings;
  NC.Round = Round;
  NC.startRound = startRound;
})(typeof window !== "undefined" ? window : globalThis);
