#!/usr/bin/env bash
# Points the Docker site's plugin at the checkout this script runs from: a worktree under
# .agents/worktrees/ or the main checkout. The site mounts the main checkout, so a worktree is
# reachable through a symlink in wp-content/plugins. Only one copy of the plugin stays active.
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
    docker run --rm --user 33:33 --volumes-from "$C" --network "container:$C" \
        -e WORDPRESS_DB_HOST=database:3306 \
        -e WORDPRESS_DB_USER=wordpress \
        -e WORDPRESS_DB_PASSWORD=wordpress \
        -e WORDPRESS_DB_NAME=wordpress \
        wordpress:cli wp "$@"
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
