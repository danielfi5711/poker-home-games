import type { Lang } from '../shared/types.js';
import { USERNAME_FORMAT_MESSAGE } from './accounts.js';

/**
 * Server-side text in each UI language. Errors are still thrown in English
 * (that's what the code and logs read) and translated on the way out by
 * `translateError`, using the request's `X-Lang` header. Push notifications
 * are built in the recipient's own language (`Account.lang`).
 */

const HE_ERRORS: Record<string, string> = {
  'Enter a valid Israeli mobile number, like 050-123-4567.': 'יש להזין מספר נייד ישראלי תקין, למשל 050-123-4567.',
  'Password must be at least 6 characters.': 'הסיסמה צריכה להכיל לפחות 6 תווים.',
  'That username is already taken.': 'שם המשתמש הזה כבר תפוס.',
  'Incorrect username or password.': 'שם משתמש או סיסמה שגויים.',
  'Account not found.': 'החשבון לא נמצא.',
  'Incorrect password.': 'סיסמה שגויה.',
  [USERNAME_FORMAT_MESSAGE]:
    'השם צריך להכיל 3–24 תווים: אותיות (בכל שפה), ספרות, רווחים, "_", "." או "-" — ולא להתחיל או להסתיים ברווח או בסימן.',
  'This table is gone — the host closed it.': 'השולחן הזה כבר לא קיים — המארח סגר אותו.',
  'Player is not in this game.': 'השחקן לא נמצא במשחק הזה.',
  'That seat belongs to someone else.': 'המקום הזה שייך למישהו אחר.',
  'Only the host can do that.': 'רק המארח יכול לעשות את זה.',
  'Enter a valid amount.': 'יש להזין סכום תקין.',
  'That amount looks wrong.': 'הסכום הזה נראה שגוי.',
  'This game has already been settled.': 'ההתחשבנות במשחק הזה כבר בוצעה.',
  'The game needs to be started before buy-ins can be recorded.': 'צריך להתחיל את המשחק לפני שאפשר לרשום קניות.',
  'Buy-in must be worth more than ₪0.': 'קנייה צריכה להיות יותר מ-₪0.',
  'A buy-in can be at most ₪50.': 'קנייה יכולה להיות עד ₪50.',
  'That buy-in request no longer exists.': 'בקשת הקנייה הזו כבר לא קיימת.',
  'That request was already handled.': 'הבקשה הזו כבר טופלה.',
  'Approve or deny the pending buy-in requests before settling.': 'יש לאשר או לדחות את בקשות הקנייה הממתינות לפני ההתחשבנות.',
  'Payment not found.': 'התשלום לא נמצא.',
  'Player not found.': 'השחקן לא נמצא.',
  'Only the payer can do that.': 'רק המשלם יכול לעשות את זה.',
  'Only the person being paid can confirm.': 'רק מי שמקבל את התשלום יכול לאשר.',
  "That photo couldn't be used.": 'אי אפשר להשתמש בתמונה הזו.',
  'That photo is too large.': 'התמונה גדולה מדי.',
  'Please log in.': 'יש להתחבר.',
  'Something went wrong.': 'משהו השתבש.',
  'Not found': 'לא נמצא',
};

export function translateError(message: string, lang: Lang): string {
  if (lang === 'en') return message;
  const missing = /^Enter a cash-out for (.+) before settling\.$/.exec(message);
  if (missing) return `צריך להזין פדיון עבור ${missing[1]} לפני ההתחשבנות.`;
  return HE_ERRORS[message] ?? message;
}

const en = {
  paymentConfirmedTitle: 'Payment confirmed ✓',
  paymentConfirmedBody: (to: string, amount: string, table: string) => `${to} got your ${amount} for "${table}".`,
  stillNeedToPayTitle: 'You still need to pay',
  stillNeedToPayBody: (to: string, amount: string, table: string) => `${to} hasn't received your ${amount} for "${table}" yet.`,
  saysPaidTitle: (from: string) => `${from} says they paid you`,
  saysPaidBody: (from: string, amount: string, table: string) => `${from} sent you ${amount} for "${table}". Did it arrive? Tap to confirm.`,
};

// Hebrew phrasing avoids gendered verbs about other players (names don't tell us).
const he: typeof en = {
  paymentConfirmedTitle: 'התשלום אושר ✓',
  paymentConfirmedBody: (to, amount, table) => `התשלום של ${amount} ל-${to} עבור "${table}" התקבל.`,
  stillNeedToPayTitle: 'עדיין צריך לשלם',
  stillNeedToPayBody: (to, amount, table) => `התשלום של ${amount} ל-${to} עבור "${table}" עדיין לא התקבל.`,
  saysPaidTitle: (from) => `תשלום מ-${from} סומן כנשלח`,
  saysPaidBody: (from, amount, table) => `${amount} מ-${from} עבור "${table}". הכסף הגיע? לחיצה לאישור.`,
};

export type PushText = typeof en;

export function pushText(lang: Lang): PushText {
  return lang === 'he' ? he : en;
}
