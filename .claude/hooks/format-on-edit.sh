#!/usr/bin/env bash
# PostToolUse hook: fast prettier + eslint --fix on the edited code file.
# In-loop feedback only; full validation lives in the Stop hook. Always exits 0.
set -u

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CODE_RE='\.(svelte|ts|js|mjs|cjs)$'

file="$(python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)"
[ -f "$file" ] || exit 0
printf '%s\n' "$file" | grep -Eq "$CODE_RE" || exit 0

PRETTIER="$ROOT/node_modules/.bin/prettier"; [ -x "$PRETTIER" ] || PRETTIER="prettier"
ESLINT="$ROOT/node_modules/.bin/eslint"; [ -x "$ESLINT" ] || ESLINT="eslint"

"$PRETTIER" --write --ignore-unknown "$file" >/dev/null 2>&1 || true
"$ESLINT" --fix "$file" >/dev/null 2>&1 || true
exit 0
