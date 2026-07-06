// Mirror the client build (client/dist) to the repo-root dist/ after `pnpm build`.
//
// Why: Vercel resolves its Output Directory relative to the project's Root Directory,
// which differs per project config — some look for `client/dist`, some for repo-root
// `dist`. Producing BOTH makes the deploy find the output no matter how the project
// is set up (and `docs/DEPLOY.md`'s VPS rsync of `dist/` works too). Cross-platform
// (Node fs, no shell `cp`).

import { rmSync, cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const from = resolve(repoRoot, 'client/dist');
const to = resolve(repoRoot, 'dist');

if (!existsSync(from)) {
  console.error(`mirror-dist: source ${from} not found — did the client build run?`);
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`mirror-dist: copied client/dist → dist`);
