import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
for (const [cwd, env] of [[root, {}], [path.join(root, 'plugins/motorbridge-studio/ui'), { VITE_BASE_PATH: '/studio/', VITE_CORDIS_HOST: 'true' }]]) {
  const result = spawnSync(process.execPath, [path.join(cwd, 'node_modules/vite/bin/vite.js'), 'build'], { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
