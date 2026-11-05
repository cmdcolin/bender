#!/bin/bash
# Runs `pnpm "$@"` on ada against this working tree, synced to
# ada:~/src/bender-runs/<checkout>:
#   scripts/ada.sh typecheck
#   scripts/ada.sh test src/ui/agentApi.test.ts
set -eu

host=${BENDER_ADA_HOST:-ada}
root=$(git rev-parse --show-toplevel)
dir=src/bender-runs/$(basename "$root")

rsync -a --delete --mkpath \
  --exclude=/.git --exclude=node_modules --exclude=.astro --exclude=dist \
  --filter=':- .gitignore' \
  "$root/" "$host:$dir/"

tty=
if [ -t 0 ] && [ -t 1 ]; then
  tty=-t
fi

ssh $tty "$host" "cd $dir &&
  { cmp -s pnpm-lock.yaml node_modules/.ada-lock ||
    { HUSKY=0 pnpm install --frozen-lockfile --reporter=append-only &&
      cp pnpm-lock.yaml node_modules/.ada-lock; }; } &&
  exec env BENDER_HEAVY_SLOTS=2 BENDER_MAX_WORKERS=6 \
    ${CLAUDECODE:+CLAUDECODE=$CLAUDECODE} nice -n 10 pnpm $(printf '%q ' "$@")"
