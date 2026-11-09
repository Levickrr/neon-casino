/* =============================================================================
   CARD LOGIC — shared by Blackjack, Baccarat and Poker (pure, DOM-free)
============================================================================= */
(function (root) {
  "use strict";
  const NC = (root.NC = root.NC || {});
  const SUITS = ["S", "H", "D", "C"];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

  function createDeck() {
    const deck = [];
    for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
    return deck;
  }

  /** A shoe of `decks` shuffled decks. */
  function createShoe(decks) {
    let shoe = [];
    for (let i = 0; i < decks; i++) shoe = shoe.concat(createDeck());
    return NC.util.shuffle(shoe);
  }

  /** Blackjack hand value with soft-ace handling. */
  function bjValue(hand) {
    let total = 0;
    let aces = 0;
    for (const c of hand) {
      if (c.r === "A") { aces++; total += 11; }
      else if (c.r === "J" || c.r === "Q" || c.r === "K") total += 10;
      else total += parseInt(c.r, 10);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total, soft: aces > 0 };
  }

  function bjCardValue(c) {
    if (c.r === "A") return 11;
    if (c.r === "J" || c.r === "Q" || c.r === "K") return 10;
    return parseInt(c.r, 10);
  }

  /** Baccarat point value of a card (10/J/Q/K = 0, A = 1). */
  function bacValue(c) {
    if (c.r === "A") return 1;
    if (c.r === "10" || c.r === "J" || c.r === "Q" || c.r === "K") return 0;
    return parseInt(c.r, 10);
  }

  NC.cards = { SUITS, RANKS, createDeck, createShoe, bjValue, bjCardValue, bacValue };
})(typeof window !== "undefined" ? window : globalThis);
