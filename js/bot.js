/* LIFT LINE bots. They inspect only moves returned by the public engine API. */

import { legalMoves, rankValue } from './engine.js';

export const BOTS = {
  lou: { name: 'Liftie Lou', blurb: 'Sheds low cards early and keeps a 2 up a sleeve.' },
  patrol: { name: 'Patrol', blurb: 'Reads the set sizes and clears the pile with purpose.' },
};

export function chooseMove(state, personality = 'lou') {
  const moves = legalMoves(state);
  if (moves.length <= 1) return moves[0] || null;
  if (moves[0].type === 'exchange') {
    return moves.slice().sort((a, b) => rankValue(a.card) - rankValue(b.card))[0];
  }
  if (moves[0].type === 'nextRound') return moves[0];

  const plays = moves.filter((move) => move.type === 'play');
  const pass = moves.find((move) => move.type === 'pass');
  if (!plays.length) return pass;
  return personality === 'patrol' ? patrolMove(plays) : louMove(plays, pass);
}

function louMove(plays, pass) {
  const nonTwos = plays.filter((move) => rankValue(move.cards[0]) < 12);
  if (!nonTwos.length && pass) return pass;
  const pool = nonTwos.length ? nonTwos : plays;
  return pool.slice().sort((a, b) =>
    rankValue(a.cards[0]) - rankValue(b.cards[0]) || b.cards.length - a.cards.length)[0];
}

function patrolMove(plays) {
  return plays.slice().sort((a, b) => {
    // On a fresh pile, dump the biggest family. While climbing, win as
    // cheaply as possible; both cases fall back to keeping 2s until useful.
    const size = b.cards.length - a.cards.length;
    if (size) return size;
    return rankValue(a.cards[0]) - rankValue(b.cards[0]);
  })[0];
}
