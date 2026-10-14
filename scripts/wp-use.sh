#!/usr/bin/env bash
# Points the Docker site's plugin at the checkout this script runs from (main or a worktree).
# A worktree copy is activated through a symlink in wp-content/plugins; one copy stays active.
set -euo pipefail

C=tia-wordpress-elements_devcontainer-wordpress-1
PLUGINS=/var/www/html/wp-content/plugins
MAIN=tia-wordpress-elements

root=$(cd "$(dirname "$0")/.." && pwd)
case "$root" in
    */.agents/worktrees/*)
        worktree=${root#*/.agents/worktrees/}
        slug="$MAIN--${worktree//\//-}"
        ;;
    *)
        worktree=
        slug=$MAIN
        ;;
esac

wp() {
    bash "$root/scripts/wp-cli.sh" "$@"
}

active=$(wp plugin list --status=active --field=name | grep -E "^$MAIN(--|$)" || true)
if [[ -n "$active" ]]; then
    wp plugin deactivate $active
fi

# `rm` without `-r` removes only symlinks here; it fails on the main checkout's real directory.
docker exec "$C" sh -c "rm -f $PLUGINS/$MAIN--*"
if [[ -n "$worktree" ]]; then
    docker exec "$C" ln -s "$MAIN/.agents/worktrees/$worktree" "$PLUGINS/$slug"
fi

wp plugin activate "$slug"

# `bun run wp:seed` makes the test mu-plugin link; keep it on the copy that is now active.
MU=/var/www/html/wp-content/mu-plugins/tia-elements-test.php
if docker exec "$C" test -L "$MU"; then
    docker exec "$C" ln -sfn "../plugins/$slug/tests/mu-plugins/tia-elements-test.php" "$MU"
fi
