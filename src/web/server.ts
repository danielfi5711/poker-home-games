import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { config } from '../config.js';
import { AuthError, accountForToken, login, logout, register } from '../lib/accounts.js';
import { ChipVisionError, countChipsWithAI } from '../lib/chipVision.js';
import { GroupError, createGroup, getGroup, groupsForAccount, joinGroup, requireMember } from '../lib/groups.js';
import {
  SessionError,
  addBuyIn,
  activateSession,
  createSession,
  getSession,
  history,
  joinSession,
  previewSettlement,
  recordCashOut,
  sessionsForGroup,
  settleSession,
  updatePalette,
} from '../lib/sessions.js';
import type { Account, ChipColor, Session } from '../shared/types.js';

const PUBLIC_DIR = join(process.cwd(), 'dist', 'public');
/** Photos are compressed client-side before upload, but allow headroom. */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const filePath = normalize(join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': pathname === '/index.html' ? 'no-cache' : 'public, max-age=86400',
    });
    res.end(body);
  } catch {
    // SPA fallback: unknown non-asset path -> serve index.html
    if (!extname(pathname)) {
      try {
        const body = await readFile(join(PUBLIC_DIR, 'index.html'));
        res.writeHead(200, { 'content-type': CONTENT_TYPES['.html'] });
        res.end(body);
        return;
      } catch {
        /* fall through */
      }
    }
    res.writeHead(404).end('Not found');
  }
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
} as const;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

/** Read a JSON request body (capped), or null if it is missing / malformed / too large. */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return null;
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function str(body: Record<string, unknown> | null, key: string): string {
  const v = body?.[key];
  return typeof v === 'string' ? v : '';
}

function countsMap(body: Record<string, unknown> | null, key: string): Record<string, number> | undefined {
  const v = body?.[key];
  if (!v || typeof v !== 'object') return undefined;
  return v as Record<string, number>;
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

function requireAuth(req: IncomingMessage): Account {
  const token = bearerToken(req);
  const account = token ? accountForToken(token) : null;
  if (!account) throw new AuthError('Please log in.', 401);
  return account;
}

function requireSessionAccess(session: Session, accountId: string): void {
  requireMember(getGroup(session.groupId), accountId);
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  try {
    // --- Auth --------------------------------------------------------------

    // POST /api/auth/register
    if (req.method === 'POST' && parts.length === 3 && parts[1] === 'auth' && parts[2] === 'register') {
      const body = await readJsonBody(req);
      const result = register(str(body, 'username'), str(body, 'password'), str(body, 'displayName'));
      return sendJson(res, 201, result);
    }

    // POST /api/auth/login
    if (req.method === 'POST' && parts.length === 3 && parts[1] === 'auth' && parts[2] === 'login') {
      const body = await readJsonBody(req);
      const result = login(str(body, 'username'), str(body, 'password'));
      return sendJson(res, 200, result);
    }

    // POST /api/auth/logout
    if (req.method === 'POST' && parts.length === 3 && parts[1] === 'auth' && parts[2] === 'logout') {
      const token = bearerToken(req);
      if (token) logout(token);
      return sendJson(res, 200, { ok: true });
    }

    // GET /api/auth/me
    if (req.method === 'GET' && parts.length === 3 && parts[1] === 'auth' && parts[2] === 'me') {
      const account = requireAuth(req);
      return sendJson(res, 200, { account });
    }

    // --- Groups --------------------------------------------------------------

    // POST /api/groups
    if (req.method === 'POST' && parts.length === 2 && parts[1] === 'groups') {
      const account = requireAuth(req);
      const body = await readJsonBody(req);
      const group = createGroup(str(body, 'name'), account.id);
      return sendJson(res, 201, { group });
    }

    // GET /api/groups
    if (req.method === 'GET' && parts.length === 2 && parts[1] === 'groups') {
      const account = requireAuth(req);
      return sendJson(res, 200, { groups: groupsForAccount(account.id) });
    }

    // POST /api/groups/join
    if (req.method === 'POST' && parts.length === 3 && parts[1] === 'groups' && parts[2] === 'join') {
      const account = requireAuth(req);
      const body = await readJsonBody(req);
      const group = joinGroup(str(body, 'joinCode'), account.id);
      return sendJson(res, 200, { group });
    }

    if (parts[0] === 'api' && parts[1] === 'groups' && parts[2] && parts[2] !== 'join') {
      const groupId = parts[2];

      // GET /api/groups/:id
      if (req.method === 'GET' && parts.length === 3) {
        const account = requireAuth(req);
        const group = getGroup(groupId);
        requireMember(group, account.id);
        return sendJson(res, 200, { group });
      }

      // GET /api/groups/:id/history
      if (req.method === 'GET' && parts.length === 4 && parts[3] === 'history') {
        const account = requireAuth(req);
        requireMember(getGroup(groupId), account.id);
        return sendJson(res, 200, history(groupId));
      }

      // GET /api/groups/:id/sessions — tables in this group
      if (req.method === 'GET' && parts.length === 4 && parts[3] === 'sessions') {
        const account = requireAuth(req);
        requireMember(getGroup(groupId), account.id);
        return sendJson(res, 200, { sessions: sessionsForGroup(groupId) });
      }

      // POST /api/groups/:id/sessions — create a table in this group
      if (req.method === 'POST' && parts.length === 4 && parts[3] === 'sessions') {
        const account = requireAuth(req);
        requireMember(getGroup(groupId), account.id);
        const body = await readJsonBody(req);
        const result = createSession(groupId, str(body, 'name'), account);
        return sendJson(res, 201, result);
      }
    }

    // --- Sessions (tables) ---------------------------------------------------

    if (parts[0] === 'api' && parts[1] === 'sessions' && parts[2]) {
      const id = parts[2];

      // GET /api/sessions/:id
      if (req.method === 'GET' && parts.length === 3) {
        const account = requireAuth(req);
        const session = getSession(id);
        requireSessionAccess(session, account.id);
        return sendJson(res, 200, { session });
      }

      // POST /api/sessions/:id/join
      if (req.method === 'POST' && parts.length === 4 && parts[3] === 'join') {
        const account = requireAuth(req);
        requireSessionAccess(getSession(id), account.id);
        return sendJson(res, 200, joinSession(id, account));
      }

      // PUT /api/sessions/:id/palette
      if (req.method === 'PUT' && parts.length === 4 && parts[3] === 'palette') {
        const account = requireAuth(req);
        requireSessionAccess(getSession(id), account.id);
        const body = await readJsonBody(req);
        const palette = Array.isArray(body?.palette) ? body.palette : [];
        return sendJson(res, 200, { session: updatePalette(id, account.id, palette) });
      }

      // POST /api/sessions/:id/activate
      if (req.method === 'POST' && parts.length === 4 && parts[3] === 'activate') {
        const account = requireAuth(req);
        requireSessionAccess(getSession(id), account.id);
        return sendJson(res, 200, { session: activateSession(id, account.id) });
      }

      // GET /api/sessions/:id/settlement
      if (req.method === 'GET' && parts.length === 4 && parts[3] === 'settlement') {
        const account = requireAuth(req);
        requireSessionAccess(getSession(id), account.id);
        return sendJson(res, 200, { settlement: previewSettlement(id) });
      }

      // POST /api/sessions/:id/settle
      if (req.method === 'POST' && parts.length === 4 && parts[3] === 'settle') {
        const account = requireAuth(req);
        requireSessionAccess(getSession(id), account.id);
        return sendJson(res, 200, settleSession(id, account.id));
      }

      // POST /api/sessions/:id/vision-count — AI chip-stack count for a photo (a suggestion only; never trusted for money)
      if (req.method === 'POST' && parts.length === 4 && parts[3] === 'vision-count') {
        const account = requireAuth(req);
        const session = getSession(id);
        requireSessionAccess(session, account.id);
        const body = await readJsonBody(req);
        const photo = str(body, 'photo');
        if (!photo) throw new ChipVisionError('No photo provided.', 400);
        const result = await countChipsWithAI(photo, session.chipPalette);
        return sendJson(res, 200, result);
      }

      // POST /api/sessions/:id/players/:playerId/buyins|cashout
      if (req.method === 'POST' && parts.length === 6 && parts[3] === 'players' && (parts[5] === 'buyins' || parts[5] === 'cashout')) {
        const account = requireAuth(req);
        requireSessionAccess(getSession(id), account.id);
        const playerId = parts[4];
        const body = await readJsonBody(req);
        const photo = typeof body?.photo === 'string' ? body.photo : null;
        const detected = countsMap(body, 'detectedCounts');
        const confirmed = countsMap(body, 'confirmedCounts');
        const session =
          parts[5] === 'buyins'
            ? addBuyIn(id, playerId, account.id, photo, detected, confirmed)
            : recordCashOut(id, playerId, account.id, photo, detected, confirmed);
        return sendJson(res, 200, { session });
      }
    }
  } catch (err) {
    if (err instanceof SessionError || err instanceof GroupError || err instanceof AuthError || err instanceof ChipVisionError) {
      return sendJson(res, err.status, { error: err.message });
    }
    console.error(err);
    return sendJson(res, 500, { error: 'Something went wrong.' });
  }

  sendJson(res, 404, { error: 'Not found' });
}

export function startWebServer(): void {
  const server = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      void handleApi(req, res, url);
      return;
    }
    void serveStatic(req, res);
  });

  server.listen(config.port, () => {
    console.log(`Poker Home Games listening on ${config.publicUrl} (port ${config.port})`);
  });
}
