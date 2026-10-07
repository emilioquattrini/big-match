import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const STATIC_EXTENSIONS = new Set(['.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.webmanifest']);

export function normalizeBase(value = '/big-match/') {
  if (typeof value !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value)) {
    throw new Error('VITE_APP_BASE must be an absolute path ending in /, without a query or dot segments.');
  }
  return value;
}

export async function publicEnvironment(cwd = process.cwd()) {
  const { loadEnv } = await import('vite');
  return { ...loadEnv('production', cwd, 'VITE_'), ...process.env };
}

export function validatePublicEnvironment(env, { production = false } = {}) {
  const base = normalizeBase(env.VITE_APP_BASE || '/big-match/');
  const eventSlug = env.VITE_EVENT_SLUG || 'big-2026';
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(eventSlug)) throw new Error('VITE_EVENT_SLUG is invalid.');
  const backendUrl = (env.VITE_SUPABASE_URL || '').trim();
  const publishableKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (Boolean(backendUrl) !== Boolean(publishableKey)) throw new Error('Set both public Supabase variables, or leave both empty for a local-only build.');
  if (production && !backendUrl) throw new Error('Public release requires configured community services. Local-only builds cannot pass the production gate.');
  if (backendUrl) {
    const url = safeUrl(backendUrl, 'VITE_SUPABASE_URL');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((production || !local) && url.protocol !== 'https:') throw new Error('VITE_SUPABASE_URL must use HTTPS outside local testing.');
    if (!['/', ''].includes(url.pathname) || url.search || url.hash || url.username || url.password) throw new Error('VITE_SUPABASE_URL must contain only the service origin.');
    if (production && local) throw new Error('Public release cannot point to a local backend.');
    let keyAllowed = /^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(publishableKey);
    if (publishableKey.startsWith('eyJ')) {
      try { keyAllowed = JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { keyAllowed = false; }
    }
    if (!keyAllowed) throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable key or a legacy anon key. Secret keys are forbidden.');
  }
  const appUrl = (env.VITE_APP_URL || '').trim();
  if (production && !appUrl) throw new Error('VITE_APP_URL is required for a public release.');
  if (appUrl) {
    const url = safeUrl(appUrl, 'VITE_APP_URL');
    if (url.pathname !== base || url.search || url.hash || url.username || url.password) throw new Error('VITE_APP_URL must match the app base exactly, with a trailing slash.');
    if (production && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('VITE_APP_URL must be the public HTTPS app address.');
  }
  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_') && /(?:SECRET|SERVICE_ROLE|PASSWORD|PRIVATE_KEY)/i.test(name) && env[name]) {
      throw new Error('A server-only credential has been assigned a VITE_ variable. Remove that variable before building.');
    }
  }
  return { base, eventSlug, backendUrl, publishableKey, appUrl, configured: Boolean(backendUrl) };
}

export function publicConfigFingerprint(config) {
  return createHash('sha256').update(JSON.stringify({
    base: config.base, eventSlug: config.eventSlug, backendUrl: config.backendUrl,
    publishableKey: config.publishableKey, appUrl: config.appUrl,
  })).digest('hex');
}

function safeUrl(value, field) {
  try { return new URL(value); } catch { throw new Error(`${field} must be a valid URL.`); }
}

export async function listFiles(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('The public artifact must not contain symbolic links.');
    if (entry.isDirectory()) files.push(...await listFiles(root, name));
    else if (entry.isFile()) files.push(name);
  }
  return files.sort();
}

export function containsSecret(text) {
  if (/sb_secret_[A-Za-z0-9_-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) return true;
  for (const match of text.matchAll(/\b(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g)) {
    try {
      const claims = JSON.parse(Buffer.from(match[1].split('.')[1], 'base64url').toString());
      if (claims.role === 'service_role') return true;
    } catch { /* Not a JWT; do not print the candidate. */ }
  }
  return false;
}

export async function inspectPublicArtifact(distDir) {
  const files = await listFiles(distDir);
  let bytes = 0;
  for (const file of files) {
    if (file === '.nojekyll' || file === 'build-info.json') continue;
    const bundledLicenseNotice = file === 'licenses/THIRD_PARTY.txt';
    if ((!STATIC_EXTENSIONS.has(path.extname(file)) && !bundledLicenseNotice) || file.split('/').some(part => part.startsWith('.'))) {
      throw new Error(`Unexpected public artifact file: ${file}`);
    }
    if (/^(?:supabase|tests|docs|node_modules|scripts)\//.test(file)) throw new Error('Development or database files must not be published.');
    const data = await readFile(path.join(distDir, file));
    bytes += data.length;
    if ((bundledLicenseNotice || ['.js', '.html', '.css', '.webmanifest', '.svg'].includes(path.extname(file))) && containsSecret(data.toString('utf8'))) {
      throw new Error(`A private credential pattern was detected in ${file}. Its value has not been printed.`);
    }
  }
  return { files, bytes };
}
