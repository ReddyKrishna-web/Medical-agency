import { env } from '../config/env';
import { hashPassword as serviceHashPassword } from '../services/auth.service';

/**
 * Deterministic fallback password used by the development seed when no
 * SEED_*_PASSWORD is provided. It is intentionally obvious demo material and is
 * never used outside a non-production environment.
 */
export const DEMO_PASSWORD_FALLBACK = 'DemoPass123!';

const PREFIXES: Record<string, string> = {
  admin: 'Adm',
  salesman: 'Sls',
  customer: 'Cst',
  citycare: 'City',
  pending: 'Pend'
};

/**
 * Produces a readable, stable-per-role password so the printed demo credentials
 * are easy to copy while still being unique to the seed. The `bcrypt` hash is
 * generated at seed time; no plaintext is stored anywhere.
 */
export const generateSeedPassword = (role: keyof typeof PREFIXES): string => {
  const suffix = env.isTest ? 'Test1!' : 'Demo1!';
  return `${PREFIXES[role]}${suffix}`;
};

export const hashPassword = (plain: string): Promise<string> => serviceHashPassword(plain);
