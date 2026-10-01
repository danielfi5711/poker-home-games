# Poker Home Games

An installable app (PWA — add it to your phone's home screen, no App Store
needed) for tracking local poker nights: players request buy-ins, the host
approves them (with a push notification, so they don't have to be staring at
their phone), everyone cashes out at the end, and the app works out who pays
whom — plus an all-time per-group leaderboard of every account's balance
across game nights. No real money moves through the app; it's a calculator
for a cash game your group already plays.

## How it works

1. **Sign up** with a username and password — this is what ties your buy-ins
   and cash-outs to *you* across every game, instead of a typed name anyone
   could reuse.
2. **Create or join a group** — a group is one friend circle with its own
   join code and its own leaderboard. Your poker buddies and your work
   league can be two completely separate groups with separate standings.
3. **Host creates a table** inside a group; anyone else in the group sees it
   appear in the group's table list and taps it to join — no extra code to
   type or link to share for the table itself, since group membership
   already controls who can get in. The host taps **Start game** once
   everyone's seated.
4. **Buy-ins are host-approved**: a player taps "Request a buy-in," enters a
   dollar amount, and it sits pending until the host approves or denies it —
   the host gets a push notification the moment it comes in, even if the app
   isn't open. The host's own buy-ins are approved automatically.
5. **Cash-out**: at the end of the night, each player enters what they're
   leaving the table with (even $0 is a valid cash-out).
6. Once everyone has cashed out, the host taps **Settle game**: it computes
   each player's net and the minimum set of payments to square everyone up,
   and flags it if the buy-ins and cash-outs don't quite add up.
7. That table's result folds into the group's **All-Time Leaderboard** —
   each account's balance is the running sum of its net across every settled
   table in that group.

## Push notifications

Hosts get notified (and players get notified back when their request is
approved/denied) via standard Web Push — no third-party notification
service, no extra account needed beyond the keys below. It works on
Android, and on iPhone too as long as the PWA is installed via "Add to Home
Screen" (iOS 16.4+).

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
4. For push notifications to work, generate a VAPID key pair once with
   `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY` /
   `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (e.g. `mailto:you@example.com`) in
   the Render dashboard — use the **same pair** in every environment.
   Without them, the app still works; hosts just won't get pushed until they
   reopen it.
5. Open the deployed URL on your phone and use the browser's "Add to Home
   Screen" (Safari) / "Install app" (Chrome) prompt to install it — that's
   the whole app-store-free "app" install. An Android user who wants a real
   downloadable `.apk` instead can use the one published under this repo's
   GitHub Releases (built as a Trusted Web Activity wrapping this same site).

## Known limitations (first cut)

- Login tokens don't expire (there's no session-timeout/refresh flow) — fine
  for a casual friend-group app, not meant to hold anything sensitive.
- Push notifications need the app installed (Add to Home Screen / the
  Android app) — a plain browser tab can still subscribe on most platforms,
  but iOS specifically requires the installed/standalone PWA.
