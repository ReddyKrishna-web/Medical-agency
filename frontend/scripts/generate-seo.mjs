import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

/**
 * Minimal, dependency-free reader for the values this script needs. Real
 * process environment variables always win; the env files only provide the
 * same defaults Vite itself applies, so `npm run build` cannot silently emit
 * sitemap URLs for a different origin than the one the app is built with.
 */
const readEnvFiles = async () => {
  const values = {};
  for (const name of ['.env', '.env.local']) {
    try {
      const text = await readFile(path.join(root, name), 'utf8');
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const separator = line.indexOf('=');
        if (separator < 1) continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
        if (!(key in process.env) && value) values[key] = value;
      }
    } catch {
      // A missing env file is normal; defaults below still apply.
    }
  }
  return values;
};

const fileEnv = await readEnvFiles();
const explicitSiteUrl = process.env.SITE_URL || fileEnv.SITE_URL;
const siteUrl = (explicitSiteUrl || 'http://localhost:5173').replace(/\/+$/, '');
const productionUnconfigured = process.env.NODE_ENV === 'production' && !explicitSiteUrl;

if (productionUnconfigured) {
  console.error('[seo] SITE_URL must be set to the public website origin for a production build.');
  process.exit(1);
}

const publicRoutes = [
  ['/', '1.0', 'weekly'],
  ['/solutions', '0.8', 'monthly'],
  ['/features', '0.8', 'monthly'],
  ['/how-it-works', '0.8', 'monthly'],
  ['/about', '0.7', 'monthly'],
  ['/contact', '0.7', 'monthly'],
  ['/privacy', '0.3', 'yearly'],
  ['/terms', '0.3', 'yearly'],
];

const today = new Date().toISOString().slice(0, 10);
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...publicRoutes.map(([route, priority, frequency]) => `  <url><loc>${siteUrl}${route}</loc><lastmod>${today}</lastmod><changefreq>${frequency}</changefreq><priority>${priority}</priority></url>`),
  '</urlset>',
  '',
].join('\n');

const robots = [
  'User-agent: *',
  'Allow: /',
  'Disallow: /customer',
  'Disallow: /salesman',
  'Disallow: /admin',
  'Disallow: /app',
  'Disallow: /login',
  'Disallow: /register',
  'Disallow: /forgot-password',
  'Disallow: /reset-password',
  'Disallow: /session-expired',
  '',
  `Sitemap: ${siteUrl}/sitemap.xml`,
  '',
].join('\n');

await mkdir(publicDir, { recursive: true });
await Promise.all([
  writeFile(path.join(publicDir, 'sitemap.xml'), xml, 'utf8'),
  writeFile(path.join(publicDir, 'sitemap.txt'), xml, 'utf8'),
  writeFile(path.join(publicDir, 'robots.txt'), robots, 'utf8'),
]);

console.log(`[seo] Generated public sitemap files for ${siteUrl}`);
