#!/usr/bin/env bash
# Seeds the LOCAL WordPress with entitlement test users, products and subscriptions
# (scripts/wp-seed.php). Safe to re-run; pass `clean` to only remove the seed data.
set -euo pipefail

bash "$(dirname "$0")/wp-cli.sh" eval-file \
    /var/www/html/wp-content/plugins/tia-wordpress-elements/scripts/wp-seed.php "$@"
