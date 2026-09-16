# Poker Home Games

An installable app (PWA — add it to your phone's home screen, no App Store
needed) for tracking a local poker night: everyone logs their buy-ins, takes
a photo of their chip stack at the end, and the app prices it, calculates
who's up and down, and works out who pays whom — plus a running leaderboard
across game nights. No real money moves through the app; it's a calculator
for a cash game your group already plays.

## How it works

1. **Host creates a game** and sets the table's chip colors and dollar
   values (e.g. White = $1, Red = $5, Blue = $25) — every home game's chip
   set is different, so this is a one-time setup per game.
2. **Everyone joins** with the game code or a shared link, and types their
   name (no accounts, no login — this is for a private group of friends).
3. **Buy-ins**: each player photographs their chips (stacked and sorted by
   color) when they buy in — repeatable for re-buys. **Cash-out**: same
   photo flow at the end of the night for the final stack.
4. **The app counts the chips itself**, fully on-device (see below) — and
   always shows an editable confirmation screen before anything is saved, so
   a misread never silently becomes the recorded amount.
5. Once everyone has cashed out, the host taps **Settle game**: it computes
   each player's net and the minimum set of payments to square everyone up,
   and flags it if the buy-ins and cash-outs don't quite add up (a sign
   someone's count was off).
6. Past games and a cumulative leaderboard live under **History**.

## The chip-counting engine

`client/src/cv/chipCounter.ts` is a small, dependency-free heuristic (plain
Canvas2D pixel math, no ML model, no server round-trip, no API cost):

- classifies each pixel against the game's chip-color palette,
- finds one connected blob per stack,
- estimates the chip count per stack from its height (self-calibrated
  against the stack's own width) reconciled against a count of the visible
  chip-rim edge lines.

It's a best-effort guess on an arbitrary phone photo — lighting, tilt, and
worn chips all affect it — which is exactly why every count is shown on an
editable screen before it's used for money. Stacking chips sorted by color
gives it the best shot.

## Development

```sh
npm install
npm run dev        # server on :8080, client dev server on :5173
npm run typecheck
node scripts/gen-icons.mjs   # regenerate app icons if you tweak the design
```

## Deploying (free)

This runs on Render's free web-service tier:

1. Push this repo to GitHub.
2. On Render: **New → Blueprint**, pick the repo (uses `render.yaml`).
3. By default, game data is stored in a JSON file on disk, which does **not**
   survive a redeploy on Render's free plan. To keep history across
   redeploys, create a free [Turso](https://turso.tech) database and set
   `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` in the Render dashboard — the
   app automatically switches to it when those are set (same pattern as the
   `discord-gambling` project).
4. Open the deployed URL on your phone and use the browser's "Add to Home
   Screen" (Safari) / "Install app" (Chrome) prompt to install it — that's
   the whole app-store-free "app" install.

## Known limitations (first cut)

- Chip-stack photo counting is a heuristic, not perfect — the confirm screen
  is the safety net, always double check before submitting.
- Player identity is just a typed name (no accounts) — fine for a trusted
  friend group, not spoof-proof.
- On the free JSON-file storage backend, photos are stored inline as base64
  in the session data — fine for casual use, but will grow the data file
  over many game nights; Turso avoids the redeploy-wipe problem but not this
  growth. A future pass could move photos to dedicated blob storage.
