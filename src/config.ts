import 'dotenv/config';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

export const config = {
  nodeEnv,
  isProd,

  /** Port the HTTP server listens on. */
  port: num('PORT', 8080),
  /**
   * Public base URL the app is reached at (no trailing slash). Prefers
   * PUBLIC_URL, then Render's injected RENDER_EXTERNAL_URL, then localhost.
   */
  publicUrl: trimTrailingSlash(
    process.env.PUBLIC_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      `http://localhost:${num('PORT', 8080)}`,
  ),

  /** Hosted libSQL (Turso) URL. Blank = persist to local JSON files instead. */
  tursoUrl: process.env.TURSO_DATABASE_URL ?? '',
  tursoAuthToken: process.env.TURSO_AUTH_TOKEN ?? '',

  dataFile: process.env.DATA_FILE ?? 'data/sessions.json',
  accountsFile: process.env.ACCOUNTS_FILE ?? 'data/accounts.json',
  groupsFile: process.env.GROUPS_FILE ?? 'data/groups.json',

  /**
   * A session with no activity (no buy-in, cash-out, or setup change) for
   * this many days is left out of the default history/leaderboard view
   * (still reachable by its join code). Keeps a long-running group's
   * leaderboard from being dominated by ancient test games.
   */
  historyWindowDays: num('HISTORY_WINDOW_DAYS', 365),

  /**
   * Claude API key for AI chip-stack counting (src/lib/chipVision.ts). Blank
   * = that endpoint is disabled and the client falls back to its on-device
   * pixel-heuristic counter.
   */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  /** Vision model used for chip counting — favors accuracy over latency/cost, both negligible at this app's scale. */
  chipVisionModel: process.env.CHIP_VISION_MODEL || 'claude-opus-5',
} as const;

// --- Production safety checks -------------------------------------------------
if (config.isProd && !config.tursoUrl) {
  console.warn(
    '[config] NODE_ENV=production but TURSO_DATABASE_URL is not set — session data will ' +
      'NOT survive a redeploy on an ephemeral host.',
  );
}
if (config.isProd && !config.anthropicApiKey) {
  console.warn(
    '[config] ANTHROPIC_API_KEY is not set — AI chip counting is disabled; the app will fall ' +
      'back to the on-device pixel-heuristic counter.',
  );
}
