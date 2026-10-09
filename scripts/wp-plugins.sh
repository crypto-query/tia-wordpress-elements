#!/usr/bin/env bash
# Copies the WordPress plugins the local site needs from the live server into
# wordpress/plugins/ (gitignored); .devcontainer/compose.yaml mounts them.
# Read-only on the server. When live moves to a new version, bump the pin here.
set -euo pipefail

REMOTE="tia-investor:/home/u532644514/domains/tiainvestor.com/public_html/wp-content/plugins"
PLUGINS=(
    "woocommerce 11.2.1"
    "woocommerce-subscriptions 9.3.0"
    "block-visibility 3.8.1"
)

cd "$(dirname "$0")/.."
mkdir -p wordpress/plugins

for entry in "${PLUGINS[@]}"; do
    read -r name pinned <<<"$entry"
    rsync -a --delete "$REMOTE/$name/" "wordpress/plugins/$name/"
    actual=$(grep -m1 -E '^[[:space:]*]*Version:' "wordpress/plugins/$name/$name.php" | sed -E 's/.*Version:[[:space:]]*//' | tr -d '\r')
    if [[ "$actual" != "$pinned" ]]; then
        echo "$name: live has $actual, pinned is $pinned. Update the pin in $0." >&2
        exit 1
    fi
    echo "$name $actual"
done
