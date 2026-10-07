import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const base = env.VITE_APP_BASE || '/big-match/';
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error('VITE_APP_BASE must be an absolute path ending in /');
  return {
    base,
    build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0 },
    server: { host: '0.0.0.0', port: 5173, strictPort: true },
    preview: { host: '0.0.0.0', port: 4173, strictPort: true },
  };
});
