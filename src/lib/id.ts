import { randomUUID, randomInt } from 'node:crypto';

/** Unambiguous uppercase charset — no 0/O, 1/I/L. */
const JOIN_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A short, spoken-aloud-friendly code players type in to join a session. */
export function newJoinCode(length = 5): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += JOIN_CODE_CHARS[randomInt(JOIN_CODE_CHARS.length)];
  }
  return code;
}

export function newId(): string {
  return randomUUID();
}
