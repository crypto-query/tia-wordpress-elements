#!/usr/bin/env bash
# Runs wp-cli against the Docker site: `bash scripts/wp-cli.sh option get siteurl`.
# The WordPress container has no wp-cli, so an idle wordpress:cli helper runs beside it and each call is a
# `docker exec`, about twice as fast as a fresh container per call.
set -euo pipefail

C=tia-wordpress-elements_devcontainer-wordpress-1
H=tia-wordpress-elements-wp-cli

# The helper shares the site container's network and volumes, so a recreated site container needs a new helper.
# One inspect for both: the site's id, then the helper's state and the site id it was started for.
state=$(docker inspect -f '{{.Id}} {{.State.Running}} {{index .Config.Labels "tia.site"}}' "$C" "$H" 2>/dev/null || true)
site=$(head -n 1 <<<"$state" | cut -d ' ' -f 1)
if [ -z "$site" ]; then
    echo "The site container $C is not running." >&2
    exit 1
fi
if [ "$(sed -n 2p <<<"$state" | cut -d ' ' -f 2-)" != "true $site" ]; then
    docker rm -f "$H" >/dev/null 2>&1 || true
    # wp-config.php reads its local constants from this variable, so wp-cli needs it too.
    extra=$(docker exec "$C" printenv WORDPRESS_CONFIG_EXTRA || true)
    # A parallel call may have started it first; the exec below works either way.
    docker run -d --name "$H" --label "tia.site=$site" --user 33:33 --volumes-from "$C" --network "container:$C" \
        -e WORDPRESS_DB_HOST=database:3306 \
        -e WORDPRESS_DB_USER=wordpress \
        -e WORDPRESS_DB_PASSWORD=wordpress \
        -e WORDPRESS_DB_NAME=wordpress \
        -e WORDPRESS_CONFIG_EXTRA="$extra" \
        wordpress:cli sleep infinity >/dev/null 2>&1 || true
fi

docker exec "$H" wp "$@"
