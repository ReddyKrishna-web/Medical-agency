import crypto from 'node:crypto';

/** URL-safe random token (used for password reset / verification links). */
export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('base64url');

/** Random, non-guessable storage key for uploaded objects. */
export const randomObjectKey = (extension: string): string => {
  const now = new Date();
  const datePart = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `requirements/${datePart}/${crypto.randomUUID()}${extension.toLowerCase()}`;
};

/** Only hashes are persisted; the raw value never touches the database. */
export const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

export const sha256 = (value: string | Buffer): string =>
  crypto.createHash('sha256').update(value).digest('hex');

export const randomJti = (): string => crypto.randomUUID();

/**
 * Unambiguous alphabet: no `O`/`0`, `I`/`l`/`1`. A generated password is read
 * aloud and retyped by a human, so transcription ambiguity is a real defect.
 */
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TEMP_PASSWORD_SYMBOLS = '!@#$%*?';
const TEMP_PASSWORD_LENGTH = 14;

/** Rejection sampling keeps every character equally likely (no modulo bias). */
const randomIndex = (bound: number): number => {
  const limit = Math.floor(256 / bound) * bound;
  for (;;) {
    const byte = crypto.randomBytes(1)[0]!;
    if (byte < limit) return byte % bound;
  }
};

const randomChar = (alphabet: string): string => alphabet[randomIndex(alphabet.length)]!;

const shuffle = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

/**
 * A strong, single-use password built from a CSPRNG for staff onboarding.
 *
 * Guarantees at least one lowercase, one uppercase, one digit and one symbol
 * so it satisfies the account password policy without anyone having to
 * remember a trick. The caller hashes it and must not persist it.
 */
export const generateTemporaryPassword = (length = TEMP_PASSWORD_LENGTH): string => {
  const mandatory = [
    randomChar('abcdefghijkmnopqrstuvwxyz'),
    randomChar('ABCDEFGHJKLMNPQRSTUVWXYZ'),
    randomChar('23456789'),
    randomChar(TEMP_PASSWORD_SYMBOLS)
  ];

  const total = Math.max(12, length);
  const remaining = Array.from({ length: total - mandatory.length }, () =>
    randomChar(TEMP_PASSWORD_ALPHABET + TEMP_PASSWORD_SYMBOLS)
  );

  return shuffle([...mandatory, ...remaining]).join('');
};

/** Length-safe scrypt hash used only for demo/test password generation. */
export const randomPassword = (length = 14): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out.replace(/[^A-Za-z0-9!@#$%]/, 'A').slice(0, Math.max(8, length));
};

export const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};
