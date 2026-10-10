#!/usr/bin/env bash
# Seeds the LOCAL WordPress with entitlement test users, products and subscriptions
# (scripts/wp-seed.php). Safe to re-run; pass `clean` to only remove the seed data.
# The WordPress container has no wp-cli, so this runs the official wordpress:cli image beside it.
set -euo pipefail

C=tia-wordpress-elements_devcontainer-wordpress-1

docker run --rm --user 33:33 --volumes-from "$C" --network "container:$C" \
    -e WORDPRESS_DB_HOST=database:3306 \
    -e WORDPRESS_DB_USER=wordpress \
    -e WORDPRESS_DB_PASSWORD=wordpress \
    -e WORDPRESS_DB_NAME=wordpress \
    wordpress:cli wp eval-file \
    /var/www/html/wp-content/plugins/tia-wordpress-elements/scripts/wp-seed.php "$@"
