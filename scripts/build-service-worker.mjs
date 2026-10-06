import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPublicArtifact, normalizeBase, publicConfigFingerprint, publicEnvironment, validatePublicEnvironment } from './release-utils.mjs';

const templatePath = new URL('./service-worker.template.js', import.meta.url);

export async function buildServiceWorker({ distDir = path.resolve('dist'), base = '/big-match/', configured = false, configFingerprint = null } = {}) {
  base = normalizeBase(base);
  const manifestFile = path.join(distDir, 'manifest.webmanifest');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.id = base;
  manifest.start_url = base;
  manifest.scope = base;
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  const inventory = await inspectPublicArtifact(distDir);
  const assets = inventory.files.filter(name => !['sw.js', '.nojekyll', 'build-info.json'].includes(name));
  if (!assets.includes('index.html')) throw new Error('Build the app before generating its service worker.');
  const template = await readFile(templatePath, 'utf8');
  const hash = createHash('sha256').update(base).update(template);
  for (const file of assets) hash.update(file).update(await readFile(path.join(distDir, file)));
  const version = hash.digest('hex').slice(0, 16);
  const prefix = `big-match-${createHash('sha256').update(base).digest('hex').slice(0, 8)}-`;
  const config = { version, prefix, base, assets };
  await writeFile(path.join(distDir, 'sw.js'), template.replace('__BUILD_CONFIG__', JSON.stringify(config)));
  await writeFile(path.join(distDir, 'build-info.json'), JSON.stringify({ version, base, assets: assets.length, configured, configFingerprint }, null, 2) + '\n');
  await writeFile(path.join(distDir, '.nojekyll'), '');
  return config;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = validatePublicEnvironment(await publicEnvironment());
    const worker = await buildServiceWorker({ base: config.base, configured: config.configured, configFingerprint: publicConfigFingerprint(config) });
    console.info(`Static offline build ${worker.version}: ${worker.assets.length} assets under ${worker.base}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Offline build failed.');
    process.exitCode = 1;
  }
}
