#!/usr/bin/env bash
# Only run in an internet-enabled, trusted development environment.
# Does not deploy or modify a remote database.
set -euo pipefail
cd "$(dirname "$0")/.."
node --version
npm --version
# npm install refreshes the lockfile against the declared Vercel-only runtime.
# Never fabricate integrity hashes or copy dependencies from other projects.
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --include=dev --include=optional --no-audit --no-fund
npm test
npm run audit:release
npm run lint
npx --no-install tsc --noEmit
npm run build
printf '\nAll local code/build gates passed. Inspect the package-lock diff and deploy PREVIEW only.\n'
