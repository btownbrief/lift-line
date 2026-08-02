// LIFT LINE online-room test. Simulated phones use the real vendored client,
// local room referee, and pure engine through complete 3- and 4-phone matches.

import { createRooms } from './rooms-shim.mjs';
import { applyMove, createInitialState, getStatus, legalMoves } from '../js/engine.js';

const GAME = 'lift-line';
const stores = new Map();
let currentDevice = 'A';
globalThis.localStorage = {
  getItem: (key) => stores.get(currentDevice)?.get(key) ?? null,
  setItem: (key, value) => stores.get(currentDevice).set(key, String(value)),
  removeItem: (key) => stores.get(currentDevice).delete(key),
};
function device(id) {
  if (!stores.has(id)) stores.set(id, new Map());
  currentDevice = id;
}
for (const id of ['A', 'B', 'C', 'D', 'E']) device(id);
device('A');

let passed = 0;
function t(condition, label) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed++;
  console.log(`  ok — ${label}`);
}
async function expectCode(promise, code, label) {
  try {
    await promise;
    t(false, `${label} (nothing thrown)`);
  } catch (error) {
    t(error?.code === code, `${label} (got ${error?.code})`);
  }
}

let random = 0x5ca1ab1e;
function pick(items) {
  random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
  return items[random % items.length];
}
function chooseLegal(state) {
  const moves = legalMoves(state);
  const progress = moves.filter((move) => move.type !== 'pass');
  return progress.length && (random & 3) !== 0 ? pick(progress) : pick(moves);
}

async function sync(phones) {
  for (const phone of phones) {
    device(phone.device);
    await phone.match._fetch();
  }
  const truth = JSON.stringify(phones[0].match.state);
  return phones.every((phone) => JSON.stringify(phone.match.state) === truth);
}

async function playMatch(phones, cap = 2000) {
  let moves = 0;
  let identical = await sync(phones);
  while (!getStatus(phones[0].match.state).over && moves < cap && identical) {
    const truth = phones[0].match.state;
    const mover = phones.find((phone) => phone.match.seat === truth.currentPlayer);
    if (!mover) throw new Error(`No simulated phone for seat ${truth.currentPlayer}`);
    device(mover.device);
    await mover.match._fetch();
    const next = applyMove(mover.match.state, chooseLegal(mover.match.state));
    await mover.match.push(next, { over: getStatus(next).over });
    moves++;
    identical = await sync(phones);
  }
  return { moves, identical, finished: getStatus(phones[0].match.state).over };
}

const shim = createRooms();
let backendReady = true;
globalThis.BTOWN_ROOMS_URL = 'http://rooms.test';
globalThis.fetch = async (url, options = {}) => {
  if (!backendReady) return new Response('{}', { status: 404 });
  const fn = String(url).match(/\/rest\/v1\/rpc\/(\w+)$/)?.[1];
  if ((options.method || 'GET') !== 'POST' || !fn || !shim.rpcs[fn]) {
    return new Response(JSON.stringify({ message: 'not a room rpc' }), { status: 404 });
  }
  try {
    const body = shim.rpcs[fn](JSON.parse(options.body || '{}')) ?? {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ message: error.message }), {
      status: error.rpc ? 400 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

const { OnlineMatch, RoomsError, savedSession } = await import('../js/rooms.js');

console.log('\nGENERIC ROOM CHECKS + THREE PHONES');
device('A');
const host3 = await OnlineMatch.create({
  game: GAME,
  name: 'First Tram',
  seats: 3,
  state: createInitialState({ numPlayers: 3, seed: 101 }),
});
t(/^[A-Z2-9]{4}$/.test(host3.code) && host3.seat === 0 && host3.status === 'waiting',
  'host creates a three-seat room in engine seat 0');
t(savedSession(GAME)?.roomId === host3.roomId, 'host session is saved');

device('B');
await expectCode(OnlineMatch.join({ game: GAME, code: 'ZZZZ', name: 'Lost' }),
  'not_found', 'unknown crew code is rejected');
await expectCode(OnlineMatch.join({ game: 'crazy-eights', code: host3.code, name: 'Wrong Hill' }),
  'wrong_game', 'code from the wrong game is rejected');
const phoneB = await OnlineMatch.join({ game: GAME, code: ` ${host3.code.toLowerCase()} `, name: 'Mid Tram' });
t(phoneB.seat === 1 && phoneB.status === 'waiting', 'seat 1 joins and the three-seat lobby keeps waiting');

device('C');
const phoneC = await OnlineMatch.join({ game: GAME, code: host3.code, name: 'Last Tram' });
t(phoneC.seat === 2 && phoneC.status === 'playing', 'seat 2 fills the lift and starts the game');
t(phoneC.opponents().length === 2, 'joining phone sees both rival names');

device('A');
await host3._fetch();
t(host3.status === 'playing' && host3.seats.length === 3, 'host poll sees the complete crew');
let pushed = applyMove(host3.state, chooseLegal(host3.state));
await host3.push(pushed);
t(host3.version === 1, 'host pushes the first engine move at version 1');

device('B');
await phoneB._fetch();
t(JSON.stringify(phoneB.state) === JSON.stringify(pushed), 'seat 1 receives the complete deterministic state');
const fromB = applyMove(phoneB.state, chooseLegal(phoneB.state));
await phoneB.push(fromB);
t(phoneB.version === 2, 'seat 1 pushes the next legal engine move');

device('A');
const stale = applyMove(pushed, chooseLegal(pushed));
await expectCode(host3.push(stale), 'version_conflict', 'stale state push is rejected');
t(host3.version === 2 && JSON.stringify(host3.state) === JSON.stringify(phoneB.state),
  'version conflict refetches server truth');
t(new RoomsError('offline').code === 'offline', 'room failures expose stable error codes');

const game3 = await playMatch([
  { device: 'A', match: host3 },
  { device: 'B', match: phoneB },
  { device: 'C', match: phoneC },
]);
t(game3.identical, 'three phones remain JSON-identical after every move');
t(game3.finished, `three-phone match reaches 7 points in ${game3.moves + 2} total moves`);
t(host3.state.numPlayers === 3 && host3.state.hands.length === 3,
  'three-phone state preserves engine seat mapping');

device('D');
await expectCode(OnlineMatch.join({ game: GAME, code: host3.code, name: 'Too Late' }),
  'room_started', 'extra phone cannot enter a completed crew');

device('C');
const rematchVersion = phoneC.version;
await phoneC.push(createInitialState({ numPlayers: 3, seed: 202 }), {});
t(phoneC.status === 'playing' && phoneC.version === rematchVersion + 1,
  'either phone can start a fresh match in the same room');

device('A');
const resumed = await OnlineMatch.resume({ game: GAME });
t(resumed.roomId === host3.roomId && resumed.seat === 0 && resumed.status === 'playing',
  'saved session resumes in the same engine seat');
await resumed.leave();
t(savedSession(GAME) === null, 'leaving clears that phone session');

device('B');
await phoneB._fetch();
t(phoneB.status === 'over' && phoneB.opponents().some((opponent) => opponent.left),
  'remaining phones see when a rider leaves');

console.log('\nFOUR PHONES');
device('A');
const host4 = await OnlineMatch.create({
  game: GAME,
  name: 'A',
  seats: 4,
  state: createInitialState({ numPlayers: 4, seed: 404 }),
});
device('B');
const fourB = await OnlineMatch.join({ game: GAME, code: host4.code, name: 'B' });
device('C');
const fourC = await OnlineMatch.join({ game: GAME, code: host4.code, name: 'C' });
t(fourC.status === 'waiting', 'four-seat room still waits after three phones arrive');
device('D');
const fourD = await OnlineMatch.join({ game: GAME, code: host4.code, name: 'D' });
t(fourD.seat === 3 && fourD.status === 'playing', 'fourth phone fills the Gondola crew');

const game4 = await playMatch([
  { device: 'A', match: host4 },
  { device: 'B', match: fourB },
  { device: 'C', match: fourC },
  { device: 'D', match: fourD },
]);
t(game4.identical, 'all four phones remain JSON-identical after every move');
t(game4.finished, `four-phone match reaches 7 points in ${game4.moves} moves`);
t(host4.state.rankByPlayer.length === 4 && host4.state.scores.length === 4,
  'four-phone state keeps every rank badge and score');

device('E');
await expectCode(OnlineMatch.join({ game: GAME, code: host4.code, name: 'Fifth Wheel' }),
  'room_started', 'fifth phone is turned away');

backendReady = false;
const missing = await import('../js/rooms.js?not-ready');
device('E');
await expectCode(
  missing.OnlineMatch.create({ game: GAME, name: 'No Signal', state: {}, seats: 3 }),
  'not_ready',
  'missing shared backend degrades to not_ready',
);

console.log(`\nALL ROOMS TESTS PASSED (${passed} checks)`);
process.exit(0);
