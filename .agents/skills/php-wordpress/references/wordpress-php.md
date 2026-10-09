# The WordPress PHP contract

Four obligations on every request that touches user input. WPCS enforces all four, and its own function lists — extracted below from WPCS 3.4.1 — are the operational definition of each.

## 1. Authorize, then verify intent

Two separate checks, and passing one is not passing the other:

- **Capability** — `current_user_can( 'edit_post', $post_id )`. Answers *may this user do this?*
- **Nonce** — `check_admin_referer()`, `check_ajax_referer()`, or `wp_verify_nonce()`. Answers *did this user mean to do this, from our form?*

Those three are the entire list `WordPress.Security.NonceVerification` accepts; a wrapper of your own reads as no check at all unless you add it to `customNonceVerificationFunctions` in `phpcs.xml.dist`. Reading any superglobal before one of them fires raises `NonceVerification.Missing` for `$_POST` and `NonceVerification.Recommended` for `$_GET`.

## 2. Unslash, then sanitize

WordPress adds slashes to every superglobal. `wp_unslash()` removes them, and it must come **before** the sanitizer, not after.

The exception is a short list of functions WPCS treats as implicitly unslashing, so `wp_unslash()` is redundant with them and required with everything else:

```
absint  boolval  count  doubleval  floatval  intval
rest_sanitize_boolean  sanitize_key  sanitize_locale_name  sizeof
```

`sanitize_text_field()` is **not** on that list. The correct shape:

```php
$name = isset( $_POST['name'] )
	? sanitize_text_field( wp_unslash( $_POST['name'] ) )
	: '';
$id   = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0;   // no wp_unslash needed
```

Functions `WordPress.Security.ValidatedSanitizedInput` accepts as sanitizing:

```
_wp_handle_upload  esc_url_raw  filter_input  filter_var  hash_equals  is_email
number_format  sanitize_bookmark  sanitize_bookmark_field  sanitize_email
sanitize_file_name  sanitize_hex_color  sanitize_hex_color_no_hash
sanitize_html_class  sanitize_meta  sanitize_mime_type  sanitize_option
sanitize_sql_orderby  sanitize_term  sanitize_term_field  sanitize_text_field
sanitize_textarea_field  sanitize_title  sanitize_title_for_query
sanitize_title_with_dashes  sanitize_url  sanitize_user  sanitize_user_field
validate_file  wp_handle_sideload  wp_handle_upload  wp_kses  wp_kses_allowed_html
wp_kses_data  wp_kses_one_attr  wp_kses_post  wp_parse_id_list  wp_redirect
wp_safe_redirect  wp_sanitize_redirect  wp_strip_all_tags
```

This sniff lives only in the `WordPress` standard — `WordPress-Extra` does not include it.

## 3. Escape late, at the point of output

Functions `WordPress.Security.EscapeOutput` accepts:

```
absint  esc_attr  esc_attr__  esc_attr_e  esc_attr_x  esc_html  esc_html__
esc_html_e  esc_html_x  esc_js  esc_sql  esc_textarea  esc_url  esc_url_raw
esc_xml  filter_input  filter_var  floatval  highlight_string  intval
json_encode  like_escape  number_format  rawurlencode  sanitize_hex_color
sanitize_hex_color_no_hash  sanitize_html_class  sanitize_key
sanitize_locale_name  sanitize_user_field  tag_escape  urlencode  urlencode_deep
wp_json_encode  wp_kses  wp_kses_data  wp_kses_one_attr  wp_kses_post
```

Three things about that list:

- **Escaping does not survive assignment.** `$out = wp_kses_post( $x ); echo $out;` is flagged `EscapeOutput.OutputNotEscaped`; the sniff matches the escaping call *at* the output. Escape inline in the `echo`, or in the `printf()` argument.
- **`like_escape()` is on the list and has been deprecated since WordPress 4.0.** Use `$wpdb->esc_like()`. A clean WPCS run is not evidence that a function is current.
- **`esc_url()` and `sanitize_url()` changed in WordPress 6.9**: a URL with no scheme now gets `https://` prepended when `https` is first in `$protocols`, where it used to get `http://`. `esc_url_raw()` has been a plain alias for `sanitize_url()` since 6.1.

Pick by context, not by habit: `esc_html()` in text, `esc_attr()` in attributes, `esc_url()` in `href`/`src`, `esc_textarea()` in `<textarea>`, `esc_js()` in inline JS, `wp_kses_post()` when the value is meant to carry markup. Translation wrappers (`esc_html__`, `esc_attr_e`) escape and translate in one call — prefer them over nesting.

## 4. Prepare every query

`$wpdb->prepare()` supports `%d`, `%f`, `%s`, and — since WordPress 6.2 — `%i` for identifiers (table and column names). Verified against `WordPress.DB.PreparedSQL` and `PreparedSQLPlaceholders`:

```php
// ✅ interpolating a $wpdb property is allowed; any other variable is not
$wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->posts} WHERE ID = %d", $id ) );

// ✅ %i for a dynamic table name
$wpdb->get_row( $wpdb->prepare( 'SELECT * FROM %i WHERE ID = %d', $table, $id ) );

// ✅ LIKE, with esc_like for the user-supplied part
$wpdb->get_row( $wpdb->prepare(
	"SELECT * FROM {$wpdb->posts} WHERE post_title LIKE %s",
	'%' . $wpdb->esc_like( $term ) . '%'
) );

// ✅ dynamic IN () — the placeholder list must be built inline
$wpdb->get_results( $wpdb->prepare(
	sprintf(
		"SELECT ID FROM {$wpdb->posts} WHERE ID IN (%s)",
		implode( ',', array_fill( 0, count( $ids ), '%d' ) )
	),
	$ids
) );
```

The failures are specific and easy to hit:

```php
// ❌ same query, placeholder list assigned first:
//    PreparedSQL.InterpolatedNotPrepared + PreparedSQLPlaceholders.UnfinishedPrepare
$ph = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
$wpdb->get_results( $wpdb->prepare( "… IN ($ph)", $ids ) );

// ❌ numbered placeholders are not quoted automatically: UnquotedComplexPlaceholder
$wpdb->prepare( 'SELECT * FROM %1$s WHERE ID = %2$d', $table, $id );

// ❌ the sniff counts a spread as one argument: ReplacementsWrongNumber
$wpdb->prepare( "… IN (%d,%d,%d)", ...$ids );
```

Under `--standard=WordPress` every `$wpdb->` call also raises `DirectDatabaseQuery.DirectQuery` and `NoCaching` as warnings. Treat them as a prompt: could this have been `WP_Query` or `get_posts()`, and if not, is the result going through `wp_cache_get()` / `wp_cache_set()`? Silence them per-directory in `phpcs.xml.dist`, never globally.

## Typed hooks

`add_action()` and `add_filter()` callbacks receive whatever core passes, and PHPStan cannot see through `apply_filters()` unless the call site carries a docblock. See [static-analysis.md](static-analysis.md) — documenting a filter is what makes it analysable, so the docblock is load-bearing rather than decorative.
