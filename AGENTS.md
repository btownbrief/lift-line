# LIFT LINE — agent instructions

Shared brain for any AI agent working in this repo. Read `README.md` first for
the rules and architecture. Stephen is non-technical; explain consequential
changes and verification in plain language.

## What this is

Btown Games’ ski-lift climbing card game for 3–4 players. It is a plain static
site with **no build step**: `index.html`, `style.css`, and ES modules under
`js/`. GitHub Pages deploys it through `.github/workflows/deploy.yml`. There are
no accounts, analytics, ads, or package dependencies.

## The one non-negotiable

**Every game rule lives in `js/engine.js` and nowhere else.** The engine is pure
functions over one plain JSON-serializable state object: `createInitialState`,
`legalMoves`, `applyMove` (always returns a new state), and `getStatus`. It
imports nothing and never touches the DOM, timers, `Date`, or `Math.random`.
Shuffle randomness is seeded and the RNG state lives inside the game state.

`js/bot.js` may inspect only the engine’s public API and choose among
`legalMoves`. `js/main.js` is presentation and transport only. This separation
is what lets multiple phones replay exactly the same match.

## Hidden hands

Pass-and-play must cover the game with a handoff screen before every new rider
sees a hand. Online play renders only this phone’s hand. The full state reaches
every friendly phone for deterministic replay, but the honest UI must never
render a rival’s cards. Rival names are inserted with `textContent`, never HTML.

## Online play (the rooms layer)

`js/rooms.js` is the fleet’s vendored online multiplayer client. Its canonical
copy lives in `four-in-a-rowboat`; never edit the local copy or the vendored
`scripts/rooms-shim.mjs`. A room stores a four-character code, the whole engine
state, version, and seat list. Seat index always equals engine player index and
the host is seat 0. This game’s online picker offers exactly 3 or 4 seats.

After a local move, push the engine-produced state and mark the room over only
when `getStatus(state).over`. Apply every remote state with a cold repaint.
Handle version conflicts by accepting the room’s newer truth. A missing shared
backend must show the friendly `not_ready` message.

Lobby invites share `location.origin + location.pathname + '?join=CODE'` with
the native share sheet on mobile and a clipboard fallback elsewhere. A valid
four-character `?join=` parameter opens the join panel, prefills the code, and
is immediately scrubbed with `history.replaceState`.

## Before you finish

Run all of these and report what passed:

```bash
node scripts/test-engine.mjs
node scripts/test-rooms.mjs
node --check js/engine.js
node --check js/bot.js
node --check js/main.js
```

Keep bot decisions comfortably under 300ms. If UI changed, inspect it at a
390px phone width and exercise practice plus pass-and-play, or clearly state
what visual interaction could not be tested.
