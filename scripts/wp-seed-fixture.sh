#!/usr/bin/env bash
# Seeds the LOCAL WordPress with the browser-pass fixture page (scripts/wp-seed-fixture.php).
# Safe to re-run; pass `clean` to only remove the page.
set -euo pipefail

bash "$(dirname "$0")/wp-cli.sh" eval-file \
    /var/www/html/wp-content/plugins/tia-wordpress-elements/scripts/wp-seed-fixture.php "$@"
