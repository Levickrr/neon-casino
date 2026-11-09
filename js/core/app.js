/* =============================================================================
   NEON CASINO — APP SHELL
   Game registry, lobby (cards + filters), game overlay navigation, header
   wallet / XP / bank / profile panels.

   A game module registers itself with:
     NC.registerGame({
       id, title, tagline, category, badge, payout, art (SVG/HTML string),
       mount(area, scope),   // render + start; scope owns timers/listeners
       canLeave(),           // optional: string warning if leaving forfeits
       leave(),              // optional: settle/clean before unmount
     })
============================================================================= */
(function (root) {
  "use strict";
  const NC = (root.NC = root.NC || {});
  const { $, $$, money, fmt, escapeHtml, Scope } = NC.util;

  const games = NC.registry.list;
  const byId = NC.registry.byId;

  const ORDER = ["blackjack", "roulette", "slots", "crash", "mines", "plinko", "dice", "coinflip", "poker", "okey", "baccarat"];
  const CATEGORIES = [
    { id: "all", label: "Tous les jeux" },
    { id: "cards", label: "Cartes" },
    { id: "table", label: "Table" },
    { id: "instant", label: "Instantané" },
    { id: "new", label: "Nouveautés" },
  ];

  let current = null; // { def, scope }
  let filter = "all";

  // ---------------------------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------------------------
  function renderLobby() {
    const grid = $("#games-grid");
    const tabs = $("#filter-tabs");
    tabs.innerHTML = CATEGORIES.map((c) => {
      const n = c.id === "all" ? games.length : games.filter((g) => matches(g, c.id)).length;
      return `<button class="tab${c.id === filter ? " is-active" : ""}" data-filter="${c.id}" role="tab" aria-selected="${c.id === filter}">${NC.t(c.label)}<span class="tab__n">${n}</span></button>`;
    }).join("");
    const list = ORDER.map((id) => byId[id]).filter(Boolean);
    grid.innerHTML = list.map((g, i) => `
      <article class="gcard gcard--${g.id}${matches(g, filter) ? "" : " is-hidden"}" data-open="${g.id}" tabindex="0" role="button"
        aria-label="${NC.t("Jouer à {g}", { g: escapeHtml(g.title) })}" style="--i:${i}; --accent:${g.accent}; --accent2:${g.accent2}">
        <div class="gcard__glow"></div>
        <div class="gcard__art">${g.art}</div>
        <div class="gcard__body">
          <div class="gcard__meta">
            <span class="chip-badge">${escapeHtml(g.badge)}</span>
            ${g.isNew ? `<span class="chip-badge chip-badge--new">${NC.t("NOUVEAU")}</span>` : ""}
          </div>
          <h3 class="gcard__title">${escapeHtml(g.title)}</h3>
          <p class="gcard__desc">${escapeHtml(g.tagline)}</p>
          <div class="gcard__foot">
            <span class="gcard__payout"><small>${NC.t("Gain")}</small>${escapeHtml(g.payout)}</span>
            <span class="gcard__play">${NC.t("Jouer")} <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
          </div>
        </div>
      </article>`).join("");
    $("#stat-games").textContent = games.length;
  }
  function matches(g, f) {
    if (f === "all") return true;
    if (f === "new") return !!g.isNew;
    return g.category === f;
  }
  function setFilter(f) {
    filter = f;
    $$("#filter-tabs .tab").forEach((t) => {
      const on = t.dataset.filter === f;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on);
    });
    $$("#games-grid .gcard").forEach((c) => c.classList.toggle("is-hidden", !matches(byId[c.dataset.open], f)));
  }

  // 3D tilt on game cards (pointer devices only)
  function bindTilt() {
    const grid = $("#games-grid");
    grid.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || NC.settings.reducedFx()) return;
      const card = e.target.closest(".gcard");
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty("--rx", (-py * 8).toFixed(2) + "deg");
      card.style.setProperty("--ry", (px * 10).toFixed(2) + "deg");
      card.style.setProperty("--mx", ((px + 0.5) * 100).toFixed(1) + "%");
      card.style.setProperty("--my", ((py + 0.5) * 100).toFixed(1) + "%");
    });
    grid.addEventListener("pointerout", (e) => {
      const card = e.target.closest(".gcard");
      if (card && !card.contains(e.relatedTarget)) {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Game overlay
  // ---------------------------------------------------------------------------
  function openGame(id) {
    const def = byId[id];
    if (!def) return;
    if (current) unmountCurrent();
    const overlay = $("#game-overlay");
    $("#game-title").textContent = def.title;
    $("#game-sub").textContent = def.tagline;
    $("#game-icon").innerHTML = def.icon || "";
    overlay.style.setProperty("--accent", def.accent);
    overlay.style.setProperty("--accent2", def.accent2);
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    $("#game-rules-btn").hidden = !def.rules;
    const area = $("#game-area");
    area.innerHTML = "";
    area.className = "game-area game-area--" + id;
    const scope = new Scope();
    current = { def, scope };
    try {
      def.mount(area, scope);
    } catch (e) {
      console.error(e);
      area.innerHTML = `<p class="muted">${NC.t("Erreur lors du chargement du jeu.")}</p>`;
    }
    NC.audio.play("click");
    if (location.hash !== "#" + id) history.pushState({ game: id }, "", "#" + id);
  }

  function unmountCurrent() {
    if (!current) return;
    const { def, scope } = current;
    try { if (def.leave) def.leave(); } catch (e) { console.error(e); }
    scope.dispose();
    current = null;
    $("#game-area").innerHTML = "";
  }

  async function closeGame(fromHistory, force) {
    if (!current) return;
    const warn = !force && current.def.canLeave ? current.def.canLeave() : null;
    if (warn) {
      const ok = await NC.ui.confirm(NC.t("Quitter la partie ?"), warn, NC.t("Quitter"), NC.t("Continuer à jouer"));
      if (!ok) {
        if (fromHistory) history.pushState({ game: current.def.id }, "", "#" + current.def.id);
        return;
      }
    }
    unmountCurrent();
    const overlay = $("#game-overlay");
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
    if (!fromHistory && location.hash) history.pushState({}, "", location.pathname + location.search);
  }

  function showRules() {
    if (!current || !current.def.rules) return;
    const rules = typeof current.def.rules === "function" ? current.def.rules() : current.def.rules;
    NC.ui.modal({ title: NC.t("Règles — {g}", { g: current.def.title }), body: `<div class="rules">${rules}</div>`, wide: true, actions: [{ label: NC.t("Compris"), value: "ok", cls: "btn--primary" }] });
  }

  // ---------------------------------------------------------------------------
  // Header: balance tween, XP, debt
  // ---------------------------------------------------------------------------
  let shownBalance = 0;
  let balAnim = 0;
  function renderBalance(animate) {
    const target = NC.wallet.balance;
    const els = $$("[data-balance]");
    cancelAnimationFrame(balAnim);
    if (!animate || NC.settings.reducedFx()) {
      shownBalance = target;
      els.forEach((e) => (e.textContent = fmt(target)));
      return;
    }
    const from = shownBalance;
    const t0 = performance.now();
    const dur = 700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      shownBalance = Math.round(from + (target - from) * e);
      els.forEach((el) => (el.textContent = fmt(shownBalance)));
      if (k < 1) balAnim = requestAnimationFrame(step);
    };
    balAnim = requestAnimationFrame(step);
  }
  function onBalance({ delta }) {
    renderBalance(true);
    if (delta) {
      $$(".wallet-pill").forEach((p) => {
        p.classList.remove("is-up", "is-down");
        void p.offsetWidth;
        p.classList.add(delta > 0 ? "is-up" : "is-down");
      });
      const pill = $(".wallet-pill");
      if (pill && pill.offsetParent && Math.abs(delta) > 0) {
        const r = pill.getBoundingClientRect();
        const d = document.createElement("span");
        d.className = "wallet-delta " + (delta > 0 ? "is-up" : "is-down");
        d.textContent = (delta > 0 ? "+" : "−") + fmt(Math.abs(delta));
        d.style.left = r.left + r.width / 2 + "px";
        d.style.top = r.bottom + 4 + "px";
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 1300);
      }
    }
    renderBankButton();
  }
  function renderProgress() {
    const { level, xp, next } = NC.progress.info();
    const pct = Math.min(100, (xp / next) * 100);
    $$("[data-level]").forEach((e) => (e.textContent = level));
    $$("[data-xp-fill]").forEach((e) => (e.style.width = pct + "%"));
    $$("[data-xp-ring]").forEach((e) => e.style.setProperty("--p", pct.toFixed(1)));
    $$("[data-xp-text]").forEach((e) => (e.textContent = `${fmt(xp)} / ${fmt(next)} XP`));
  }
  function renderBankButton() {
    const debt = NC.wallet.debt;
    $$("[data-debt]").forEach((e) => (e.textContent = fmt(debt)));
    $$(".debt-flag").forEach((e) => (e.hidden = debt <= 0));
  }
  function renderSettings() {
    const s = NC.store.state.settings;
    const sb = $("#sound-btn");
    const fb = $("#fx-btn");
    sb.classList.toggle("is-off", !s.sound);
    sb.setAttribute("aria-pressed", s.sound);
    sb.title = s.sound ? NC.t("Son activé") : NC.t("Son coupé");
    fb.classList.toggle("is-off", !s.fx);
    fb.setAttribute("aria-pressed", s.fx);
    fb.title = s.fx ? NC.t("Effets activés") : NC.t("Effets réduits");
    document.documentElement.classList.toggle("reduce-fx", NC.settings.reducedFx());
  }

  // ---------------------------------------------------------------------------
  // Bank panel (loans / repayments / reset) & profile panel
  // ---------------------------------------------------------------------------
  function bankBody() {
    const w = NC.wallet;
    return `
      <div class="bank">
        <div class="bank__row">
          <div class="bank__stat"><span class="lbl">${NC.t("Solde")}</span><strong class="num neon-green">${money(w.balance)}</strong></div>
          <div class="bank__stat"><span class="lbl">${NC.t("Dette")}</span><strong class="num ${w.debt ? "neon-red" : ""}">${money(w.debt)}</strong></div>
          <div class="bank__stat"><span class="lbl">${NC.t("Prêts")}</span><strong class="num">${w.loanCount}/${w.MAX_LOANS}</strong></div>
        </div>
        <p class="muted small">${NC.t("Prêt de {v} (3 maximum). La dette est prélevée automatiquement dès que votre solde atteint le double de la dette. Remboursement partiel ou total possible.", { v: money(w.LOAN_AMOUNT) })}</p>
        <div class="bank__actions">
          <button class="btn btn--primary" data-bank="loan" ${w.loanCount >= w.MAX_LOANS ? "disabled" : ""}>${NC.t("Emprunter {v}", { v: money(w.LOAN_AMOUNT) })}</button>
          <button class="btn btn--ghost" data-bank="repay" ${w.debt <= 0 || w.balance <= 0 ? "disabled" : ""}>${w.balance >= w.debt ? NC.t("Tout rembourser") : NC.t("Rembourser {v}", { v: money(Math.min(w.balance, w.debt)) })}</button>
        </div>
        <div class="bank__danger">
          <div><strong>${NC.t("Recommencer à zéro")}</strong><p class="muted small">${NC.t("Remet le solde à {v}, efface dette, niveaux et statistiques.", { v: money(NC.store.START_BALANCE) })}</p></div>
          <button class="btn btn--danger btn--sm" data-bank="reset">${NC.t("Réinitialiser")}</button>
        </div>
        <p class="disclaimer">${NC.t("Crédits 100 % virtuels — aucune valeur réelle, aucun dépôt ni retrait possible.")}</p>
      </div>`;
  }
  function openBank() {
    NC.ui.modal({
      title: NC.t("Banque virtuelle"),
      body: bankBody(),
      onMount(wrap) {
        wrap.addEventListener("click", async (e) => {
          const b = e.target.closest("[data-bank]");
          if (!b) return;
          const kind = b.dataset.bank;
          if (kind === "loan") {
            const r = NC.wallet.takeLoan();
            NC.ui.toast(r.ok ? NC.t("Prêt accordé : +{v}", { v: money(NC.wallet.LOAN_AMOUNT) }) : r.error, r.ok ? "success" : "error");
            if (r.ok) NC.audio.play("chip");
          } else if (kind === "repay") {
            const amt = Math.min(NC.wallet.balance, NC.wallet.debt);
            const r = NC.wallet.repay(amt);
            NC.ui.toast(r.ok ? NC.t("Remboursé : {v}", { v: money(r.paid) }) : r.error, r.ok ? "success" : "error");
          } else if (kind === "reset") {
            const ok = await NC.ui.confirm(NC.t("Tout réinitialiser ?"), NC.t("Votre progression (solde, niveau, statistiques) sera effacée."), NC.t("Réinitialiser"));
            if (ok) {
              if (current) await closeGame(false, true);
              NC.store.reset();
              NC.ui.toast(NC.t("Nouveau départ : {v}", { v: money(NC.store.START_BALANCE) }), "success");
            }
            return;
          }
          const body = wrap.querySelector(".modal__body");
          if (body) body.innerHTML = bankBody();
        });
      },
    });
  }

  function openProfile() {
    const all = NC.stats.all();
    let wag = 0, ret = 0, rounds = 0, best = 0;
    const rows = ORDER.filter((id) => byId[id]).map((id) => {
      const s = all[id] || { rounds: 0, wins: 0, losses: 0, wagered: 0, returned: 0, best: 0 };
      wag += s.wagered; ret += s.returned; rounds += s.rounds; best = Math.max(best, s.best);
      const rate = s.rounds ? Math.round((s.wins / s.rounds) * 100) + " %" : "—";
      return `<tr><td>${escapeHtml(byId[id].title)}</td><td>${fmt(s.rounds)}</td><td>${rate}</td><td>${fmt(s.wagered)}</td><td class="${s.returned - s.wagered >= 0 ? "neon-green" : "neon-red"}">${s.rounds ? (s.returned - s.wagered >= 0 ? "+" : "−") + fmt(Math.abs(s.returned - s.wagered)) : "—"}</td></tr>`;
    }).join("");
    const { level, xp, next } = NC.progress.info();
    NC.ui.modal({
      title: NC.t("Profil joueur"),
      wide: true,
      body: `
        <div class="profile">
          <div class="profile__head">
            <div class="xp-ring xp-ring--lg" data-xp-ring style="--p:${((xp / next) * 100).toFixed(1)}"><span>${level}</span></div>
            <div>
              <div class="lbl">${NC.t("Niveau {n}", { n: level })}</div>
              <div class="num">${fmt(xp)} / ${fmt(next)} XP</div>
              <p class="muted small">${NC.t("Chaque niveau rapporte un bonus de niveau × 250 ₵.")}</p>
            </div>
          </div>
          <div class="bank__row">
            <div class="bank__stat"><span class="lbl">${NC.t("Parties")}</span><strong class="num">${fmt(rounds)}</strong></div>
            <div class="bank__stat"><span class="lbl">${NC.t("Total misé")}</span><strong class="num">${fmt(wag)}</strong></div>
            <div class="bank__stat"><span class="lbl">${NC.t("Meilleur gain")}</span><strong class="num neon-green">${fmt(best)}</strong></div>
          </div>
          <div class="table-wrap"><table class="stats-table"><thead><tr><th>${NC.t("Jeu")}</th><th>${NC.t("Parties")}</th><th>${NC.t("Victoires")}</th><th>${NC.t("Misé")}</th><th>${NC.t("Net")}</th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>`,
    });
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function boot() {
    const { restored } = NC.store.load();
    NC.i18n.setLang(NC.settings.lang());
    document.documentElement.lang = NC.i18n.lang;
    NC.i18n.applyStatic();
    NC.fx.init();
    renderLobby();
    bindTilt();
    renderBalance(false);
    renderProgress();
    renderBankButton();
    renderSettings();

    NC.bus.on("balance", onBalance);
    NC.bus.on("progress", renderProgress);
    NC.bus.on("debt", renderBankButton);
    NC.bus.on("settings", renderSettings);
    NC.bus.on("autorepay", (paid) => NC.ui.toast(NC.t("Dette de {v} prélevée sur vos gains", { v: money(paid) }), "info"));
    NC.bus.on("levelup", ({ level, reward }) => {
      NC.ui.toast(NC.t("Niveau {n} atteint ! Bonus +{v}", { n: level, v: money(reward) }), "level");
      NC.audio.play("levelup", 300);
      NC.fx.confetti($(".level-chip"), 140);
      const lc = $(".level-chip");
      if (lc) NC.fx.flash(lc, "is-levelup");
    });
    if (restored > 0) NC.ui.toast(NC.t("Jetons de table restitués : +{v}", { v: money(restored) }), "info");

    // Delegated navigation events
    document.addEventListener("click", (e) => {
      const open = e.target.closest("[data-open]");
      if (open) { openGame(open.dataset.open); return; }
      const f = e.target.closest("[data-filter]");
      if (f) { setFilter(f.dataset.filter); NC.audio.play("click"); return; }
      const nav = e.target.closest("[data-nav]");
      if (nav) {
        e.preventDefault();
        const k = nav.dataset.nav;
        if (current) closeGame();
        if (k === "bank") openBank();
        else if (k === "profile") openProfile();
        else {
          const t = document.getElementById(k);
          if (t) t.scrollIntoView({ behavior: NC.settings.reducedFx() ? "auto" : "smooth" });
        }
        $("#nav-menu").classList.remove("is-open");
        NC.audio.play("click");
      }
    });
    $("#games-grid").addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.dataset.open) { e.preventDefault(); openGame(e.target.dataset.open); }
    });
    $("#games-grid").addEventListener("pointerenter", (e) => { if (e.target.closest && e.target.closest(".gcard")) NC.audio.play("hover", 80); }, true);
    $("#game-close").addEventListener("click", () => closeGame());
    $("#game-rules-btn").addEventListener("click", showRules);
    $("#sound-btn").addEventListener("click", () => { NC.settings.set("sound", !NC.settings.sound()); NC.audio.play("click"); });
    $("#fx-btn").addEventListener("click", () => NC.settings.set("fx", !NC.settings.fx()));
    $("#menu-btn").addEventListener("click", () => $("#nav-menu").classList.toggle("is-open"));
    // Language switch (FR / TR): saved, then the page reloads in the new language.
    $$("[data-lang]").forEach((b) => b.classList.toggle("is-active", b.dataset.lang === NC.i18n.lang));
    document.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-lang]");
      if (!b || b.dataset.lang === NC.i18n.lang) return;
      if (current) {
        const warn = current.def.canLeave ? current.def.canLeave() : null;
        if (warn && !(await NC.ui.confirm(NC.t("Quitter la partie ?"), warn, NC.t("Quitter"), NC.t("Continuer à jouer")))) return;
        unmountCurrent();
      }
      NC.settings.set("lang", b.dataset.lang);
      NC.store.save();
      history.replaceState({}, "", location.pathname + location.search);
      location.reload();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "F4") {
        e.preventDefault();
        NC.wallet.credit(100000, null, "bonus");
        NC.audio.play("chip");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && current && !document.querySelector(".modal")) closeGame();
    });
    window.addEventListener("popstate", () => {
      const id = location.hash.slice(1);
      if (byId[id]) { if (!current || current.def.id !== id) openGame(id); }
      else if (current) closeGame(true);
    });
    window.addEventListener("beforeunload", () => {
      try { if (current && current.def.leave) current.def.leave(); } catch (e) { /* ignore */ }
      NC.store.save();
    });
    // Reveal-on-scroll
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } }), { threshold: 0.12 });
      $$(".reveal").forEach((el) => io.observe(el));
    } else $$(".reveal").forEach((el) => el.classList.add("is-in"));

    const initial = location.hash.slice(1);
    if (byId[initial]) openGame(initial);
    document.documentElement.classList.add("is-ready");
  }

  NC.app = { openGame, closeGame, get current() { return current; }, games: byId };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window);
