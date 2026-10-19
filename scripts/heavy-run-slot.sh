#!/bin/bash
# Runs "$@" holding one of BENDER_HEAVY_SLOTS machine-wide slots, so agent
# worktrees that run the suite or typecheck at the same time queue instead of
# all running at once. A vitest run sizes its workers as though alone; four of
# them pushed the load average to 35 on 16 cores.
#
# The slot directory is fixed under /tmp, since every worktree is a full
# checkout and a private set of slots gates nothing.
set -u

slots=${BENDER_HEAVY_SLOTS:-2}

# Agent runs only: a human at a terminal gets the machine undiluted. A missing
# flock(1) runs the command ungated rather than failing it. A command that holds
# a slot runs its gated children inside it, since two agents each holding one of
# two slots and waiting for a second would deadlock.
case $slots in
  '' | *[!0-9]*) exec "$@" ;;
esac
if [ "$slots" -eq 0 ] || [ -z "${CLAUDECODE:-}" ] || ! command -v flock >/dev/null ||
  [ -n "${BENDER_HEAVY_SLOT:-}" ]
then
  exec "$@"
fi

dir=/tmp/bender-heavy-slots
mkdir -p "$dir" 2>/dev/null || exec "$@"

# Sweep the slots with a short timeout rather than blocking on one, so a waiter
# does not sit behind a long run while a different slot frees.
waited=
while :; do
  for i in $(seq 1 "$slots"); do
    exec {fd}>"$dir/$i" || exec "$@"
    if flock -w 0.25 "$fd"; then
      break 2
    fi
    exec {fd}>&-
  done
  if [ -z "$waited" ]; then
    waited=1
    echo "waiting for one of $slots machine-wide slots (BENDER_HEAVY_SLOTS=0 disables)" >&2
  fi
done

export BENDER_HEAVY_SLOT=$i

# This shell holds the lock and the command runs as its child, so the kernel
# frees the slot however this shell dies. Backgrounded so a trap can forward
# signals, with stdin handed over since a background command reads /dev/null.
child=
trap '[ -n "$child" ] && kill -TERM "$child" 2>/dev/null' TERM INT HUP
exec {stdin}<&0
"$@" <&"$stdin" {stdin}<&- {fd}>&- &
child=$!
while :; do
  wait "$child"
  status=$?
  kill -0 "$child" 2>/dev/null || exit "$status"
done
