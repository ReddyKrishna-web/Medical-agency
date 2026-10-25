import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import { logger } from '../utils/logger';

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

let adminClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

/**
 * Supabase Auth requires all three server-side values. The service-role key is a
 * server secret: it must never appear in a VITE_* variable or in the browser.
 */
export const isSupabaseConfigured = (): boolean =>
  Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);

const requireSupabase = (): { url: string; anonKey: string; serviceRoleKey: string } => {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase Auth is not configured: set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in backend/.env',
    );
  }
  return {
    url: env.SUPABASE_URL.replace(/\/+$/, ''),
    anonKey: env.SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
};

/** Anonymous client: password grants and password-recovery requests. */
export const getSupabaseAnon = (): SupabaseClient => {
  const { url, anonKey } = requireSupabase();
  if (!anonClient) anonClient = createClient(url, anonKey, clientOptions);
  return anonClient;
};

/** Service-role client: create users, set passwords, revoke sessions. Server only. */
export const getSupabaseAdmin = (): SupabaseClient => {
  const { url, serviceRoleKey } = requireSupabase();
  if (!adminClient) adminClient = createClient(url, serviceRoleKey, clientOptions);
  return adminClient;
};

export interface SupabaseHealth {
  configured: boolean;
  reachable: boolean;
  error?: string;
}

/**
 * Connectivity probe used by `/api/health` diagnostics and `supabase:check`.
 * A missing configuration is reported as such, never as a successful result.
 */
export const checkSupabaseAuth = async (): Promise<SupabaseHealth> => {
  if (!isSupabaseConfigured()) return { configured: false, reachable: false };
  const { url, anonKey } = requireSupabase();
  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      logger.warn('Supabase Auth health probe rejected', { status: response.status });
      return { configured: true, reachable: false, error: `Supabase Auth responded ${response.status}` };
    }
    return { configured: true, reachable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Supabase Auth health probe failed', { message: message.slice(0, 200) });
    return { configured: true, reachable: false, error: 'Supabase Auth is not reachable' };
  }
};

/** Target of the Supabase recovery email; must be an allowed redirect URL. */
export const passwordRecoveryRedirect = (): string =>
  new URL('/reset-password', env.CLIENT_URL).toString();
