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

### Forward Returns

**Holding Period**:
How long a position is held in Forward Returns: one, three, six or twelve months. Every return the Block reports is the return over exactly one Holding Period. Older screens call it "Time Period" and name its values Monthly, Quarterly, Semiannually and Annually; these mean the same four Holding Periods.
_Avoid_: Time Period, horizon

**Entry Month**:
The calendar month a Holding Period starts in, and the identity of a column in the Forward Returns table. A header such as "JAN - MAR" names the Entry Month January and the Holding Period that runs from it.
_Avoid_: Start month, column month

**Entry Offset**:
Which family of Entry Months the Forward Returns table shows when the Holding Period is longer than one month. The families do not overlap, so each Entry Month belongs to exactly one.
_Avoid_: Shift, phase

**Return Cell**:
One Year and one Entry Month for the asset and Holding Period on screen: the return over one Holding Period. It is the smallest unit a Member can exclude.
_Avoid_: Cell value, observation

**Excluded**:
A Year or a Return Cell a Member has switched off, so it does not count toward the results. An Excluded Year holds at every Entry Offset and keeps the exclusions inside it; an Excluded Return Cell holds only at its own Entry Offset.
_Avoid_: Deselected, hidden, disabled

**Partial**:
A Return Cell whose Holding Period has not ended yet, so its value covers only the months so far. It never counts toward the results.
_Avoid_: Incomplete, provisional, open

**Returns**:
The share of counted Return Cells whose value is positive, as a percentage of all counted Return Cells that have a value. It measures how often a Holding Period ended up, not by how much.
_Avoid_: Win rate, hit rate, average return
