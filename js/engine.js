/* LIFT LINE — pure rules for the ski-lift climbing card game.
 *
 * All rules live here. Every exported operation is deterministic over one
 * plain JSON-serializable state object. No DOM, timers, Date, Math.random, or
 * imports. The seeded shuffle threads its RNG state through the game state so
 * every phone can replay the same match exactly.
 *
 * Cards are rank+suit strings ("3S", "TH", "AC"). Rank climbs 3…A…2.
 * Moves are { type:'play', cards:[...] }, { type:'pass' },
 * { type:'exchange', card:'...' }, or { type:'nextRound' }.
 */

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = ['3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A', '2'];
export const MATCH_TARGET = 7;

export const rankOf = (card) => card[0];
export const suitOf = (card) => card[1];
export const rankValue = (cardOrRank) => RANKS.indexOf(cardOrRank.length === 1 ? cardOrRank : rankOf(cardOrRank));

export function titlesFor(numPlayers) {
  return numPlayers === 3
    ? ['First Chair', 'Chairlift', 'T-Bar']
    : ['First Chair', 'Gondola', 'Chairlift', 'T-Bar'];
}

function rngNext(s) {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, s };
}

function shuffle(input, rngState) {
  const cards = input.slice();
  let rng = rngState;
  for (let i = cards.length - 1; i > 0; i--) {
    const next = rngNext(rng);
    rng = next.s;
    const j = Math.floor(next.value * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return { cards, rng };
}

function deck52() {
  const deck = [];
  for (const rank of RANKS) for (const suit of SUITS) deck.push(rank + suit);
  return deck;
}

function deal(numPlayers, rngState) {
  const mixed = shuffle(deck52(), rngState);
  const hands = Array.from({ length: numPlayers }, () => []);
  mixed.cards.forEach((card, i) => hands[i % numPlayers].push(card));
  return { hands, rng: mixed.rng };
}

function cloneHands(hands) {
  return hands.map((hand) => hand.slice());
}

function activePlayers(state) {
  const finished = new Set(state.finishOrder);
  const active = [];
  for (let p = 0; p < state.numPlayers; p++) if (!finished.has(p)) active.push(p);
  return active;
}

function nextActive(state, after) {
  const active = new Set(activePlayers(state));
  for (let step = 1; step <= state.numPlayers; step++) {
    const p = (after + step) % state.numPlayers;
    if (active.has(p)) return p;
  }
  return after;
}

function combinations(cards, size, start = 0, prefix = [], out = []) {
  if (prefix.length === size) {
    out.push(prefix.slice());
    return out;
  }
  for (let i = start; i <= cards.length - (size - prefix.length); i++) {
    prefix.push(cards[i]);
    combinations(cards, size, i + 1, prefix, out);
    prefix.pop();
  }
  return out;
}

function sameCards(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const aa = a.slice().sort();
  const bb = b.slice().sort();
  return aa.every((card, i) => card === bb[i]);
}

function sameMove(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === 'play') return sameCards(a.cards, b.cards);
  if (a.type === 'exchange') return a.card === b.card;
  return true;
}

function scoreRound(state, finishOrder) {
  const scores = state.scores.slice();
  scores[finishOrder[0]] += 2;
  // The Chairlift earns one point. In a four-seat line, Gondola is second
  // and Chairlift is third, exactly matching the named pecking order.
  const chairliftIndex = state.numPlayers === 3 ? 1 : 2;
  scores[finishOrder[chairliftIndex]] += 1;
  return scores;
}

function endRound(state, finishOrder, hands, lastAction) {
  const scores = scoreRound(state, finishOrder);
  const high = Math.max(...scores);
  const firstChair = finishOrder[0];
  const matchWinner = high >= MATCH_TARGET
    ? (scores[firstChair] === high ? firstChair : scores.indexOf(high))
    : null;
  const rankByPlayer = new Array(state.numPlayers);
  finishOrder.forEach((player, index) => { rankByPlayer[player] = index; });
  return {
    ...state,
    hands,
    scores,
    finishOrder,
    rankByPlayer,
    phase: matchWinner === null ? 'roundOver' : 'matchOver',
    currentPlayer: firstChair,
    matchWinner,
    pile: null,
    lastPlayerToPlay: null,
    passesSincePlay: 0,
    lastAction,
  };
}

function startRound(state) {
  const dealt = deal(state.numPlayers, state.rng);
  const firstChair = state.finishOrder[0];
  const tBar = state.finishOrder[state.finishOrder.length - 1];
  const hands = cloneHands(dealt.hands);
  let best = hands[tBar][0];
  for (const card of hands[tBar]) if (rankValue(card) > rankValue(best)) best = card;
  hands[tBar].splice(hands[tBar].indexOf(best), 1);
  hands[firstChair].push(best);
  return {
    ...state,
    rng: dealt.rng,
    hands,
    round: state.round + 1,
    phase: 'exchange',
    currentPlayer: firstChair,
    finishOrder: [],
    pile: null,
    lastPlayerToPlay: null,
    passesSincePlay: 0,
    pendingExchange: { firstChair, tBar, gift: best },
    matchWinner: null,
    lastAction: { type: 'gift', player: tBar, to: firstChair, card: best },
  };
}

export function createInitialState(options = {}) {
  const numPlayers = options.numPlayers ?? 3;
  if (!Number.isInteger(numPlayers) || (numPlayers !== 3 && numPlayers !== 4)) {
    throw new Error('numPlayers must be 3 or 4');
  }
  const seed = (options.seed ?? 1) | 0;
  const dealt = deal(numPlayers, seed);
  return {
    version: 1,
    seed,
    rng: dealt.rng,
    numPlayers,
    round: 1,
    target: MATCH_TARGET,
    hands: dealt.hands,
    scores: new Array(numPlayers).fill(0),
    rankByPlayer: Array.from({ length: numPlayers }, (_, i) => i),
    phase: 'playing',
    currentPlayer: 0,
    finishOrder: [],
    pile: null,
    lastPlayerToPlay: null,
    passesSincePlay: 0,
    pendingExchange: null,
    matchWinner: null,
    lastAction: null,
  };
}

export function legalMoves(state) {
  if (state.phase === 'matchOver') return [];
  if (state.phase === 'roundOver') return [{ type: 'nextRound' }];
  if (state.phase === 'exchange') {
    return state.hands[state.currentPlayer].map((card) => ({ type: 'exchange', card }));
  }
  if (state.phase !== 'playing') return [];

  const byRank = new Map();
  for (const card of state.hands[state.currentPlayer]) {
    const rank = rankOf(card);
    if (!byRank.has(rank)) byRank.set(rank, []);
    byRank.get(rank).push(card);
  }
  const moves = [];
  for (const rank of RANKS) {
    const cards = byRank.get(rank) || [];
    if (!cards.length) continue;
    if (state.pile) {
      if (rankValue(rank) <= rankValue(state.pile.rank) || cards.length < state.pile.count) continue;
      for (const set of combinations(cards, state.pile.count)) moves.push({ type: 'play', cards: set });
    } else {
      for (let size = 1; size <= cards.length; size++) {
        for (const set of combinations(cards, size)) moves.push({ type: 'play', cards: set });
      }
    }
  }
  if (state.pile) moves.push({ type: 'pass' });
  return moves;
}

export function applyMove(state, move) {
  const legal = legalMoves(state);
  if (!legal.some((candidate) => sameMove(candidate, move))) {
    throw new Error('Illegal move: ' + JSON.stringify(move));
  }
  if (move.type === 'nextRound') return startRound(state);
  if (move.type === 'exchange') return applyExchange(state, move);
  if (move.type === 'pass') return applyPass(state);
  return applyPlay(state, move);
}

function applyExchange(state, move) {
  const { firstChair, tBar, gift } = state.pendingExchange;
  const hands = cloneHands(state.hands);
  hands[firstChair].splice(hands[firstChair].indexOf(move.card), 1);
  hands[tBar].push(move.card);
  return {
    ...state,
    hands,
    phase: 'playing',
    currentPlayer: firstChair,
    pendingExchange: null,
    lastAction: { type: 'exchange', player: firstChair, to: tBar, card: move.card, gift },
  };
}

function applyPlay(state, move) {
  const player = state.currentPlayer;
  const hands = cloneHands(state.hands);
  for (const card of move.cards) hands[player].splice(hands[player].indexOf(card), 1);
  const rank = rankOf(move.cards[0]);
  let finishOrder = state.finishOrder.slice();
  if (hands[player].length === 0) finishOrder.push(player);

  const remaining = [];
  const finished = new Set(finishOrder);
  for (let p = 0; p < state.numPlayers; p++) if (!finished.has(p)) remaining.push(p);
  const lastAction = { type: 'play', player, cards: move.cards.slice(), rank, count: move.cards.length };
  if (remaining.length === 1) {
    finishOrder.push(remaining[0]);
    return endRound(state, finishOrder, hands, lastAction);
  }

  const clears = rank === '2';
  const partial = {
    ...state,
    hands,
    finishOrder,
    pile: clears ? null : { rank, count: move.cards.length, cards: move.cards.slice() },
    lastPlayerToPlay: clears ? null : player,
    passesSincePlay: 0,
    lastAction: { ...lastAction, cleared: clears },
  };
  return {
    ...partial,
    currentPlayer: clears && hands[player].length > 0 ? player : nextActive(partial, player),
  };
}

function applyPass(state) {
  const player = state.currentPlayer;
  const active = activePlayers(state);
  const passes = state.passesSincePlay + 1;
  const leaderIsActive = active.includes(state.lastPlayerToPlay);
  const clear = passes >= active.length - (leaderIsActive ? 1 : 0);
  if (clear) {
    const leader = state.lastPlayerToPlay;
    const finished = new Set(state.finishOrder);
    return {
      ...state,
      pile: null,
      lastPlayerToPlay: null,
      passesSincePlay: 0,
      currentPlayer: finished.has(leader) ? nextActive(state, leader) : leader,
      lastAction: { type: 'pass', player, cleared: true },
    };
  }
  return {
    ...state,
    passesSincePlay: passes,
    currentPlayer: nextActive(state, player),
    lastAction: { type: 'pass', player, cleared: false },
  };
}

export function getStatus(state) {
  return {
    over: state.phase === 'matchOver',
    phase: state.phase,
    turn: state.phase === 'matchOver' ? null : state.currentPlayer,
    winner: state.matchWinner,
    round: state.round,
    finishOrder: state.finishOrder.slice(),
    scores: state.scores.slice(),
  };
}
