#!/usr/bin/env bash
# Stop hook: full `bun run lint` + `bun run check` when a code file changed.
# Advisory — exits 0 when nothing to check or checks pass; exits 1 (non-blocking)
# with output on stderr when a check fails.
set -u

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CODE_RE='\.(svelte|ts|js|mjs|cjs)$'

git -C "$ROOT" status --porcelain 2>/dev/null | awk '{print $NF}' | grep -Eq "$CODE_RE" || exit 0

BUN="$(command -v bun || true)"
[ -n "$BUN" ] || exit 0
[ -x "$ROOT/node_modules/.bin/prettier" ] || exit 0

for task in lint check; do
  if ! out="$(cd "$ROOT" && "$BUN" run --silent "$task" 2>&1)"; then
    printf '=== bun run %s failed ===\n%s\n' "$task" "$out" >&2
    exit 1
  fi
done
exit 0
