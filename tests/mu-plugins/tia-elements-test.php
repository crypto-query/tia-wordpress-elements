<?php
/**
 * Plugin Name: TIA Elements test switches
 * Description: Per-request test switches for the LOCAL dev site only. Never install it on a live site.
 *
 * `bun run wp:seed` links this file into wp-content/mu-plugins/, `bun run wp:seed clean` removes
 * the link, and `bun run wp:use` re-points it to the active copy of the plugin.
 * A request turns switches on with the header `X-Tia-Elements-Test` or the cookie
 * `tia_elements_test`: a comma-separated list of switch names.
 *
 * Switches:
 * - `wcs-unavailable`: every WooCommerce Subscriptions read of a user's subscriptions throws.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * The switch names this request turns on.
 *
 * @return array<int, string>
 */
function tia_elements_test_switches() {
	$raw = '';
	if ( isset( $_SERVER['HTTP_X_TIA_ELEMENTS_TEST'] ) ) {
		$raw = sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_TIA_ELEMENTS_TEST'] ) );
	} elseif ( isset( $_COOKIE['tia_elements_test'] ) ) {
		$raw = sanitize_text_field( wp_unslash( $_COOKIE['tia_elements_test'] ) );
	}
	return array_values( array_filter( array_map( 'sanitize_key', explode( ',', $raw ) ) ) );
}

/**
 * Swaps in a customer store that throws. WCS applies this filter only after it has loaded,
 * so the file whose class extends a WCS class loads here and not with this file.
 *
 * @return string
 */
function tia_elements_test_wcs_store_class() {
	require_once __DIR__ . '/class-tia-elements-test-throwing-customer-store.php';
	return 'TIA_Elements_Test_Throwing_Customer_Store';
}

/**
 * Answers outbound HTTP for the switches that stub it.
 *
 * @param false|array<string, mixed> $response The response so far; false sends the request.
 * @param array<string, mixed>       $args     Request arguments.
 * @param string                     $url      Request URL.
 * @return false|array<string, mixed>
 */
function tia_elements_test_http( $response, $args, $url ) {
	// Switch name => callable( $url, $args ) returning a response array, or false to pass.
	$stubs = array();
	foreach ( array_intersect_key( $stubs, array_flip( tia_elements_test_switches() ) ) as $stub ) {
		$stubbed = $stub( $url, $args );
		if ( false !== $stubbed ) {
			return $stubbed;
		}
	}
	return $response;
}

if ( in_array( 'wcs-unavailable', tia_elements_test_switches(), true ) ) {
	add_filter( 'wcs_customer_store_class', 'tia_elements_test_wcs_store_class' );
}
add_filter( 'pre_http_request', 'tia_elements_test_http', 10, 3 );
