# CLAUDE.md

## What this is

An installable PWA for tracking a local home poker game: buy-ins, a
photo-counted chip-stack valuation at cash-out, and automatic settlement
(nets + minimal payments) across the table, plus a cross-session leaderboard.
No real money moves through the app — it's a calculator for a cash game the
group already plays, not a payment product.

## Layout

- `src/config.ts` — env parsing. `config.tursoUrl` blank = persist to a local
  JSON file; set = use hosted libSQL (Turso) instead, same pattern as the
  `discord-gambling` project.
- `src/lib/store.ts` / `src/lib/libsql.ts` — copied near-verbatim from
  `discord-gambling`: a debounced-write JSON blob, backed by a file locally
  or a `kv` table row in libSQL in production.
- `src/lib/sessions.ts` — all game state mutation lives here (create/join a
  session, set the chip palette, add a buy-in, record a cash-out, settle).
  Every photo entry's `totalCents` is **recomputed server-side** from
  `confirmedCounts × the session's current chip palette** — the client's
  own total is never trusted.
- `src/lib/settlement.ts` — `computeSettlement()`: nets everyone
  (`cashOut − totalBuyIns`), then greedily matches the largest creditor
  against the largest debtor until everyone is settled (Splitwise-style
  minimum cash flow). `discrepancyCents` (nets not summing to zero) means a
  buy-in or cash-out count doesn't add up — surfaced as a warning, not an
  error.
- `src/web/server.ts` — plain `node:http`, no framework: a handful of REST
  routes under `/api/*` plus static-serving the built client with a
  SPA-style fallback to `index.html`. No WebSocket — the client just polls
  `GET /api/sessions/:id` every few seconds, which is plenty for a buy-in
  tracker (unlike `discord-gambling`'s live-hand poker room, nothing here is
  latency-sensitive).
- `src/shared/types.ts` — the `Session` / `Player` / `PhotoCount` /
  `SettlementResult` shapes, imported directly by the client (see below).
  **All money is integer cents, never floats.**
- `client/` — Preact + Vite, built as a PWA via `vite-plugin-pwa`
  (`vite.config.ts`). Imports shared types from `../../src/shared/*.js`
  (same convention as `discord-gambling`'s client — note the `.js` extension
  on a `.ts`/`.tsx` import target; that's the ESM/Bundler-resolution
  convention this repo follows, not a typo).
  - `client/src/cv/chipCounter.ts` — the on-device, dependency-free chip
    counting heuristic (pixel color classification → connected blobs →
    height/edge-based count estimate per blob). It's a best-effort guess;
    `client/src/screens/PhotoFlow.tsx` always shows it on an editable
    confirm screen before a count is saved — never trust an unconfirmed
    detection for money.
  - `client/src/screens/` — one file per screen: `Home` (create/join),
    `ChipSetup` (host sets chip colors/values, `setup` status), `Table`
    (live buy-in/cash-out view, `active` status), `Settlement` (`settled`
    status), `History` (cross-session leaderboard).
- `scripts/gen-icons.mjs` — generates the PWA/`apple-touch-icon` PNGs with
  zero image-library dependencies (hand-rolled PNG/CRC32 writer over
  `node:zlib`). Re-run it if you change the icon art in that script.

## Conventions

- ESM + `NodeNext` resolution on the server: **relative imports need `.js`
  extensions**, same as `discord-gambling`.
- Money is integer cents everywhere, both server and client
  (`client/src/money.ts` has the only `$`-formatting/parsing).
- A session's `chipPalette` can only change while `status === 'setup'`
  (enforced in `sessions.ts`) — once a game is `active`, chip values are
  locked so photo counts stay comparable across the whole night.
- `settleSession()` requires every player to have a (possibly $0) cash-out
  recorded first — there's no partial/force settle.

## Checks

```sh
npm run typecheck
```
