# TIA Suite Pages are a WooCommerce endpoint filled from seeded synced patterns

The plugin serves `/my-account/tia-suite/` and `/my-account/tia-suite/<slug>/` as one WooCommerce My Account endpoint, `tia-suite`, with the slug as the endpoint value. It does not use real pages. The endpoint rule always beats a child page rule. It inherits page 9's layout, login redirect, member header and no-cache rule, and it leaves no content behind on deactivation. The content of each URL comes from a synced pattern that the plugin creates once and editors own after that. This way the URLs work right after activation, and editors can still change them without a plugin release.

## Considered Options

- **Child pages of page 9.** Rejected. A `tia-suite` endpoint would shadow them, grandchildren get the public header, and the plugin would have to seed site-specific layout patterns and a theme template.
- **Content in plugin code only.** Rejected. Every text change would need a plugin release.
- **Editing page 9 and the menu pattern in the database.** Rejected. The edits would stay after deactivation and point the menu at a 404.

## Consequences

- The plugin changes site output at render time. It replaces the "Indicator Suite" menu item in pattern 18091, which it matches by its link `/my-account/indicators/` because three items share its class. On the endpoint, it removes page 9's "Members - Dashboard" container (`block_id` `9b7a30fb`). If someone edits these on the site, the filters stop matching and nothing warns about it.
- An unknown slug must get a 404 from the plugin, because nothing in WooCommerce checks the endpoint value.
- Activation does not run on a plugin update. A stored rewrite version, checked on `init`, rebuilds the rules. Deactivation deletes `rewrite_rules`, because a flush there would still see the endpoint.
- A deleted pattern falls back to the plugin's default markup and is not seeded again. Uninstall deletes the seeded patterns.
