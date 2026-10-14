#!/usr/bin/env bash
# Seeds the LOCAL WordPress with the browser-pass fixture page (scripts/wp-seed-fixture.php).
# Safe to re-run; pass `clean` to only remove the page.
set -euo pipefail

# Run the PHP of the checkout this script sits in; a worktree is mounted below the main checkout.
root=$(cd "$(dirname "$0")/.." && pwd)
dir=tia-wordpress-elements
if [[ "$root" == */.agents/worktrees/* ]]; then
    dir+="/.agents/worktrees/${root#*/.agents/worktrees/}"
fi

bash "$root/scripts/wp-cli.sh" eval-file \
    "/var/www/html/wp-content/plugins/$dir/scripts/wp-seed-fixture.php" "$@"
