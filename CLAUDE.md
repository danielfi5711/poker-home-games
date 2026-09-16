# CLAUDE.md

## What this is

An installable PWA for tracking local home poker games: real logins, friend
groups, buy-ins, a photo-counted chip-stack valuation at cash-out, automatic
settlement (nets + minimal payments) across the table, and a
**per-group** leaderboard of every account's running balance. No real money
moves through the app — it's a calculator for a cash game the group already
plays, not a payment product.

Identity model: every player logs into an **account** (username/password).
Accounts join **groups** (a friend circle, via a shareable join code).
**Tables** (a `Session`) are created inside a group, only that group's
members can see or join them, and a group's leaderboard only ever sums
settled tables from that group — so each friend group has its own
independent balance standings, not one global leaderboard.

## Layout

- `src/config.ts` — env parsing. `config.tursoUrl` blank = persist to local
  JSON files; set = use hosted libSQL (Turso) instead, same pattern as the
  `discord-gambling` project.
- `src/lib/store.ts` / `src/lib/libsql.ts` — copied near-verbatim from
  `discord-gambling`: a debounced-write JSON blob, backed by a file locally
  or a `kv` table row in libSQL in production. Accounts, groups, and
  sessions each get their **own** `JsonStore` instance/file (see
  `config.accountsFile` / `groupsFile` / `dataFile`) — three independent
  blobs, not one shared object.
- `src/lib/accounts.ts` — registration/login. Passwords are hashed with
  `node:crypto`'s `scrypt` (no dependency) and stored as `salt:hash`; a
  logged-in account gets a random bearer token (`Authorization: Bearer …`)
  that the server maps back to an account id. Tokens don't expire — logout
  just deletes the token server-side.
- `src/lib/groups.ts` — create/join a group (join by a 5-character code, same
  charset as table codes), list the groups an account belongs to, and
  `requireMember()` — the gate every group- and session-scoped route calls
  before doing anything.
- `src/lib/sessions.ts` — all table state mutation lives here (create/join a
  table, set the chip palette, add a buy-in, record a cash-out, settle).
  Every photo entry's `totalCents` is **recomputed server-side** from
  `confirmedCounts × the session's current chip palette** — the client's
  own total is never trusted. Ownership is enforced server-side too: buy-ins
  and cash-outs must be posted by the account that owns that seat
  (`requirePlayerOwnedBy`), and setup/start/settle must come from the
  account that owns the host seat (`requireHost`) — a client-supplied
  `playerId` alone is never enough.
- `src/lib/chipVision.ts` — AI chip-stack counting: sends the buy-in/cash-out
  photo to Claude's vision model (`config.chipVisionModel`, needs
  `ANTHROPIC_API_KEY`) via a forced tool call, asking it to find every
  individual stack and count its chips one by one from the rim lines up its
  side (not just estimate from height). This is the primary counting path —
  meaningfully more accurate than the on-device heuristic below, since it
  isn't fooled by lighting, camera angle, or two same-color stacks standing
  side by side. `POST /api/sessions/:id/vision-count` runs it against the
  session's own `chipPalette` server-side (the client never sends a
  palette). If `ANTHROPIC_API_KEY` is unset, or the request fails for any
  reason (offline, rate limited, etc.), `PhotoFlow.tsx` falls back to the
  on-device heuristic — the app works either way, just less accurately
  without it. Exactly like the heuristic, this is only ever a *suggestion*:
  shown on the same editable confirm screen, never trusted for money.
- `src/lib/settlement.ts` — `computeSettlement()`: nets everyone
  (`cashOut − totalBuyIns`), then greedily matches the largest creditor
  against the largest debtor until everyone is settled (Splitwise-style
  minimum cash flow). `discrepancyCents` (nets not summing to zero) means a
  buy-in or cash-out count doesn't add up — surfaced as a warning, not an
  error.
- `src/web/server.ts` — plain `node:http`, no framework: a handful of REST
  routes under `/api/*` plus static-serving the built client with a
  SPA-style fallback to `index.html`. Every route except register/login
  calls `requireAuth()` (resolves the bearer token to an `Account`), and
  every group- or session-scoped route also checks group membership before
  touching any data. No WebSocket — the client just polls
  `GET /api/sessions/:id` every few seconds, which is plenty for a buy-in
  tracker (unlike `discord-gambling`'s live-hand poker room, nothing here is
  latency-sensitive).
- `src/shared/types.ts` — the `Account` / `Group` / `Session` / `Player` /
  `PhotoCount` / `SettlementResult` / `LeaderboardEntry` shapes, imported
  directly by the client (see below). **All money is integer cents, never
  floats.** `LeaderboardEntry.balanceCents` is the sum of that account's net
  across every settled table in one group — the group's "balance," not a
  single game's result.
- `client/` — Preact + Vite, built as a PWA via `vite-plugin-pwa`
  (`vite.config.ts`). Imports shared types from `../../src/shared/*.js`
  (same convention as `discord-gambling`'s client — note the `.js` extension
  on a `.ts`/`.tsx` import target; that's the ESM/Bundler-resolution
  convention this repo follows, not a typo).
  - `client/src/api.ts` — stores the bearer token in `localStorage`
    (`poker.authToken`) and attaches it to every request automatically.
  - `client/src/cv/chipCounter.ts` — the on-device, dependency-free chip
    counting heuristic (illumination correction → pixel color classification
    → connected blobs, split into individual stacks via a calibrated chip
    diameter → height/edge-based count estimate per stack). Now only the
    *fallback* path when `src/lib/chipVision.ts`'s AI counter is unavailable
    (no API key, offline, request failed) — see that file's doc comment.
    `client/src/cv/photo.ts`'s `encodeForVision()` produces a separate,
    higher-resolution JPEG for the AI call than the compressed thumbnail
    that gets stored on the entry. Either way, `PhotoFlow.tsx` always shows
    the result on an editable confirm screen (with a detected-stacks overlay
    on the photo) before a count is saved — never trust an unconfirmed
    detection for money.
  - `client/src/screens/` — `Login` (log in / sign up), `Groups` (list your
    groups, create one, join one by code), `GroupScreen` (a group's table
    lobby — create/rejoin a table — plus its `History` leaderboard tab),
    `ChipSetup` (host sets chip colors/values, `setup` status), `Table`
    (live buy-in/cash-out view, `active` status), `Settlement` (`settled`
    status).
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
