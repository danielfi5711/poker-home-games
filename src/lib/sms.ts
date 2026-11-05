import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import type { Lang } from '../shared/types.js';

/**
 * Sends and checks SMS verification codes for the recovery phone.
 *
 * - Production: Twilio Verify (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID).
 *   Twilio generates the code, sends it, expires it and limits retries on its side.
 * - Development / tests (not production, no Twilio keys): a fake sender that keeps the code in memory and
 *   prints it to the server console, so the whole flow can be tried without a Twilio account.
 * - Production without Twilio keys: disabled. The app then hides every phone feature, so sign-up keeps
 *   working as username + password until the keys are added.
 */

export class SmsError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface SmsProvider {
  send(phone: string, lang: Lang): Promise<void>;
  /** True if `code` is the right, unexpired code for `phone`. A correct code is used up. */
  check(phone: string, code: string): Promise<boolean>;
}

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CHECKS_PER_CODE = 5;

/** In-memory codes, printed to the console. Never used in production. */
class ConsoleProvider implements SmsProvider {
  private codes = new Map<string, { hash: Buffer; expiresAt: number; checks: number }>();
  /** Last code sent per phone, so tests can read it. */
  readonly sent = new Map<string, string>();

  async send(phone: string): Promise<void> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.codes.set(phone, { hash: digest(code), expiresAt: Date.now() + CODE_TTL_MS, checks: 0 });
    this.sent.set(phone, code);
    console.log(`[sms] (dev, not sent) code for ${phone}: ${code}`);
  }

  async check(phone: string, code: string): Promise<boolean> {
    const entry = this.codes.get(phone);
    if (!entry || entry.expiresAt < Date.now()) return false;
    entry.checks += 1;
    if (entry.checks > MAX_CHECKS_PER_CODE) {
      this.codes.delete(phone);
      return false;
    }
    const ok = timingSafeEqual(entry.hash, digest(code.trim()));
    if (ok) this.codes.delete(phone);
    return ok;
  }
}

function digest(code: string): Buffer {
  return createHash('sha256').update(code).digest();
}

class TwilioVerifyProvider implements SmsProvider {
  constructor(
    private accountSid: string,
    private authToken: string,
    private serviceSid: string,
  ) {}

  private async post(path: string, params: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`https://verify.twilio.com/v2/Services/${this.serviceSid}/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body };
  }

  async send(phone: string, lang: Lang): Promise<void> {
    const { status, body } = await this.post('Verifications', { To: phone, Channel: 'sms', Locale: lang });
    if (status === 429 || body.code === 60203) throw new SmsError('Too many codes sent. Try again later.', 429);
    if (status === 400 && (body.code === 60200 || body.code === 21211 || body.code === 21614)) {
      throw new SmsError('Enter a valid mobile number, like 050-123-4567 or +1 555 123 4567.', 400);
    }
    if (status >= 300) {
      console.error('[sms] Twilio send failed', status, body.code, body.message);
      throw new SmsError("Couldn't send the code. Try again in a minute.", 502);
    }
  }

  async check(phone: string, code: string): Promise<boolean> {
    const { status, body } = await this.post('VerificationCheck', { To: phone, Code: code.trim() });
    if (status === 429) throw new SmsError('Too many attempts. Try again later.', 429);
    // 404 = no pending code (expired, used up, or never sent).
    if (status === 404) return false;
    if (status >= 300) {
      console.error('[sms] Twilio check failed', status, body.code, body.message);
      throw new SmsError("Couldn't check the code. Try again in a minute.", 502);
    }
    return body.status === 'approved';
  }
}

function makeProvider(): SmsProvider | null {
  const { twilioAccountSid, twilioAuthToken, twilioVerifyServiceSid } = config;
  if (twilioAccountSid && twilioAuthToken && twilioVerifyServiceSid) {
    return new TwilioVerifyProvider(twilioAccountSid, twilioAuthToken, twilioVerifyServiceSid);
  }
  return config.isProd ? null : new ConsoleProvider();
}

let provider: SmsProvider | null = makeProvider();

/** Whether phone verification (and so password recovery by phone) is available. */
export function smsEnabled(): boolean {
  return provider !== null;
}

// --- Rate limits (on top of Twilio's own) ------------------------------------------------------------------------
// Per phone: at most 3 codes per 10 minutes and 10 per day. Kept in memory: a restart resets them, which is fine
// for a guard against someone hammering one number (Twilio still enforces its own limits).
const SEND_WINDOWS: Array<{ ms: number; max: number }> = [
  { ms: 10 * 60 * 1000, max: 3 },
  { ms: 24 * 60 * 60 * 1000, max: 10 },
];
const sendLog = new Map<string, number[]>();

function takeSendSlot(phone: string): void {
  const now = Date.now();
  const longest = Math.max(...SEND_WINDOWS.map((w) => w.ms));
  const times = (sendLog.get(phone) ?? []).filter((t) => now - t < longest);
  for (const w of SEND_WINDOWS) {
    if (times.filter((t) => now - t < w.ms).length >= w.max) {
      throw new SmsError('Too many codes sent. Try again later.', 429);
    }
  }
  times.push(now);
  sendLog.set(phone, times);
}

export async function sendCode(phone: string, lang: Lang): Promise<void> {
  if (!provider) throw new SmsError('Phone verification is not available.', 503);
  takeSendSlot(phone);
  await provider.send(phone, lang);
}

export async function checkCode(phone: string, code: string): Promise<boolean> {
  if (!provider) throw new SmsError('Phone verification is not available.', 503);
  if (!/^\s*\d{4,10}\s*$/.test(code)) return false;
  return provider.check(phone, code);
}

/** Tests only: the last code the fake sender "sent" to a phone. */
export function lastDevCode(phone: string): string | undefined {
  return provider instanceof ConsoleProvider ? provider.sent.get(phone) : undefined;
}

/** Tests only: clear rate-limit history. */
export function resetSmsLimits(): void {
  sendLog.clear();
}
