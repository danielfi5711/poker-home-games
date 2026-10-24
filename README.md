# Poker Home Games

An installable app (PWA — add it to your phone's home screen, no App Store
needed) for tracking local poker nights: players request buy-ins, the host
approves them, the host ends the game whenever they're ready, and the app
works out who pays whom — plus a leaderboard (this month, this year or all
time) with winning/losing streaks and a full match history. No real money moves through
the app; it's a calculator for a cash game your friends already play. Amounts
are in shekels (₪).

## How it works

1. **Sign up** with a username and password — no separate display name, your
   username *is* what friends see everywhere (letters from any language,
   including Hebrew, are fine). Usernames are unique, case-insensitively.
2. **Host starts a table** — its name is picked automatically
   from the day and time (e.g. "Thursday Evening"), no typing needed. Everyone
   else sees it appear in the table list and taps it to join — no codes or
   groups; the app is just for one circle of friends, so every account shares
   the same tables and leaderboard. The table is live straight away —
   people join and buy in as they arrive. If nobody has bought in yet, the
   host can **Close table** (opened by mistake, game's off); a table still
   empty after 2 hours closes by itself.
3. **Buy-ins are host-approved**: a player taps "Request a buy-in," enters an
   amount, and it sits pending until the host approves or denies it on the
   table screen (players just tell the host at the table, so there's no
   notification for it). The host's own buy-ins are approved automatically.
4. **Cash-out**: a player enters what they're leaving the table with (even
   ₪0 is a valid cash-out). If someone leaves without entering theirs, the
   host can cash them out from their row on the table screen.
5. The host taps **Settle game**: a sheet lists every player with a cash-out
   box (already-entered ones filled in) and a live "money in vs. money out"
   total, so nothing is silently counted as ₪0. Settling computes each player's net and
   the minimum set of payments to square everyone up, and flags it if the
   buy-ins and cash-outs don't quite add up.
6. Everyone sees the results and exactly whom to pay (or who pays them) and
   how much. The game then shows up in the **Games** tab (bottom bar) with its
   results and payments, and folds into the **Leaderboard** tab (balance,
   winning/losing streaks, biggest win/loss — for this month, this year or all
   time). Made a mistake? For 15 minutes after settling, and as long as nobody
   has marked a payment yet, the host can **Reopen game** (on the results
   screen or the game's card in the Games tab) to fix it and settle again.
7. **Payments tab**: every debt you owe or are owed. Pay however you like,
   then tap **I've paid** — the receiver is asked "did it arrive?" — **Got
   it** marks it paid; **Not yet** puts it back to unpaid and notifies the
   payer they still owe. A phone number (Israeli mobile) is required at
   sign-up; older accounts are asked for one on their next open.

## Push notifications

Only payments send notifications: the receiver hears when someone says they
paid, and the payer hears when it's confirmed or when they still owe. Table
events (buy-ins, cash-outs, settling) deliberately don't. It uses standard Web Push — no third-party notification
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
   Without them, the app still works; payment updates just show up the next
   time someone opens it.
5. Open the deployed URL on your phone and use the browser's "Add to Home
   Screen" (Safari) / "Install app" (Chrome) prompt to install it — that's
   the whole app-store-free "app" install. An Android user who wants a real
   downloadable `.apk` instead can use the one published under this repo's
   GitHub Releases (built as a Trusted Web Activity wrapping this same site).
6. `.github/workflows/keep-alive.yml` pings `/healthz` every 10 minutes via
   GitHub Actions, forever, for free — Render's free tier spins the app down
   after ~15 minutes of no traffic otherwise, causing a slow cold start on
   the next real request. This only runs free-of-charge with no Actions-minute
   limit because the repo is **public**; a private repo would need a reduced
   ping frequency (to stay within the free 2000-min/month quota) or an
   external pinger like cron-job.org/UptimeRobot instead.

## Known limitations (first cut)

- Login tokens don't expire (there's no session-timeout/refresh flow) — fine
  for a casual friends-only app, not meant to hold anything sensitive.
- Push notifications need the app installed (Add to Home Screen / the
  Android app) — a plain browser tab can still subscribe on most platforms,
  but iOS specifically requires the installed/standalone PWA.
