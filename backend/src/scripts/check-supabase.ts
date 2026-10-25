/**
 * Supabase configuration check.
 *
 * Verifies the values a hosted/self-hosted Supabase project needs, pings the
 * database through Prisma and probes Supabase Auth. It never prints a key, a
 * connection string or a password — only whether each requirement is present.
 *
 * Run after adding the values to backend/.env:
 *   npm run supabase:check -w backend
 */
import { env } from '../config/env';
import { checkPostgres, disconnectPostgres, getPrisma, isPostgresConfigured } from '../config/prisma';
import { checkSupabaseAuth, isSupabaseConfigured } from '../config/supabase';

const mark = (ok: boolean) => (ok ? 'OK  ' : 'MISS');

const run = async (): Promise<void> => {
  console.log('');
  console.log('  Supply Medicals — Supabase readiness');
  console.log('  -----------------------------------');

  const required: Array<[string, string | undefined, string]> = [
    ['SUPABASE_URL', env.SUPABASE_URL, 'Project URL (https://<ref>.supabase.co)'],
    ['SUPABASE_ANON_KEY', env.SUPABASE_ANON_KEY, 'anon/public key, used for password grants'],
    ['SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY, 'server-only key for user administration'],
    ['DATABASE_URL', env.DATABASE_URL, 'pooled connection string, port 6543'],
    ['DIRECT_URL', env.DIRECT_URL, 'direct connection string, port 5432 (migrations)'],
  ];

  for (const [name, value, hint] of required) {
    console.log(`  ${mark(Boolean(value))} ${name.padEnd(28)} ${hint}`);
  }
  if (env.SUPABASE_JWT_SECRET) {
    console.log('  OK   SUPABASE_JWT_SECRET         legacy HS256 verification enabled');
  } else {
    console.log('  --   SUPABASE_JWT_SECRET         not set (asymmetric JWKS will be used)');
  }

  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    console.log('');
    console.log(`  Missing: ${missing.join(', ')}`);
    console.log('  Add them to backend/.env. Until then the API stays on the MongoDB auth path.');
    console.log('');
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('  Checking connectivity...');

  const postgres = await checkPostgres();
  console.log(`  ${mark(postgres.connected)} PostgreSQL                   ${postgres.connected ? 'reachable' : postgres.error ?? 'not reachable'}`);

  if (postgres.connected && isPostgresConfigured()) {
    try {
      const [agencies, users] = await Promise.all([
        getPrisma().agency.count(),
        getPrisma().user.count(),
      ]);
      console.log(`  OK   Schema                       agencies=${agencies} users=${users}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('  MISS Schema                       tables are missing — run `npm run prisma:migrate:deploy -w backend`');
      console.log(`       detail: ${message.split('\n')[0].slice(0, 160)}`);
      process.exitCode = 1;
    }
  } else {
    process.exitCode = 1;
  }

  const supabase = await checkSupabaseAuth();
  console.log(`  ${mark(supabase.reachable)} Supabase Auth                ${supabase.reachable ? 'reachable' : supabase.error ?? 'not reachable'}`);
  if (!isSupabaseConfigured() || !supabase.reachable || !postgres.connected) process.exitCode = 1;

  console.log('');
  await disconnectPostgres();
};

run().catch(async (error: unknown) => {
  console.error('Supabase check failed:', error instanceof Error ? error.message : error);
  await disconnectPostgres().catch(() => undefined);
  process.exit(1);
});
