/* =============================================================================
   NEON CASINO — GAME REGISTRY
   Loaded before the game modules so each one can register itself.
============================================================================= */
(function (root) {
  "use strict";
  const NC = (root.NC = root.NC || {});
  const list = [];
  const byId = {};
  NC.registry = { list, byId };
  NC.registerGame = function (def) {
    if (byId[def.id]) throw new Error("Duplicate game id: " + def.id);
    list.push(def);
    byId[def.id] = def;
  };
})(typeof window !== "undefined" ? window : globalThis);
