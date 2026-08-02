// LIFT LINE — UI and rooms transport only. Every game rule is in engine.js.

import {
  applyMove, createInitialState, getStatus, legalMoves, rankOf, rankValue, suitOf, titlesFor,
} from './engine.js';
import { BOTS, chooseMove } from './bot.js';
import { OnlineMatch, clearSession, getName, savedSession } from './rooms.js';

const $ = (id) => document.getElementById(id);
const menu = $('menu');
const game = $('game');
const handoff = $('handoff');
const onlinePanel = $('onlinePanel');
const lobby = $('lobby');
const opName = $('opName');
const opCode = $('opCode');
const opCodeWrap = $('opCodeWrap');
const opSeatsWrap = $('opSeatsWrap');
const opError = $('opError');
const rejoinBtn = $('rejoinBtn');

const GAME = 'lift-line';
const SUIT_MARK = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_MARK = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A', 2: '2' };
const BOT_ORDER = ['lou', 'patrol', 'lou'];

let session = null; // { mode, state, numPlayers }
let online = null; // { match, myPlayer }
let selected = new Set();
let handRevealed = false;
let botTimer = 0;
let syncing = false;
let panelIntent = 'host';
let hostSeats = 3;
let lobbyMatch = null;
let leaveArmed = false;

function seed() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] | 0;
}

function showMenu() {
  clearTimeout(botTimer);
  game.classList.add('hidden');
  handoff.classList.add('hidden');
  menu.classList.remove('hidden');
  session = null;
  selected.clear();
  refreshRejoin();
}

function begin(mode, numPlayers) {
  online = null;
  session = { mode, numPlayers, state: createInitialState({ numPlayers, seed: seed() }) };
  menu.classList.add('hidden');
  game.classList.remove('hidden');
  if (mode === 'pass') {
    handRevealed = false;
    showHandoff();
  } else {
    handRevealed = true;
    render();
  }
}

$('practiceBtn').addEventListener('click', () => $('practiceCount').classList.toggle('hidden'));
$('passPlayBtn').addEventListener('click', () => $('passCount').classList.toggle('hidden'));
document.querySelectorAll('[data-practice]').forEach((button) => {
  button.addEventListener('click', () => begin('practice', Number(button.dataset.practice)));
});
document.querySelectorAll('[data-pass]').forEach((button) => {
  button.addEventListener('click', () => begin('pass', Number(button.dataset.pass)));
});

function showHelp() { $('help').classList.remove('hidden'); }
function hideHelp() { $('help').classList.add('hidden'); }
$('helpBtn').addEventListener('click', showHelp);
$('gameHelpBtn').addEventListener('click', showHelp);
$('helpClose').addEventListener('click', hideHelp);
$('help').addEventListener('click', (event) => { if (event.target === $('help')) hideHelp(); });

function playerName(player) {
  if (!session) return `Rider ${player + 1}`;
  if (session.mode === 'practice') {
    if (player === 0) return 'You';
    const key = BOT_ORDER[player - 1];
    const repeated = player > 2 && key === 'lou' ? ' II' : '';
    return BOTS[key].name + repeated;
  }
  if (session.mode === 'online' && online) {
    const seat = (online.match.seats || []).find((entry) => entry.seat === player);
    if (seat) return seat.name;
    return `Seat ${player + 1}`;
  }
  return `Rider ${player + 1}`;
}

function localPlayer() {
  if (session.mode === 'online') return online.myPlayer;
  if (session.mode === 'practice') return 0;
  return session.state.currentPlayer;
}

function canAct() {
  if (!session || syncing) return false;
  if (session.mode === 'online') {
    return online.match.status === 'playing' && session.state.currentPlayer === online.myPlayer;
  }
  if (session.mode === 'practice') return session.state.currentPlayer === 0;
  return handRevealed;
}

function showHandoff() {
  if (!session || session.mode !== 'pass') return;
  game.classList.add('hidden');
  handoff.classList.remove('hidden');
  const player = session.state.currentPlayer;
  $('handoffTitle').textContent = `Pass to ${playerName(player)}`;
  $('handoffBtn').textContent = session.state.phase === 'exchange'
    ? 'REVIEW THE EXCHANGE' : 'SHOW MY HAND';
}

$('handoffBtn').addEventListener('click', () => {
  handRevealed = true;
  handoff.classList.add('hidden');
  game.classList.remove('hidden');
  render();
});

function render() {
  if (!session) return;
  const state = session.state;
  const status = getStatus(state);
  $('roundLabel').textContent = `ROUND ${state.round}`;
  renderRiders();
  renderPile();
  renderHand();
  renderMessage();

  const isResult = state.phase === 'roundOver' || state.phase === 'matchOver';
  $('roundPanel').classList.toggle('hidden', !isResult);
  if (isResult) renderResult(status);
}

function renderRiders() {
  const state = session.state;
  const titles = titlesFor(state.numPlayers);
  const root = $('riders');
  root.innerHTML = '';
  for (let player = 0; player < state.numPlayers; player++) {
    const rider = document.createElement('div');
    rider.className = 'rider';
    if (state.currentPlayer === player && state.phase !== 'matchOver') rider.classList.add('active');
    if (state.finishOrder.includes(player)) rider.classList.add('finished');

    const copy = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'rider-name';
    name.textContent = playerName(player);
    const detail = document.createElement('div');
    detail.className = 'rider-detail';
    detail.textContent = `${state.hands[player].length} cards`;
    const badge = document.createElement('span');
    badge.className = 'rank-badge';
    badge.textContent = titles[state.rankByPlayer[player]].toUpperCase();
    copy.append(name, detail, badge);

    const score = document.createElement('span');
    score.className = 'score-pill';
    score.textContent = `${state.scores[player]} PT`;
    rider.append(copy, score);
    root.appendChild(rider);
  }
}

function makeCard(card, interactive = false) {
  const el = document.createElement(interactive ? 'button' : 'div');
  el.className = 'card';
  if (suitOf(card) === 'H' || suitOf(card) === 'D') el.classList.add('red');
  el.dataset.card = card;
  const corner = document.createElement('span');
  corner.className = 'corner';
  corner.textContent = `${RANK_MARK[rankOf(card)] || rankOf(card)}${SUIT_MARK[suitOf(card)]}`;
  const pip = document.createElement('span');
  pip.className = 'pip';
  pip.textContent = SUIT_MARK[suitOf(card)];
  const mini = document.createElement('span');
  mini.className = 'mini';
  mini.textContent = RANK_MARK[rankOf(card)] || rankOf(card);
  el.append(corner, pip, mini);
  if (interactive) {
    el.type = 'button';
    el.setAttribute('aria-label', `${RANK_MARK[rankOf(card)] || rankOf(card)} of ${suitName(suitOf(card))}`);
  }
  return el;
}

function suitName(suit) {
  return { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[suit];
}

function renderPile() {
  const state = session.state;
  const pile = $('pile');
  const cards = $('pileCards');
  cards.innerHTML = '';
  pile.classList.toggle('empty', !state.pile);
  $('pileEmpty').classList.toggle('hidden', !!state.pile);
  if (state.pile) {
    for (const card of state.pile.cards || []) cards.appendChild(makeCard(card));
  }
}

function sorted(cards) {
  return cards.slice().sort((a, b) => rankValue(a) - rankValue(b) || suitOf(a).localeCompare(suitOf(b)));
}

function renderHand() {
  const state = session.state;
  const owner = localPlayer();
  const root = $('hand');
  root.innerHTML = '';
  const visible = session.mode !== 'pass' || handRevealed;
  const actionable = visible && canAct() && (state.phase === 'playing' || state.phase === 'exchange');
  $('handLabel').textContent = session.mode === 'pass' ? `${playerName(owner).toUpperCase()}'S HAND` : 'YOUR HAND';
  if (visible) {
    for (const card of sorted(state.hands[owner])) {
      const el = makeCard(card, true);
      el.classList.toggle('selected', selected.has(card));
      el.disabled = !actionable;
      el.addEventListener('click', () => toggleCard(card));
      root.appendChild(el);
    }
  }

  const moves = legalMoves(state);
  const chosen = selectedMove(moves);
  const pass = moves.find((move) => move.type === 'pass');
  $('playBtn').disabled = !actionable || !chosen;
  $('playBtn').textContent = state.phase === 'exchange' ? 'RETURN THIS CARD' : 'PLAY SET';
  $('passBtn').classList.toggle('hidden', !(actionable && pass));
  $('selectionLabel').textContent = selected.size ? `${selected.size} SELECTED` : `${state.hands[owner].length} CARDS`;
}

function selectedMove(moves = legalMoves(session.state)) {
  if (session.state.phase === 'exchange') {
    if (selected.size !== 1) return null;
    const card = [...selected][0];
    return moves.find((move) => move.type === 'exchange' && move.card === card) || null;
  }
  const wanted = [...selected].sort().join('|');
  return moves.find((move) => move.type === 'play' && move.cards.slice().sort().join('|') === wanted) || null;
}

function toggleCard(card) {
  if (!canAct()) return;
  if (session.state.phase === 'exchange') selected.clear();
  if (selected.has(card)) selected.delete(card); else selected.add(card);
  renderHand();
}

function renderMessage() {
  const state = session.state;
  const moves = legalMoves(state);
  let text = '';
  if (state.phase === 'exchange') {
    if (state.currentPlayer === localPlayer()) {
      text = `T-Bar sent ${prettyCard(state.pendingExchange.gift)}. Choose any card to return.`;
    } else {
      text = `${playerName(state.currentPlayer)} is completing the First Chair exchange.`;
    }
  } else if (state.phase === 'playing') {
    if (canAct()) {
      const play = moves.find((move) => move.type === 'play');
      const pass = moves.find((move) => move.type === 'pass');
      text = play ? (state.pile ? 'Match the set size and climb higher.' : 'Your lead — lay any matching set.')
        : pass ? 'Nothing climbs that run. Pass it by.' : '';
    } else {
      text = `${playerName(state.currentPlayer)} is sizing up the run…`;
    }
    if (state.lastAction?.type === 'play' && state.lastAction.cleared) text = 'A 2 clears the run — lead fresh!';
    if (state.lastAction?.type === 'pass' && state.lastAction.cleared) text = 'All pass. The run is clear.';
  }
  $('message').textContent = text;
}

function prettyCard(card) {
  return `${RANK_MARK[rankOf(card)] || rankOf(card)}${SUIT_MARK[suitOf(card)]}`;
}

function renderResult(status) {
  const state = session.state;
  const titles = titlesFor(state.numPlayers);
  const list = $('standings');
  list.innerHTML = '';
  state.finishOrder.forEach((player, index) => {
    const li = document.createElement('li');
    const name = document.createElement('b');
    name.textContent = playerName(player);
    const title = document.createElement('span');
    title.textContent = titles[index];
    li.append(name, title);
    list.appendChild(li);
  });
  const matchOver = state.phase === 'matchOver';
  $('roundTitle').textContent = matchOver
    ? `${playerName(status.winner).toUpperCase()} OWNS THE MOUNTAIN!`
    : `${playerName(state.finishOrder[0]).toUpperCase()} TAKES FIRST CHAIR`;
  $('nextRoundBtn').textContent = matchOver ? 'RIDE AGAIN' : 'DEAL THE NEXT RUN';
  const onlineWait = session.mode === 'online' && state.currentPlayer !== online.myPlayer && !matchOver;
  $('nextRoundBtn').classList.toggle('hidden', onlineWait);
  $('roundWait').classList.toggle('hidden', !onlineWait);
}

$('playBtn').addEventListener('click', () => {
  const move = selectedMove();
  if (move) makeMove(move);
});
$('passBtn').addEventListener('click', () => {
  const move = legalMoves(session.state).find((candidate) => candidate.type === 'pass');
  if (move) makeMove(move);
});
$('nextRoundBtn').addEventListener('click', () => {
  if (session.state.phase === 'matchOver') restartMatch();
  else makeMove({ type: 'nextRound' });
});

function makeMove(move) {
  if (!session) return;
  const previousPlayer = session.state.currentPlayer;
  session.state = applyMove(session.state, move);
  selected.clear();
  render();
  if (session.mode === 'online') {
    syncing = true;
    renderHand();
    pushOnline();
    return;
  }
  afterLocalMove(previousPlayer, move.type);
}

function afterLocalMove(previousPlayer = null, moveType = '') {
  const state = session.state;
  if (state.phase === 'roundOver' || state.phase === 'matchOver') return;
  if (session.mode === 'pass') {
    if (moveType === 'nextRound' || state.currentPlayer !== previousPlayer) {
      handRevealed = false;
      showHandoff();
    }
  } else if (session.mode === 'practice' && state.currentPlayer !== 0) {
    scheduleBot();
  }
}

function scheduleBot() {
  clearTimeout(botTimer);
  const state = session.state;
  if (session.mode !== 'practice' || state.currentPlayer === 0 ||
      state.phase === 'roundOver' || state.phase === 'matchOver') return;
  botTimer = setTimeout(() => {
    const player = session.state.currentPlayer;
    const move = chooseMove(session.state, BOT_ORDER[player - 1]);
    if (!move) return;
    session.state = applyMove(session.state, move);
    selected.clear();
    render();
    afterLocalMove(player, move.type);
  }, 520);
}

function restartMatch() {
  const fresh = createInitialState({ numPlayers: session.numPlayers, seed: seed() });
  if (session.mode === 'online') {
    session.state = fresh;
    render();
    syncing = true;
    pushOnline();
  } else {
    session.state = fresh;
    selected.clear();
    if (session.mode === 'pass') {
      handRevealed = false;
      showHandoff();
    } else render();
  }
}

$('homeBtn').addEventListener('click', async () => {
  if (online) {
    if (!leaveArmed) {
      leaveArmed = true;
      $('homeBtn').textContent = '×';
      setTimeout(() => { leaveArmed = false; $('homeBtn').textContent = '⌂'; }, 2400);
      return;
    }
    await online.match.leave();
    online = null;
  }
  leaveArmed = false;
  $('homeBtn').textContent = '⌂';
  showMenu();
});

/* ----------------------------------------------------------- online play */

$('hostBtn').addEventListener('click', () => openPanel('host'));
$('joinBtn').addEventListener('click', () => openPanel('join'));
$('opCancel').addEventListener('click', closePanel);
$('opGo').addEventListener('click', onlineGo);
$('lobbyCancel').addEventListener('click', cancelLobby);
rejoinBtn.addEventListener('click', rejoinCrew);

document.querySelectorAll('.seat-btn').forEach((button) => {
  button.addEventListener('click', () => {
    hostSeats = Number(button.dataset.seats);
    document.querySelectorAll('.seat-btn').forEach((candidate) => {
      const on = candidate === button;
      candidate.classList.toggle('selected', on);
      candidate.setAttribute('aria-pressed', String(on));
    });
  });
});
opCode.addEventListener('input', () => {
  opCode.value = opCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});
[opName, opCode].forEach((input) => input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') onlineGo();
}));

function openPanel(intent) {
  panelIntent = intent;
  $('opTitle').textContent = intent === 'host' ? 'START A CREW' : 'JOIN A CREW';
  $('opGo').textContent = intent === 'host' ? 'GET A CODE' : 'SCAN IN';
  opCodeWrap.classList.toggle('hidden', intent === 'host');
  opSeatsWrap.classList.toggle('hidden', intent !== 'host');
  opError.classList.add('hidden');
  opName.value = opName.value || getName();
  onlinePanel.classList.remove('hidden');
  (intent === 'join' && opName.value ? opCode : opName).focus();
}

function closePanel() { onlinePanel.classList.add('hidden'); }

const ERRORS = {
  not_found: 'No lift line has that code — check the letters.',
  room_full: 'That lift is already full.',
  room_started: 'That crew is already riding.',
  not_ready: "Online play isn't switched on yet — check back soon!",
  offline: "Can't reach the mountain. Check your connection.",
};
function friendly(error) {
  if (error?.code === 'wrong_game') return 'That code belongs to another Btown game.';
  return ERRORS[error?.code] || 'The lift paused. Try that once more.';
}

async function onlineGo() {
  const go = $('opGo');
  if (go.disabled) return;
  const name = opName.value.trim();
  if (!name) return showPanelError('Every rider needs a trail name.', opName);
  if (panelIntent === 'join' && opCode.value.trim().length !== 4) {
    return showPanelError('Crew codes are four characters.', opCode);
  }
  go.disabled = true;
  opError.classList.add('hidden');
  try {
    if (panelIntent === 'host') {
      const match = await OnlineMatch.create({
        game: GAME,
        name,
        seats: hostSeats,
        state: createInitialState({ numPlayers: hostSeats, seed: seed() }),
      });
      closePanel();
      openLobby(match);
    } else {
      const match = await OnlineMatch.join({ game: GAME, code: opCode.value, name });
      closePanel();
      if (match.status === 'waiting') openGuestWaiting(match);
      else enterOnline(match);
    }
  } catch (error) {
    showPanelError(friendly(error));
  } finally {
    go.disabled = false;
  }
}

function showPanelError(message, focus) {
  opError.textContent = message;
  opError.classList.remove('hidden');
  if (focus) focus.focus();
}

function openLobby(match) {
  if (lobbyMatch && lobbyMatch !== match) lobbyMatch.stop();
  lobbyMatch = match;
  $('lobbyCode').textContent = match.code;
  lobby.classList.remove('hidden');
  renderLobby(match);
  match.start({
    onStatus: (status) => { if (status === 'playing') enterOnline(match); },
    onPresence: () => renderLobby(match),
    onError: () => {},
  });
}

function openGuestWaiting(match) {
  lobbyMatch = match;
  $('lobbyCode').textContent = match.code;
  lobby.classList.remove('hidden');
  renderLobby(match);
  match.start({
    onStatus: (status) => { if (status === 'playing') enterOnline(match); },
    onPresence: () => renderLobby(match),
    onError: () => {},
  });
}

function renderLobby(match) {
  const names = $('lobbyNames');
  names.innerHTML = '';
  const bySeat = new Map((match.seats || []).map((seat) => [seat.seat, seat]));
  const total = match.state?.numPlayers || hostSeats;
  for (let seat = 0; seat < total; seat++) {
    const li = document.createElement('li');
    li.textContent = bySeat.has(seat) ? `✓ ${bySeat.get(seat).name}` : `○ Seat ${seat + 1} waiting…`;
    names.appendChild(li);
  }
}

async function cancelLobby() {
  if (lobbyMatch) await lobbyMatch.leave();
  lobbyMatch = null;
  lobby.classList.add('hidden');
  refreshRejoin();
}

async function rejoinCrew() {
  rejoinBtn.disabled = true;
  try {
    const match = await OnlineMatch.resume({ game: GAME });
    if (match.status === 'waiting') openLobby(match); else enterOnline(match);
  } catch (error) {
    if (['not_found', 'not_seated', 'room_started'].includes(error?.code)) clearSession(GAME);
    refreshRejoin();
  } finally {
    rejoinBtn.disabled = false;
  }
}

function refreshRejoin() {
  const saved = savedSession(GAME);
  rejoinBtn.classList.toggle('hidden', !saved);
  if (saved) rejoinBtn.textContent = `↩ REJOIN CREW ${saved.code}`;
}

function enterOnline(match) {
  lobbyMatch = null;
  lobby.classList.add('hidden');
  onlinePanel.classList.add('hidden');
  menu.classList.add('hidden');
  handoff.classList.add('hidden');
  game.classList.remove('hidden');
  online = { match, myPlayer: match.seat };
  session = { mode: 'online', numPlayers: match.state.numPlayers, state: match.state };
  selected.clear();
  handRevealed = true;
  syncing = false;
  render();
  match.start({
    onState: (newState) => {
      session.state = newState;
      syncing = false;
      selected.clear();
      render();
    },
    onStatus: (status) => {
      if (status === 'over' && !getStatus(session.state).over) {
        $('message').textContent = 'A rider left the line. Head back to the lodge.';
      }
    },
    onPresence: () => renderRiders(),
    onError: (error) => {
      if (error?.code === 'not_found') {
        clearSession(GAME);
        online = null;
        showMenu();
      }
    },
  });
}

async function pushOnline() {
  if (!online) return;
  try {
    await online.match.push(session.state, { over: getStatus(session.state).over });
  } catch (error) {
    if (error?.code === 'version_conflict') session.state = online.match.state;
    else $('message').textContent = 'Connection bumped — holding your place…';
  } finally {
    syncing = false;
    render();
  }
}

/* ------------------------------------------------------ crew-link invite */

$('inviteBtn').addEventListener('click', async () => {
  const match = lobbyMatch;
  if (!match) return;
  const url = `${location.origin}${location.pathname}?join=${match.code}`;
  const text = `Join my LIFT LINE crew! 🎿 Tap in here: ${url}`;
  try {
    if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
      await navigator.share({ text });
    } else {
      await copyInvite(url);
      $('inviteBtn').textContent = '✓ LINK COPIED';
      setTimeout(() => { $('inviteBtn').textContent = '📲 SEND AN INVITE'; }, 1800);
    }
  } catch { /* share sheet closed */ }
});

async function copyInvite(url) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(url);
  const field = document.createElement('textarea');
  field.value = url;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  document.execCommand('copy');
  field.remove();
}

refreshRejoin();
(() => {
  const code = new URLSearchParams(location.search).get('join');
  if (!code || !/^[A-Za-z0-9]{4}$/.test(code)) return;
  history.replaceState(null, '', location.pathname);
  openPanel('join');
  opCode.value = code.toUpperCase();
  if (opName.value) opCode.focus();
})();
