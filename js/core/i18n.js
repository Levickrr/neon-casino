/* =============================================================================
   NEON CASINO — LANGUAGES (Français / Türkçe)
   Strings are written in French in the code and wrapped in t("…").
   The Turkish dictionary (i18n-tr.js) maps each French string to Turkish.
   Placeholders: t("Gagné : {amount}", { amount: "100 ₵" }).
   Static HTML: elements with [data-i18n] are translated on boot (their
   original innerHTML is the key); [data-i18n-attr="aria-label,title"]
   translates attributes.
============================================================================= */
(function (root) {
  "use strict";
  const NC = (root.NC = root.NC || {});
  const dict = { tr: {} };
  const LANGS = ["fr", "tr"];

  function detect() {
    try {
      const raw = root.localStorage && root.localStorage.getItem("neon_casino_nextgen_v2");
      if (raw) {
        const l = JSON.parse(raw).settings && JSON.parse(raw).settings.lang;
        if (LANGS.includes(l)) return l;
      }
    } catch (e) { /* ignore */ }
    const nav = (root.navigator && root.navigator.language) || "fr";
    return nav.toLowerCase().startsWith("tr") ? "tr" : "fr";
  }
  let lang = detect();

  function t(s, vars) {
    let out = (lang !== "fr" && dict[lang][s]) || s;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return out;
  }
  /** Picks the right version of a long text block. */
  function pick(obj) { return obj[lang] || obj.fr; }

  function normalize(s) { return s.replace(/\s+/g, " ").trim(); }

  function applyStatic(scope) {
    if (lang === "fr") return;
    const rootEl = scope || root.document;
    rootEl.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = normalize(el.innerHTML);
      const tr = dict[lang][key];
      if (tr) el.innerHTML = tr;
    });
    rootEl.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.getAttribute("data-i18n-attr").split(",").forEach((a) => {
        const v = el.getAttribute(a.trim());
        if (v && dict[lang][normalize(v)]) el.setAttribute(a.trim(), dict[lang][normalize(v)]);
      });
    });
  }

  NC.i18n = {
    LANGS,
    t,
    pick,
    get lang() { return lang; },
    setLang(l) { if (LANGS.includes(l)) lang = l; },
    locale() { return lang === "tr" ? "tr-TR" : "fr-FR"; },
    add(l, obj) { Object.assign(dict[l], obj); },
    has(l, key) { return Object.prototype.hasOwnProperty.call(dict[l] || {}, key); },
    applyStatic,
    normalize,
  };
  NC.t = t;
})(typeof window !== "undefined" ? window : globalThis);
