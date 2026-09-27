#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Never push schema changes from a hook (AGENTS.md sec 6). The developer backs up the database
# and applies migrations by hand with `pnpm --filter @workspace/api-server db:migrate`.
