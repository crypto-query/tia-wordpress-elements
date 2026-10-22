#!/usr/bin/env bash
# Replaces the Docker site's database with the live site's content, then seeds the test data again.
# Production is only read: one ssh session runs mysqldump with --single-transaction and writes to stdout.
# Customer data stays on production: users, orders, subscriptions, coupons and plugin logs are not exported.
set -euo pipefail

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
wp() { bash "$root/scripts/wp-cli.sh" "$@"; }
H=tia-wordpress-elements-wp-cli
# The wp:cli image's MariaDB client cannot log in to MySQL 8.4, so `wp db reset/import` fail; use the server's own client.
mysql() { docker exec -i -e MYSQL_PWD=wordpress tia-wordpress-elements_devcontainer-database-1 mysql -uwordpress "$@"; }
URL=http://localhost:8000
LIVE=domains/tiainvestor.com/public_html
SAFETY="$root/wordpress/.claude/skills/tia-db-import/scripts/local-safety.php"
# Post types that hold customer data, logs, or Automator and RetentionKit jobs that call live services.
SKIP="'shop_order','shop_order_placehold','shop_order_refund','shop_subscription','shop_coupon','revision','uo-recipe','uo-trigger','uo-action','uo-closure','rk_workflows','seopress_404'"

[ -f "$SAFETY" ] || { echo "Missing $SAFETY. Run: git submodule update --init wordpress" >&2; exit 1; }
docker exec tia-wordpress-elements_devcontainer-wordpress-1 printenv WORDPRESS_CONFIG_EXTRA | grep -qF "'WP_ENVIRONMENT_TYPE', 'local'" ||
    { echo "WP_ENVIRONMENT_TYPE is not 'local'. Recreate the site container." >&2; exit 1; }

# Docker and wp:use write these into the submodule's folders; keep them out of the site repo's status.
exclude=$(git -C "$root/wordpress" rev-parse --git-path info/exclude)
mkdir -p "$(dirname "$exclude")"
for line in '/wp-content/plugins/tia-wordpress-elements*' '/wp-content/mu-plugins/tia-elements-test.php'; do
    grep -qxF "$line" "$exclude" 2>/dev/null || echo "$line" >>"$exclude"
done

# This plugin's settings hold local keys; keep them in memory across the reset.
wp cli version >/dev/null # starts the wp-cli helper that the plain `docker exec` calls use
settings=$(docker exec -i "$H" wp eval-file - --skip-plugins --skip-themes 2>/dev/null <<'PHP' || echo '{}'
<?php
require WP_PLUGIN_DIR . '/tia-wordpress-elements/includes/class-tia-elements-settings.php';
$keep = array();
foreach ( TIA_Elements_Settings::OPTIONS as $name ) {
    $value = get_option( $name, null );
    if ( null !== $value ) {
        $keep[ $name ] = $value;
    }
}
echo wp_json_encode( (object) $keep );
PHP
)

mysql -e 'DROP DATABASE wordpress; CREATE DATABASE wordpress'

# The remote script only reads the config and dumps tables; its output is the SQL stream.
remote=$(
    cat <<EOF
set -e
cd $LIVE
c() { wp config get "\$1" --skip-plugins --skip-themes; }
export MYSQL_PWD="\$(c DB_PASSWORD)"
d() { mysqldump --single-transaction --no-tablespaces -h "\$(c DB_HOST)" -u "\$(c DB_USER)" "\$(c DB_NAME)" "\$@"; }
# Every table, empty: the imported options tell plugins they are installed, so they create no tables of their own.
d --no-data
d wp_terms wp_term_taxonomy wp_termmeta wp_term_relationships wp_fluentform_forms wp_fluentform_form_meta
d wp_options --where="LEFT(option_name, 11) <> '_transient_' AND LEFT(option_name, 16) <> '_site_transient_'"
d wp_posts --where="post_type NOT IN ($SKIP)"
d wp_postmeta --where="post_id IN (SELECT ID FROM wp_posts WHERE post_type NOT IN ($SKIP))"
EOF
)
# Live runs MariaDB 11: drop its sandbox line, map its uca1400 collations, and drop the live user as view DEFINER.
ssh -o ConnectTimeout=10 tia-investor bash -s <<<"$remote" 2> >(grep -v 'post-quantum\|store now\|openssh.com/pq' >&2) |
    sed -E -e '/enable the sandbox mode/d' \
        -e '/^INSERT/!s/(utf8mb[34])_uca1400_[a-z_]+/\1_unicode_ci/g' \
        -e '/^INSERT/!s/DEFINER=[^ ]+ //' |
    mysql wordpress

# Off before any command loads every plugin: LiteSpeed writes WP_CACHE into wp-config.php on its first load.
wp plugin deactivate litespeed-cache facebook-for-woocommerce --skip-plugins --skip-themes
# A web request during the import can still load LiteSpeed once.
docker exec tia-wordpress-elements_devcontainer-wordpress-1 sed -i "/^define( 'WP_CACHE', true );/d" /var/www/html/wp-config.php
docker exec -i "$H" wp eval 'foreach ( json_decode( stream_get_contents( STDIN ), true ) as $k => $v ) { update_option( $k, $v ); }' \
    --skip-plugins --skip-themes <<<"$settings"
wp user create admin admin@example.com --role=administrator --user_pass=admin --skip-plugins --skip-themes
# The editor's Welcome Guide would cover the canvas in the e2e tests that edit as admin.
wp user meta update admin wp_persisted_preferences '{"core/edit-post":{"welcomeGuide":false}}' --format=json \
    --skip-plugins --skip-themes

F=(--all-tables-with-prefix --precise --skip-columns=guid --skip-plugins --skip-themes --report-changed-only)
for from in https://www.tiainvestor.com https://tiainvestor.com http://www.tiainvestor.com http://tiainvestor.com; do
    wp search-replace "$from" "$URL" "${F[@]}"
done
wp search-replace 'https:\/\/www.tiainvestor.com' 'http:\/\/localhost:8000' "${F[@]}"
wp search-replace 'https:\/\/tiainvestor.com' 'http:\/\/localhost:8000' "${F[@]}"

docker exec -i "$H" wp eval-file - <"$SAFETY"

wp rewrite flush
wp cache flush
wp transient delete --all

# wp:seed makes its own TIA products at the live IDs the plugin reads, so the live copies make way.
read -ra variations <<<"$(wp post list --post_type=product_variation --post_parent=244 --post_status=any --format=ids --skip-plugins --skip-themes)"
wp post delete 19339 244 "${variations[@]}" --force --skip-plugins --skip-themes

bash "$root/scripts/wp-use.sh"
bash "$root/scripts/wp-seed.sh"
