import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectPublicArtifact, publicConfigFingerprint, publicEnvironment, validatePublicEnvironment } from './release-utils.mjs';

try {
  const production = process.argv.includes('--production');
  const config = validatePublicEnvironment(await publicEnvironment(), { production });
  const distDir = path.resolve('dist');
  const { files, bytes } = await inspectPublicArtifact(distDir);
  for (const required of ['index.html', 'sw.js', 'manifest.webmanifest', 'favicon.svg', 'build-info.json']) {
    if (!files.includes(required)) throw new Error(`Required release file missing: ${required}`);
  }
  const info = JSON.parse(await readFile(path.join(distDir, 'build-info.json'), 'utf8'));
  if (info.base !== config.base || info.configured !== config.configured || info.configFingerprint !== publicConfigFingerprint(config)) throw new Error('Build configuration differs from release configuration. Rebuild before publishing.');
  const manifest = JSON.parse(await readFile(path.join(distDir, 'manifest.webmanifest'), 'utf8'));
  if (manifest.start_url !== config.base || manifest.scope !== config.base || manifest.id !== config.base) throw new Error('Manifest paths must match the app base.');
  const html = await readFile(path.join(distDir, 'index.html'), 'utf8');
  if (/<script\b[^>]*\bsrc=["']https?:\/\//i.test(html) || /fonts\.googleapis\.com|cdnjs\.cloudflare\.com/.test(html)) throw new Error('The core app must not depend on a runtime font/script CDN.');
  for (const [, src] of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    if (!src.startsWith(config.base) || src.startsWith('//')) continue;
    const relative = src.slice(config.base.length).split(/[?#]/)[0];
    if (relative && !files.includes(relative)) throw new Error('An HTML asset does not exist in the release artifact.');
  }
  if (bytes > 10 * 1024 * 1024) throw new Error('Static artifact exceeds the 10 MiB event budget. Review the asset list before release.');
  if (process.argv.includes('--check-backend')) {
    if (!production) throw new Error('--check-backend must be combined with --production.');
    const headers = { apikey: config.publishableKey, Accept: 'application/json' };
    const endpoint = `${config.backendUrl}/functions/v1/big-match/events/${encodeURIComponent(config.eventSlug)}`;
    const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(12000), cache: 'no-store' });
    if (!response.ok) throw new Error(`Public event readiness check failed with HTTP ${response.status}.`);
    const event = await response.json();
    // A configured pre-event page may ship before its collection window opens.
    // Collection itself still requires an open event, enforced by the backend.
    if (event.slug !== config.eventSlug || !['draft', 'open', 'closed'].includes(event.status) || !Array.isArray(event.activeCardIds) || event.activeCardIds.length < 3) throw new Error('Public event configuration is not ready.');
    if (!event.controllerName || !event.controllerEmail || !event.privacyVersion || !event.privacyNotice) throw new Error('Public event privacy configuration is incomplete.');
    const catalogue = JSON.parse(await readFile('catalog/impersonae-v1.json', 'utf8'));
    const known = new Set(catalogue.cards.map(card => card.id));
    if (event.deckVersion !== catalogue.deckVersion || event.activeCardIds.some(id => !known.has(id))) throw new Error('Public event and bundled catalogue do not agree.');
    console.info('Read-only backend readiness check passed. No participation or contact was created.');
  }
  console.info(`Release check passed (${production ? 'production configuration' : 'local/test configuration'}): ${files.length} files, ${bytes} bytes, version ${info.version}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Release check failed.');
  process.exitCode = 1;
}
