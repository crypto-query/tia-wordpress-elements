---
name: tia-db-import
description: Replace the Docker site's database with the live tiainvestor.com content, so the local site looks like live, then seed the test data again.
disable-model-invocation: true
---

# Live content import

Gives the Docker site at `http://localhost:8000` the live site's pages, menus, layouts, courses, products and settings. It adapts the site repo's own `wordpress/.claude/skills/tia-db-import` (written for Herd) to Docker. It also replaces that skill's sanitiser with a **content-only export**: customer data stays on production.

## Production is read-only

The live server is `ssh tia-investor`. Every command there **reads**; its output streams to this machine.

| Allowed on production | Reason |
|---|---|
| `wp config get … --skip-plugins --skip-themes` | Reads `wp-config.php` without loading WordPress |
| `wp db query "SELECT …" --skip-plugins --skip-themes` | Reads rows |
| `mysqldump --single-transaction` to stdout | Takes no table locks |
| `rsync`/`scp` from the server | Copies files to this machine |

Every other command needs the user's explicit approval first. That includes any `wp` command without both skip flags, since loading plugins can write transients, cron entries and audit-log rows. It also includes any redirect into a file on the server, and anything that copies to the server. `wp db export` fails silently there, so use `mysqldump`.

## What comes over

| Exported | Kept on production |
|---|---|
| `wp_options` without transients | `wp_users`, `wp_usermeta` and the `*_old` copies |
| `wp_posts` and their `wp_postmeta`, except the post types in `SKIP` | orders, subscriptions, refunds, coupons, revisions |
| all four term tables | comments, Fluent Forms entries, Fluent Support, FluentSMTP, Automator, WSAL and LearnDash activity logs |
| `wp_fluentform_forms`, `wp_fluentform_form_meta` | Automator recipes, RetentionKit workflows |

`wp_options` still holds live API keys and SMTP credentials. Step 3 blanks the keys that reach live services. Images are not copied: the `tia-local-media-fallback.php` mu-plugin loads them from tiainvestor.com.

## 1. Check the setup

Each item is done when its check passes:

| Item | Check | Fix |
|---|---|---|
| Submodule | `wordpress/.claude/skills/tia-db-import/scripts/local-safety.php` exists | `git submodule update --init wordpress` |
| Mounts and constants | `docker exec tia-wordpress-elements_devcontainer-wordpress-1 printenv WORDPRESS_CONFIG_EXTRA` has `'WP_ENVIRONMENT_TYPE', 'local'` | Recreate the site container (below) |
| Composer packages of the site's own plugins | `wordpress/wp-content/plugins/{tia-api-connector,subscription-sync}/vendor/` exist | `composer install --working-dir=<plugin folder>` for each |
| OIDC keys | `wordpress/wp-content/mu-plugins/oidc.key` exists | `php wordpress/.claude/skills/tia-local-setup/scripts/generate-oidc-keys.php wordpress` |

Recreate the site container only, and keep its volumes:

```bash
docker compose -p tia-wordpress-elements_devcontainer -f .devcontainer/compose.yaml up -d --force-recreate wordpress
```

## 2. Confirm the reset

The import deletes the Docker database `wordpress`: every local post, user and setting. The `wp:seed` data comes back at the end. Get the user's yes before step 3.

## 3. Import

```bash
bash .agents/skills/tia-db-import/scripts/import.sh
```

It runs in this order: reset, stream the export into the database container's `mysql`, create the user `admin`/`admin`, rewrite the live URLs to `http://localhost:8000`, run the site repo's `local-safety.php`, flush, delete the live TIA Pro and TIA Membership products (`wp:seed` makes its own at the same IDs), `wp:use`, `wp:seed`. Done when it ends with the `wp:seed` success line and `local-safety.php` printed its `Changed:` list.

## 4. Verify

Done when each check passes:

1. `http://localhost:8000/` shows the live home page: the hero, the stats and the navigation menu.
2. `/my-account/` as a seeded Member shows the membership dashboard.
3. `bun run test:e2e` passes.

## 5. Report

- What `local-safety.php` changed, and every warning it printed.
- Any check in step 4 that failed, with the page and the error.
