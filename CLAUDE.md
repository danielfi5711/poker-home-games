# CLAUDE.md

## What this is

An installable PWA for tracking local home poker games: real logins, host-approved buy-ins, cash-outs, automatic settlement (nets +
minimal payments) across the table, an all-time leaderboard with
winning/losing streaks, a full match history, and push notifications so a
host doesn't have to be staring at the app to approve a buy-in. No real
money moves through the app — it's a calculator for a cash game the friends
already play, not a payment product. Amounts are in shekels (₪).

Identity model: every player logs into an **account** (username/password).
The app is for one circle of friends, so there are **no groups**: every
account sees every **table** (a `Session`), and there is one shared
leaderboard/match history across all settled tables. (Groups existed
before and were removed on purpose to keep the app simple — old stored
sessions may still carry a stale `groupId` field; it is ignored.)

Buy-in model: a player requests a buy-in for an amount; it sits `pending`
until the host approves or denies it (the host's own requests auto-approve —
there's no one above the host). Only `approved` buy-ins count toward a
player's total or the settlement math. A single buy-in is capped at ₪50
(`MAX_BUY_IN_CENTS` in `src/shared/types.ts`, enforced by `requestBuyIn()` and
the buy-in sheet) — buy in again for more. Cash-outs don't need approval — a
player just records what they're leaving the table with (or the host enters
it for them in the settle sheet). Settling requires a cash-out for every
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
  table, start it (`activateSession`), request a buy-in (`requestBuyIn` —
  auto-approves for the host, `pending` for everyone else), approve/deny one
  (`respondToBuyIn`, host-only), close an unstarted table when its host leaves
  (`leaveSession`) or hasn't had the lobby open for 15 min (`closeAbandonedLobbies`,
  every 60s; presence = `hostSeenAt`, refreshed at most once a minute by the
  host's own lobby polling), record a cash-out (a player for themselves, or the host for anyone who
  didn't — that player is push-notified), and settle (host-only,
  doesn't require every player to have cashed out). Ownership is enforced
  server-side: buy-ins and cash-outs must be posted by the account that owns
  that seat (`requirePlayerOwnedBy`), and starting/approving/settling must
  come from the account that owns the host seat (`requireHost`) — a
  client-supplied `playerId` alone is never enough. `history()` also lives
  here: builds the per-match breakdown (`MatchSummary[]`), and walks each
  account's settled matches in chronological order to derive
  `currentStreakType`/`currentStreakCount` (the streak as of their most
  recent match — a breakeven game resets it to `null`/0), `longestWinStreak`/
  `longestLossStreak`, and `biggestWinCents`/`biggestLossCents`, which also
  feed the `HistoryHighlights` ("🔥 on a 3-game win streak", "💰 biggest win").
  Each `MatchSummary` also carries that game's `transfers` (by account and
  name) for the Games tab. Settling a table (`settleSession`) push-notifies
  every player at it with exactly whom they pay / who pays them.

- `src/lib/push.ts` — Web Push (VAPID). Stores each account's push
  subscription(s) (one per device/browser) and sends a notification when a
  non-host requests a buy-in (to the host) or when the host responds (to the
  requester). Silently disabled if `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`
  aren't set — the app still works, the host just won't get pushed until
  they reopen it. A 404/410 from a push send means that subscription expired
  and gets pruned automatically.
- `src/lib/settlement.ts` — `computeSettlement()`: nets everyone
  (`cashOut − approved buy-ins`), then greedily matches the largest creditor
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
  Pay with Bit; `confirmAskDueAt` = +60s) → `confirmed` (receiver said Got
  it). `sweepPaymentConfirmations()` (every 15s, started in `src/index.ts`)
  sends the receiver the "did it arrive?" push once the due time passes —
  persisted, so restarts don't lose it. "Not yet" resets to `unpaid` and
  pushes the payer. Bit can't be pre-filled or verified, hence this flow
  (pre-filled Bit links exist only for business accounts via payment
  providers). To compensate, the client's pay sheet (`screens/Payments.tsx`)
  is a 3-step guide with tap-to-copy number/amount chips; the number is
  copied before Bit opens, and on `visibilitychange` back to the app a
  "Paying X" sheet offers Copy amount / Back to Bit.
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
    dialog), the three bottom-nav tabs shown right after login — `Tables`
    (start/rejoin a table), `Leaderboard` (all-time standings with streak
    badges/highlights) and `Games` (recent settled games, each expandable to
    its per-player results and who-pays-whom transfers), `Lobby` (`setup` status — host starts the game once
    everyone's in), `Table` (live buy-in requests/approvals, cash-outs,
    `active` status), `AmountModal` (shared amount-entry sheet for buy-in
    requests and cash-outs), `ConfirmModal` (generic themed confirm dialog,
    used for logout), `Settlement` (`settled` status).
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
```
