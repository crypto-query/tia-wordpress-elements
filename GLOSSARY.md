# TIA WordPress Elements

A WordPress plugin that ships TIA features to the TIA WordPress site. It starts with Blocks for TIA indicators; later it also ships non-UI features.

## Language

### Plugin units

**Element**:
Any unit the plugin ships to the site: a Block, a shortcode, a REST service, a scheduled job.
_Avoid_: Module, feature, widget

**Block**:
An Element that is a Gutenberg block an editor places on a page.
_Avoid_: Widget, component

### Access

**Member**:
A WordPress user who holds the TIA Pro role and either a live subscription (`active`, `on-hold`, `pending-cancel`) or no subscription at all (a manual grant). A user whose subscriptions have all ended is not a Member. The TIA Pro subscription, when there is one, sets the access level and the Access Cut-off.
_Avoid_: Subscriber (a WordPress role name), customer, user

**TIA Pro**:
The TIA subscription product that gives a Member access to the indicator Blocks.
_Avoid_: Pro plan, premium

**Access Cut-off**:
The last moment of indicator data a Member may see; data after it stays hidden.
_Avoid_: Access until, expiry, paywall date
