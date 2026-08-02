// LIFT LINE engine tests — plain Node, no framework.
// Run: node scripts/test-engine.mjs

import {
  MATCH_TARGET, RANKS, applyMove, createInitialState, getStatus, legalMoves, rankOf,
} from '../js/engine.js';
import { chooseMove } from '../js/bot.js';

let passed = 0;
function t(condition, label) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed++;
  console.log(`  ok — ${label}`);
}
function eq(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    t(false, `${label} (got ${JSON.stringify(actual)})`);
  } else {
    t(true, label);
  }
}
function assert(condition, label) {
  if (!condition) throw new Error(label);
}
function hasMove(moves, wanted) {
  return moves.some((move) => {
    if (move.type !== wanted.type) return false;
    if (move.type !== 'play') return move.card === wanted.card || wanted.card === undefined;
    return move.cards.slice().sort().join() === wanted.cards.slice().sort().join();
  });
}
function scenario(numPlayers, overrides = {}) {
  const base = createInitialState({ numPlayers, seed: 91 });
  return {
    ...base,
    hands: numPlayers === 3
      ? [['3S', '3H', '5S', '2S'], ['4S', '4H', '6S'], ['7S', '8S', '9S']]
      : [['3S', '3H', '5S'], ['4S', '4H', '6S'], ['7S', '8S', '9S'], ['TS', 'JS', 'QS']],
    ...overrides,
  };
}

console.log('\nDEAL + DETERMINISM');
for (const n of [3, 4]) {
  const a = createInitialState({ numPlayers: n, seed: 12345 });
  const b = createInitialState({ numPlayers: n, seed: 12345 });
  const c = createInitialState({ numPlayers: n, seed: 12346 });
  t(JSON.stringify(a) === JSON.stringify(b), `${n}-seat deal repeats exactly for one seed`);
  t(JSON.stringify(a) !== JSON.stringify(c), `${n}-seat deal changes with a new seed`);
  eq(a.hands.map((hand) => hand.length), n === 3 ? [18, 17, 17] : [13, 13, 13, 13],
    `${n}-seat deal distributes all 52 cards`);
  t(new Set(a.hands.flat()).size === 52, `${n}-seat deal has 52 unique cards`);
  const resumed = JSON.parse(JSON.stringify(a));
  eq(applyMove(resumed, legalMoves(resumed)[0]), applyMove(a, legalMoves(a)[0]),
    `${n}-seat state resumes through JSON`);
}
let rejected = false;
try { createInitialState({ numPlayers: 2 }); } catch { rejected = true; }
t(rejected, 'online/practice seat count is restricted to 3 or 4');

console.log('\nCLIMBING RULES');
let s = scenario(3);
let moves = legalMoves(s);
t(hasMove(moves, { type: 'play', cards: ['3S'] }) &&
  hasMove(moves, { type: 'play', cards: ['3S', '3H'] }), 'fresh lead may be a single or matching set');
t(!moves.some((move) => move.type === 'pass'), 'fresh lead may not pass');
const before = JSON.stringify(s);
s = applyMove(s, { type: 'play', cards: ['3H', '3S'] });
t(JSON.stringify(scenario(3)) === before, 'applyMove never mutates its input');
moves = legalMoves(s);
t(hasMove(moves, { type: 'play', cards: ['4S', '4H'] }), 'follower can match set size with a higher rank');
t(!hasMove(moves, { type: 'play', cards: ['6S'] }), 'follower cannot change the set size');
t(moves.some((move) => move.type === 'pass'), 'follower may pass');
rejected = false;
try { applyMove(s, { type: 'play', cards: ['6S'] }); } catch { rejected = true; }
t(rejected, 'illegal mismatched set is rejected');

let clearTwo = scenario(3, {
  currentPlayer: 0,
  pile: { rank: 'A', count: 1 },
  lastPlayerToPlay: 2,
  hands: [['2S', '5S'], ['4S'], ['6S']],
});
clearTwo = applyMove(clearTwo, { type: 'play', cards: ['2S'] });
t(clearTwo.pile === null && clearTwo.currentPlayer === 0, 'a 2 clears the pile and its player leads fresh');

let passedPile = scenario(3, {
  currentPlayer: 1,
  pile: { rank: '9', count: 1 },
  lastPlayerToPlay: 0,
});
passedPile = applyMove(passedPile, { type: 'pass' });
t(passedPile.currentPlayer === 2 && passedPile.pile !== null, 'first pass moves to the next rider');
passedPile = applyMove(passedPile, { type: 'pass' });
t(passedPile.currentPlayer === 0 && passedPile.pile === null, 'everyone passing clears for the last player to lay');

let outLeader = scenario(4, {
  currentPlayer: 1,
  finishOrder: [0],
  pile: { rank: '9', count: 1 },
  lastPlayerToPlay: 0,
});
outLeader = applyMove(outLeader, { type: 'pass' });
outLeader = applyMove(outLeader, { type: 'pass' });
t(outLeader.pile !== null && outLeader.currentPlayer === 3, 'all remaining riders must pass when the pile leader is already out');
outLeader = applyMove(outLeader, { type: 'pass' });
t(outLeader.pile === null && outLeader.currentPlayer === 1, 'finished leader hands the fresh lead to the next active rider');

console.log('\nTURN ROTATION');
for (const n of [3, 4]) {
  let rotating = scenario(n, {
    currentPlayer: n - 1,
    hands: Array.from({ length: n }, (_, p) => p === n - 1 ? ['3S', '5S'] : [`${RANKS[p + 2]}H`, `${RANKS[p + 3]}D`]),
  });
  rotating = applyMove(rotating, { type: 'play', cards: ['3S'] });
  t(rotating.currentPlayer === 0, `${n}-seat turn wraps from last seat to host`);
}

console.log('\nFINISH, TITLES, SCORE + EXCHANGE');
let end3 = scenario(3, {
  currentPlayer: 1,
  finishOrder: [0],
  hands: [[], ['AS'], ['4S', '5S']],
  pile: null,
});
end3 = applyMove(end3, { type: 'play', cards: ['AS'] });
eq(end3.finishOrder, [0, 1, 2], 'last remaining rider is assigned T-Bar automatically');
eq(end3.scores, [2, 1, 0], '3-seat First Chair gets 2 and Chairlift gets 1');
t(end3.phase === 'roundOver' && getStatus(end3).over === false, 'round end keeps the match alive below 7');
let next = applyMove(end3, { type: 'nextRound' });
t(next.phase === 'exchange' && next.pendingExchange.firstChair === 0 && next.pendingExchange.tBar === 2,
  'next deal begins with T-Bar to First Chair exchange');
t(next.hands[0].includes(next.pendingExchange.gift), 'T-Bar automatically gives away their highest card');
const returnCard = legalMoves(next)[0].card;
const firstCount = next.hands[0].length;
const tbarCount = next.hands[2].length;
next = applyMove(next, { type: 'exchange', card: returnCard });
t(next.phase === 'playing' && next.currentPlayer === 0, 'First Chair returns any one card, then leads');
t(next.hands[0].length === firstCount - 1 && next.hands[2].length === tbarCount + 1,
  'exchange moves exactly one card back');

let end4 = scenario(4, {
  currentPlayer: 2,
  finishOrder: [0, 1],
  hands: [[], [], ['AS'], ['4S', '5S']],
});
end4 = applyMove(end4, { type: 'play', cards: ['AS'] });
eq(end4.scores, [2, 0, 1, 0], '4-seat Chairlift (third place) earns the one-point badge');

let clinch = { ...end3, phase: 'playing', scores: [5, 0, 0], finishOrder: [0],
  currentPlayer: 1, hands: [[], ['AS'], ['4S']] };
clinch = applyMove(clinch, { type: 'play', cards: ['AS'] });
t(clinch.phase === 'matchOver' && clinch.matchWinner === 0 && clinch.scores[0] === MATCH_TARGET,
  'first rider to 7 wins the match');
t(legalMoves(clinch).length === 0 && getStatus(clinch).over, 'match-over state accepts no more moves');

console.log('\nBOTS + RANDOM SOAK');
for (const personality of ['lou', 'patrol']) {
  const sample = createInitialState({ numPlayers: 4, seed: 77 });
  const started = performance.now();
  for (let i = 0; i < 1000; i++) chooseMove(sample, personality);
  const elapsed = performance.now() - started;
  t(elapsed < 300, `${personality} chooses 1,000 moves in ${elapsed.toFixed(1)}ms (<300ms)`);
}

let random = 0x51f7cafe;
function pick(items) {
  random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
  return items[random % items.length];
}
let totalMoves = 0;
for (let game = 0; game < 220; game++) {
  let state = createInitialState({ numPlayers: game % 2 ? 3 : 4, seed: game * 7919 + 17 });
  let movesMade = 0;
  while (!getStatus(state).over && movesMade < 5000) {
    const options = legalMoves(state);
    assert(options.length > 0, `soak game ${game + 1} has no legal move at step ${movesMade}`);
    const plays = options.filter((move) => move.type !== 'pass');
    const move = plays.length && (random & 3) !== 0 ? pick(plays) : pick(options);
    const snapshot = JSON.stringify(state);
    state = applyMove(JSON.parse(snapshot), move);
    movesMade++;
  }
  assert(getStatus(state).over, `soak game ${game + 1} missed the 5,000-move cap`);
  assert(state.hands.length === state.numPlayers && state.scores.every(Number.isInteger),
    `soak game ${game + 1} finished with an unsound state`);
  totalMoves += movesMade;
}
t(true, `220 random-legal matches finish cleanly (${totalMoves} moves)`);

console.log(`\nALL ENGINE TESTS PASSED (${passed} checks; 220 matches, ${totalMoves} moves)`);
