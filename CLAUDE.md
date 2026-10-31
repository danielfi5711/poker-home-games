# CLAUDE.md

## What this is

An installable PWA for tracking local home poker games: real logins, host-approved buy-ins, cash-outs, automatic settlement (nets +
minimal payments) across the table, an all-time leaderboard with
winning/losing streaks, a full match history, and push notifications for
paying up after a game. No real
money moves through the app — it's a calculator for a cash game the friends
already play, not a payment product. Amounts are in shekels (₪).

Identity model: every player logs into an **account** (username/password).
The app is for one circle of friends, so there are **no groups**: every
account sees every **table** (a `Session`), and there is one shared
leaderboard/match history across all settled tables. (Groups existed
before and were removed on purpose to keep the app simple — old stored
sessions may still carry a stale `groupId` field; it is ignored.)

Bank model (`Session.bank`, every table opened since 2026-10-24): **the host is
the bank**. A player hands the host real money (cash/Bit — outside the app;
in-app payments were ruled out: processors ban poker money and paying out
winners needs a payment license) and requests a buy-in; it sits `pending`
until the host taps "Got the money" (approve) or denies it (the host's own
requests auto-approve — there's no one above the host). At settle, the host
pays every other player their whole cash-out (`computeSettlement`'s bank
branch), so the Payments are all host → player. Nets (and the leaderboard)
are the same as before. Older games without `bank` keep the old
losers-pay-winners transfers. Only `approved` buy-ins count toward a
player's total or the settlement math. A single buy-in is capped at ₪50
(`MAX_BUY_IN_CENTS` in `src/shared/types.ts`, enforced by `requestBuyIn()` and
the buy-in sheet) — buy in again for more. Cash-outs don't need approval — a
player just records what they're leaving the table with (or the host enters
it for them in the settle sheet). A cashed-out player can buy back in: once that
buy-in is approved, `reopenSeat()` moves their cash-out into
`earlierCashOutsCents` and clears `cashOut`, so they can cash out again; money
out is always `totalCashOutCents()` (earlier + current). Mistakes can be undone
until the game is settled: `removeBuyIn()` lets a player cancel their own
pending request (or the host cancel anyone's), and only the host can remove an
approved buy-in; a cash-out can be re-entered
any time (`recordCashOut` overwrites). Settling requires a cash-out for every
player and no pending buy-ins — a missing cash-out used to count as ₪0,
which made money vanish.

Usernames double as display names (no separate field) and are globally
unique, case- and whitespace-insensitively (`src/lib/accounts.ts`'s
`usernameIndex`) — any script's letters are allowed (Hebrew included), not
just ASCII, via a Unicode-aware regex.

## Layout

- `src/config.ts` — env parsing. `config.tursoUrl` blank = persist to local
  JSON files; set = use hosted libSQL (Turso) instead, same pattern as the
  `discord-gambling` project.
- `src/lib/store.ts` / `src/lib/libsql.ts` — copied near-verbatim from
  `discord-gambling`: a debounced-write JSON blob, backed by a file locally
  or a `kv` table row in libSQL in production. Accounts, sessions,
  and push subscriptions each get their **own** `JsonStore` instance/file
  (see `config.accountsFile` / `dataFile` / `pushFile`) — three
  independent blobs, not one shared object.
- `src/lib/accounts.ts` — registration/login. Passwords are hashed with
  `node:crypto`'s `scrypt` (no dependency) and stored as `salt:hash`; a
  logged-in account gets a random bearer token (`Authorization: Bearer …`)
  that the server maps back to an account id. Tokens don't expire — logout
  just deletes the token server-side.
- `src/lib/sessions.ts` — all table state mutation lives here: create/join a
  table (there's **no lobby** — a table is `active` the moment it's opened,
  and anyone can join until it's settled; the lobby/`setup` status was removed
  on purpose, and the `2026-10-24-no-lobby` migration moved old lobbies to
  `active`), request a buy-in (`requestBuyIn` —
  auto-approves for the host, `pending` for everyone else), approve/deny one
  (`respondToBuyIn`, host-only), close a table nobody has bought in at
  (`closeEmptyTable`, host-only, `POST /api/sessions/:id/close`; and
  `closeEmptyTables` every 60s closes ones still empty 2 hours after opening —
  a denied buy-in doesn't count as money on the table), record a cash-out (a player for themselves, or the host for anyone who
  didn't), and settle (host-only). Ownership is enforced
  server-side: buy-ins and cash-outs must be posted by the account that owns
  that seat (`requirePlayerOwnedBy`), and closing/approving/settling must
  come from the account that owns the host seat (`requireHost`) — a
  client-supplied `playerId` alone is never enough. `history()` also lives
  here: builds the per-match breakdown (`MatchSummary[]`), and walks each
  account's settled matches in chronological order to derive
  `currentStreakType`/`currentStreakCount` (the streak as of their most
  recent match — a breakeven game resets it to `null`/0), `longestWinStreak`/
  `longestLossStreak`, and `biggestWinCents`/`biggestLossCents`, which also
  feed the `HistoryHighlights` ("🔥 on a 3-game win streak", "💰 biggest win").
  Each `MatchSummary` also carries that game's `transfers` (by account and
  name) for the Games tab. `history(sinceMs)` (`GET /api/history?since=`)
  narrows everything to games settled from then on — the Leaderboard tab's
  This month / This year / All time switch sends the start of the period on
  the player's own clock. `reopenSession()` (`POST /api/sessions/:id/reopen`,
  host-only) undoes a settle — back to `active`, payments dropped — but only
  within `REOPEN_WINDOW_MS` (15 min) and while every payment is still
  `unpaid`; `canReopen()` in `src/shared/types.ts` is the client's mirror of
  that check (button on the Settlement screen and the host's Games card).
  `profile(accountId)` (`GET /api/profiles/:accountId`) reuses `history()` to
  build one player's `PlayerProfile`: their leaderboard row and rank,
  won/even/lost counts, running balance after each game (the chart), every
  game with their place at that table, and the 3 players they've shared the
  most tables with. Any screen opens a profile with `openProfile()` /
  `profileTap()` from `client/src/profileNav.ts`; `App` keeps a stack of
  opened profiles so Back walks back through them.

- `src/lib/push.ts` — Web Push (VAPID). Stores each account's push
  subscription(s) (one per device/browser). Only payments push: "says they
  paid" (to the receiver) and confirmed / "still need
  to pay" (to the payer) — table events (buy-ins, cash-outs, closing,
  settling) deliberately don't. Silently disabled if
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` aren't set. A 404/410 from a push send means that subscription expired
  and gets pruned automatically.
- `src/lib/avatars.ts` — profile pictures, in their own store
  (`config.avatarsFile`). The client (`client/src/avatars.ts`) center-crops a
  picked photo to a 256px JPEG and uploads it as a data URL
  (`PUT`/`DELETE /api/auth/avatar`). Each upload gets a random `version`;
  `GET /api/avatars` (auth) returns `accountId -> version`, and the image is
  served unauthenticated at `/api/avatars/:accountId/:version` (an `<img>`
  can't send the bearer token; the random version makes it unguessable and
  lets it be cached forever). `Avatar` in `ui.tsx` shows the photo when the
  shared map has one, initials otherwise — so every avatar in the app
  (keyed by account id) picks it up.
- `src/lib/settlement.ts` — `computeSettlement()`: nets everyone
  (`cashOut − approved buy-ins`). On a bank game, transfers are host → each
  player for `totalCashOutCents` (none for ₪0 or the host). Otherwise it greedily matches the largest creditor
  against the largest debtor until everyone is settled (Splitwise-style
  minimum cash flow). `discrepancyCents` (nets not summing to zero) means a
  buy-in or cash-out doesn't add up — surfaced as a warning, not an error.
- `src/web/server.ts` — plain `node:http`, no framework: a handful of REST
  routes under `/api/*` plus static-serving the built client with a
  SPA-style fallback to `index.html`. Every route except register/login
  calls `requireAuth()` (resolves the bearer token to an `Account`), and
  any logged-in account may see or join any table. No WebSocket — the client just polls
  `GET /api/sessions/:id` every few seconds, which is plenty for a buy-in
  tracker (unlike `discord-gambling`'s live-hand poker room, nothing here is
  latency-sensitive); push notifications cover the "host isn't looking at
  the app right now" case instead.
- `src/shared/types.ts` — the `Account` / `Session` / `Player` /
  `BuyIn` / `CashOut` / `SettlementResult` / `LeaderboardEntry` /
  `MatchSummary` / `HistoryHighlights` shapes, imported directly by the
  client (see below). **All money is in shekels, stored as integer
  agorot/cents, never floats** — field names stay `*Cents` regardless.
  `LeaderboardEntry.balanceCents` is the sum of that account's net across
  every settled table — the all-time leaderboard shown
  in the Leaderboard tab.
  `Payment` (stored on `Session.payments`, created by `settleSession()`) is
  one who-pays-whom debt: `unpaid` → `awaiting_confirmation` (payer tapped
  "I've paid" — `markPaid`, `POST /api/payments/:id/paid` — which pushes the
  receiver right away) → `confirmed` (receiver said Got it). "Not yet" resets
  to `unpaid` and pushes the payer. The receiver can tap "Got it" at any
  time, even on an `unpaid` payment (cash, forgot to tap). The app doesn't
  link to any payment app — players pay however they like (there used to be
  an "Open Bit" flow; it was removed on purpose).
  `Account.phone` (Israeli mobile, normalized `05XXXXXXXX`) is required at
  register and settable via `PUT /api/auth/phone`; older accounts have
  `null` and the client blocks on a phone form until set.
- `client/` — Preact + Vite, built as a PWA via `vite-plugin-pwa`
  (`vite.config.ts`), using the `injectManifest` strategy (not the default
  `generateSW`) because `client/src/sw.ts` needs its own `push` /
  `notificationclick` handlers — `generateSW` only supports the built-in
  caching strategies, no custom event handlers. Imports shared types from
  `../../src/shared/*.js` (same convention as `discord-gambling`'s client —
  note the `.js` extension on a `.ts`/`.tsx` import target; that's the
  ESM/Bundler-resolution convention this repo follows, not a typo).
  - `client/src/api.ts` — stores the bearer token in `localStorage`
    (`poker.authToken`) and attaches it to every request automatically.
  - `client/src/push.ts` — `ensurePushSubscription()`, called after
    login/boot: requests Notification permission, subscribes via the service
    worker's `PushManager`, and registers the subscription with the server.
    Fails silently wherever push isn't supported or permission is denied.
  - `client/src/avatarColor.ts` — a deterministic hue-from-string hash so
    every player gets a distinct, consistent avatar color instead of one
    flat gray.
  - `client/src/sessionName.ts` — `autoSessionName()`: a table's name is
    always picked automatically from the *host device's* local day/time
    (e.g. "Thursday Evening"), never typed — there's no name field in the
    create-table UI at all.
  - `client/src/screens/` — `Login` (log in / sign up — no separate display
    name field), `Settings` (change name, log out — behind a confirm
    dialog), the bottom-nav tabs shown right after login — `Tables`
    (start/rejoin a table), `Leaderboard` (all-time standings with streak
    badges/highlights), `Games` (recent settled games, each expandable to
    its per-player results and who-pays-whom transfers) and `Odds` (see below), `Table` (live buy-in requests/approvals, cash-outs,
    `active` status; the host gets "Close table" instead of "End game & settle
    up" while nobody has bought in), `AmountModal` (shared amount-entry sheet for buy-in
    requests and cash-outs), `ConfirmModal` (generic themed confirm dialog,
    used for logout), `Settlement` (`settled` status).
- `src/shared/odds.ts` — the Odds tab's math, run entirely in the client (no
  server route): a 5–7 card Hold'em evaluator (category + tie-break ranks
  packed into one comparable number) and win/tie/equity tallies for up to
  `MAX_HANDS` (6) known hands. Flop/turn/river count every remaining board
  exactly (`exactOdds`, ≤1,081 boards); pre-flop samples (`sampleOdds`) —
  `client/src/screens/Odds.tsx` runs it in 3,000-board chunks up to 60,000
  so the numbers appear at once and the UI never blocks. The chosen hands,
  board and street live only in `localStorage` (`poker.odds`). Tests are in
  `src/lib/odds.test.ts` — not `src/shared/`, since the client tsconfig
  includes that folder and has no `node:test` types.
- `scripts/gen-icons.mjs` — generates the PWA/`apple-touch-icon` PNGs with
  zero image-library dependencies (hand-rolled PNG/CRC32 writer over
  `node:zlib`). Re-run it if you change the icon art in that script.
- `.github/workflows/keep-alive.yml` — pings `/healthz` every 10 minutes,
  forever, so Render's free tier never spins the app down from inactivity.
  Only free/unlimited because the repo is **public**; see the README for the
  private-repo tradeoff if that ever changes.

## Languages (English / Hebrew)

- `client/src/i18n.ts` holds every UI string: `en` is the source, `he` is
  typed `Strings` (= `typeof en`) so a missing key is a type error. Import the
  live binding `tr` and read `tr.section.key` (functions for anything with
  names/amounts/counts). Never hard-code UI text in a screen.
- `setLang()` stores the choice in `localStorage` (`poker.lang`; default =
  device language), sets `<html lang/dir>` (Hebrew = `rtl`) and re-renders via
  `useLang()` in `App` and `InstallGate`. The switch (`LangSwitch` in
  `ui.tsx`) is on the login screen, install gate and Settings.
- RTL: use logical CSS (`inset-inline-*`, `margin-inline-*`), give
  direction arrows `class="dir-icon"` (mirrored in RTL), wrap phone numbers
  in `<bdi dir="ltr">`. Hebrew glyphs come from Rubik (Sora/Inter have none).
- Hebrew copy is gender-neutral about other players (a name doesn't tell
  us), uses noun/infinitive forms for buttons; buy-in = "קנייה",
  cash-out = "פדיון", settle up = "התחשבנות".
- Server: every request sends `X-Lang`; errors are still thrown in English
  and translated on the way out (`translateError` in `src/lib/i18n.ts` — add
  the Hebrew there when adding an error). `Account.lang` (synced by `App`
  via `PUT /api/auth/lang`) picks each recipient's push language:
  `notify(accountId, (t) => ({ title, body, url }))` with `t = pushText(lang)`.

## Conventions

- ESM + `NodeNext` resolution on the server: **relative imports need `.js`
  extensions**, same as `discord-gambling`.
- Money is integer cents (agorot) everywhere, both server and client
  (`client/src/money.ts` has the only `₪`-formatting/parsing).
- A buy-in is only `pending`, `approved`, or `denied`; only `approved`
  buy-ins are ever summed for a total or settlement — never trust a
  `pending` one for money.
- `settleSession()` is host-only and **refuses** (409) while any player has
  no cash-out or any buy-in is still pending. The client's `SettleSheet`
  collects every cash-out with a live in-vs-out total (and can fill the last
  one with the remainder); a non-zero difference needs an explicit "settle
  anyway". `usePolledSession` (client/src/api.ts) drops poll responses older
  than the latest local update so an in-flight poll can't revert an action.

## Checks

```sh
npm run typecheck
npm test
```

Tests use `node:test` (`src/**/*.test.ts`, excluded from the build).
`sessions.test.ts` blanks the Turso/VAPID env vars and points the stores at a
temp dir *before* importing anything, so a local `.env` can never make the
tests touch production data or send real pushes.
