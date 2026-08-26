import { spawnSync } from 'node:child_process';

if (process.env.WORKERS_CI !== '1') {
  console.log('Skipping remote D1 migrations outside Cloudflare Workers Builds.');
  process.exit(0);
}

console.log('Applying pending WorkerDeck D1 migrations before deployment...');

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  command,
  ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', 'wrangler.jsonc'],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(`Unable to start Wrangler migrations: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
