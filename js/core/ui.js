/* =============================================================================
   NEON CASINO — REUSABLE UI COMPONENTS
   Toasts, modals, bet controls, playing cards, result banners.
============================================================================= */
(function (root) {
  "use strict";
  const NC = (root.NC = root.NC || {});
  const { escapeHtml, money, fmt } = NC.util;

  // ---------------------------------------------------------------------------
  // Toasts
  // ---------------------------------------------------------------------------
  const ICONS = {
    success: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" /></svg>',
    error: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>',
    info: '<svg viewBox="0 0 24 24"><path d="M12 8v.01M12 11v6" /></svg>',
    level: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" /></svg>',
  };
  function toast(msg, type) {
    type = type || "info";
    const cont = document.getElementById("toast-container");
    if (!cont) return;
    const t = document.createElement("div");
    t.className = "toast toast--" + type;
    t.setAttribute("role", "status");
    t.innerHTML = `<span class="toast__icon">${ICONS[type] || ICONS.info}</span><span class="toast__msg">${escapeHtml(msg)}</span>`;
    cont.appendChild(t);
    while (cont.children.length > 4) cont.firstElementChild.remove();
    setTimeout(() => {
      t.classList.add("toast--out");
      setTimeout(() => t.remove(), 400);
    }, 3200);
    if (type === "error") NC.audio.play("error");
  }

  // ---------------------------------------------------------------------------
  // Modal — returns a Promise resolving to the clicked action value
  // ---------------------------------------------------------------------------
  let modalOpen = null;
  function modal({ title, body, actions, wide, onMount }) {
    if (modalOpen) modalOpen(null);
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.className = "modal" + (wide ? " modal--wide" : "");
      wrap.innerHTML = `
        <div class="modal__backdrop" data-modal-val=""></div>
        <div class="modal__panel glass" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || "")}">
          <button class="icon-btn modal__close" data-modal-val="" aria-label="${NC.t("Fermer")}">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          ${title ? `<h3 class="modal__title">${escapeHtml(title)}</h3>` : ""}
          <div class="modal__body">${body || ""}</div>
          ${actions && actions.length ? `<div class="modal__actions">${actions.map((a, i) => `<button class="btn ${a.cls || "btn--ghost"}" data-modal-val="${escapeHtml(a.value)}" ${i === actions.length - 1 ? "data-autofocus" : ""}>${escapeHtml(a.label)}</button>`).join("")}</div>` : ""}
        </div>`;
      document.body.appendChild(wrap);
      requestAnimationFrame(() => wrap.classList.add("modal--in"));
      const close = (val) => {
        modalOpen = null;
        document.removeEventListener("keydown", onKey);
        wrap.classList.remove("modal--in");
        setTimeout(() => wrap.remove(), 250);
        resolve(val);
      };
      const onKey = (e) => { if (e.key === "Escape") close(null); };
      document.addEventListener("keydown", onKey);
      wrap.addEventListener("click", (e) => {
        const b = e.target.closest("[data-modal-val]");
        if (!b) return;
        NC.audio.play("click");
        close(b.getAttribute("data-modal-val") || null);
      });
      modalOpen = close;
      const af = wrap.querySelector("[data-autofocus]");
      if (af) af.focus();
      if (onMount) onMount(wrap, close);
    });
  }
  function confirm(title, text, okLabel, cancelLabel) {
    return modal({
      title,
      body: `<p>${escapeHtml(text)}</p>`,
      actions: [
        { label: cancelLabel || NC.t("Annuler"), value: "no", cls: "btn--ghost" },
        { label: okLabel || NC.t("Confirmer"), value: "yes", cls: "btn--danger" },
      ],
    }).then((v) => v === "yes");
  }

  // ---------------------------------------------------------------------------
  // Bet control (shared by every game). Event handling is delegated once on
  // document, so re-rendering a game never stacks duplicate listeners.
  // ---------------------------------------------------------------------------
  function betControl(key, fallback, label) {
    const v = NC.store.lastBet(key, fallback || 100);
    return `
      <div class="bet-ctl" data-bet-key="${key}">
        <span class="lbl">${label || NC.t("Mise")}</span>
        <div class="bet-ctl__row">
          <button type="button" class="bet-ctl__op" data-bet-op="half" aria-label="${NC.t("Diviser la mise par deux")}">½</button>
          <div class="bet-ctl__field">
            <input class="bet-ctl__input" id="bet-${key}" type="text" inputmode="numeric" autocomplete="off" value="${v}" aria-label="${NC.t("Montant de la mise")}">
            <span class="bet-ctl__unit">₵</span>
          </div>
          <button type="button" class="bet-ctl__op" data-bet-op="double" aria-label="${NC.t("Doubler la mise")}">2×</button>
          <button type="button" class="bet-ctl__op" data-bet-op="max">MAX</button>
        </div>
      </div>`;
  }
  document.addEventListener("click", (e) => {
    const op = e.target.closest("[data-bet-op]");
    if (!op) return;
    const ctl = op.closest(".bet-ctl");
    const input = ctl && ctl.querySelector("input");
    if (!input || input.disabled) return;
    let v = parseInt(String(input.value).replace(/\D/g, ""), 10) || 0;
    const bal = NC.wallet.balance;
    const kind = op.getAttribute("data-bet-op");
    if (kind === "half") v = Math.max(1, Math.floor(v / 2));
    if (kind === "double") v = Math.max(1, Math.min(bal, v * 2));
    if (kind === "max") v = Math.max(1, bal);
    input.value = v;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    NC.audio.play("chip");
  });
  document.addEventListener("input", (e) => {
    if (!e.target.classList || !e.target.classList.contains("bet-ctl__input")) return;
    const clean = e.target.value.replace(/[^\d]/g, "").slice(0, 12);
    if (clean !== e.target.value) e.target.value = clean;
  });

  /** Reads + validates the bet. Returns an integer or null (after a toast). */
  function readBet(key, opts) {
    const input = document.getElementById("bet-" + key);
    if (!input) return null;
    const res = NC.wallet.validate(input.value, opts);
    if (!res.ok) {
      toast(res.error, "error");
      NC.fx.shake(input.closest(".bet-ctl"));
      return null;
    }
    NC.store.rememberBet(key, res.value);
    return res.value;
  }
  function lockBet(key, locked) {
    const ctl = document.querySelector(`.bet-ctl[data-bet-key="${key}"]`);
    if (!ctl) return;
    ctl.classList.toggle("is-locked", !!locked);
    ctl.querySelectorAll("input,button").forEach((el) => (el.disabled = !!locked));
  }

  // ---------------------------------------------------------------------------
  // Playing cards
  // ---------------------------------------------------------------------------
  const SUIT_SYM = { S: "♠", H: "♥", D: "♦", C: "♣" };
  function card(c, opts) {
    opts = opts || {};
    const delay = opts.delay ? ` style="animation-delay:${opts.delay}ms"` : "";
    const anim = opts.noAnim ? "" : " pcard--deal";
    const extra = opts.cls ? " " + opts.cls : "";
    if (!c || opts.hidden) {
      return `<div class="pcard pcard--back${anim}${extra}"${delay}><div class="pcard__backart"></div></div>`;
    }
    const red = c.s === "H" || c.s === "D";
    const sym = SUIT_SYM[c.s];
    return `<div class="pcard ${red ? "pcard--red" : "pcard--black"}${anim}${extra}"${delay} aria-label="${c.r}${sym}">
      <span class="pcard__corner pcard__corner--tl">${c.r}<i>${sym}</i></span>
      <span class="pcard__pip">${sym}</span>
      <span class="pcard__corner pcard__corner--br">${c.r}<i>${sym}</i></span>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // Result banner shown over a game area
  // ---------------------------------------------------------------------------
  function banner(host, type, title, sub, ms) {
    if (!host) return;
    const old = host.querySelector(".result-banner");
    if (old) old.remove();
    const b = document.createElement("div");
    b.className = "result-banner result-banner--" + type;
    b.innerHTML = `<div class="result-banner__title">${escapeHtml(title)}</div>${sub ? `<div class="result-banner__sub">${escapeHtml(sub)}</div>` : ""}`;
    host.appendChild(b);
    setTimeout(() => { b.classList.add("result-banner--out"); setTimeout(() => b.remove(), 400); }, ms || 2200);
  }

  /** Standard announcement of a settled round (toast + sound + fx). */
  function announce(net, payout, opts) {
    opts = opts || {};
    const target = opts.target;
    if (net > 0) {
      const big = opts.big || (opts.stake && payout >= opts.stake * 10);
      toast(opts.msg || NC.t("Gagné : +{v}", { v: money(net) }), "success");
      NC.audio.play(big ? "bigwin" : "win");
      NC.fx.floatText(target, "+" + fmt(net) + " ₵", "#2bff88");
      if (big) NC.fx.confetti(target, 160);
      else NC.fx.sparks(target, "#2bff88", 30);
    } else if (net === 0) {
      toast(opts.msg || NC.t("Égalité : mise rendue"), "info");
      NC.audio.play("push");
    } else {
      toast(opts.msg || NC.t("Perdu : {v}", { v: money(-net) }), "error");
      NC.audio.play("lose");
    }
  }

  NC.ui = { toast, modal, confirm, betControl, readBet, lockBet, card, banner, announce, SUIT_SYM };
})(typeof window !== "undefined" ? window : globalThis);
