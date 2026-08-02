# LIFT LINE 🎿

LIFT LINE is Btown Games’ ski-lift climbing card game for 3–4 riders. Shed
your hand, move up the mountain’s pecking order, and be the first to 7 points.
Play against **Liftie Lou** and **Patrol**, pass one phone around, or start an
online crew with a four-character invite code.

**Live home:** https://play.btownbrief.com/lift-line/

## House rules

- The whole 52-card deck is dealt. The host/Rider 1 leads the first round.
- Lead any single, pair, triple, or quad. Followers must play the same number
  of cards at a strictly higher rank, or pass.
- Ranks climb from 3 (low) through ace, with 2 highest.
- When everyone else passes, the run clears and the last rider to play leads
  fresh. A 2 clears the run immediately.
- First out takes **First Chair**. Last out lands on the **T-Bar**. Three-rider
  titles are First Chair, Chairlift, T-Bar; the four-rider line adds Gondola in
  second place.
- First Chair scores 2 points and Chairlift scores 1. First to 7 wins the match.
- Between rounds, T-Bar automatically gives First Chair their highest card.
  First Chair chooses any one card to return, then leads.

## Ways to play

- **Practice run:** choose 3 or 4 total riders; Liftie Lou and Patrol fill the
  other seats. Lou sheds low and saves 2s. Patrol makes sharper set choices.
- **Pass & play:** 3 or 4 humans share one phone. A privacy screen covers every
  handoff, so only the current rider sees their cards.
- **Online crew:** host or join a 3- or 4-phone room. The host occupies engine
  seat 0, every rival is shown only by name, rank, score, and card count, and a
  lobby invite link can be shared or copied.

## Architecture

Plain static files, with no build step or package dependencies:

| File | Responsibility |
| --- | --- |
| `js/engine.js` | All rules as pure functions over one seeded, JSON-safe state |
| `js/bot.js` | Liftie Lou and Patrol choosing only from engine-provided legal moves |
| `js/main.js` | Screens, hidden-hand presentation, handoffs, and online room transport |
| `js/rooms.js` | Vendored Btown room client; canonical copy lives in `four-in-a-rowboat` |
| `scripts/rooms-shim.mjs` | Vendored local room referee for offline tests |

The engine API is `createInitialState({ numPlayers, seed })`, `legalMoves`,
`applyMove`, and `getStatus`. It never touches the DOM, time, or ambient
randomness. Shuffle state travels inside the game state, allowing a complete
match to survive JSON serialization and remain identical across phones.

## Test

```bash
node scripts/test-engine.mjs
node scripts/test-rooms.mjs
node --check js/engine.js
node --check js/bot.js
node --check js/main.js
```

The engine suite covers rules and edge cases, both player counts, deterministic
serialization, bot speed, and 220 complete random-legal matches. The room suite
plays complete synchronized 3-phone and 4-phone matches against the local room
referee.
