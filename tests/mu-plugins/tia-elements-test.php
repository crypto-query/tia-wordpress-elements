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
 * - `supabase-stub`: Supabase is configured with fake values, and month_returns reads answer with fixture rows.
 * - `stripe-stub`: Stripe is configured with a fake key, and Stripe calls answer per email with fixture customers:
 *   `fx-suite-active@example.test` (active), `fx-suite-trial@example.test` (7-day trialing),
 *   `fx-suite-paused@example.test` (paused), `fx-suite-error@example.test` (HTTP 500); any other email finds none.
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
 * Answers a month_returns read with fixture rows: the asset list, one asset's data, or one row for `limit`.
 *
 * @param string $url Request URL.
 * @return false|array<string, mixed>
 */
function tia_elements_test_supabase( $url ) {
	if ( ! str_ends_with( (string) wp_parse_url( $url, PHP_URL_PATH ), '/rest/v1/month_returns' ) ) {
		return false;
	}
	// parse_str() decodes the query, so `%5Edji` reads as `^dji`.
	parse_str( (string) wp_parse_url( $url, PHP_URL_QUERY ), $query );

	$assets = array(
		array( 'Bitcoin - BTC', 'btc', 'usd', array( 1, 3, 6, 12 ) ),
		array( 'Bitcoin - BTC/EUR', 'btc', 'eur', array( 1 ) ),
		array( 'Ethereum - ETH', 'eth', 'usd', array( 1, 3 ) ),
		array( 'ASX 200 - XJO', 'xjo.indx', 'aud', array( 1, 12 ) ),
		array( 'Dow Jones - DJI', '^dji', 'usd', array( 12 ) ),
	);
	$rows   = array();
	foreach ( $assets as list( $title, $base, $quote, $periods ) ) {
		foreach ( $periods as $period ) {
			$rows[] = compact( 'title', 'base', 'quote', 'period' );
		}
	}

	if ( isset( $query['limit'] ) ) {
		$rows = array( array( 'base' => 'btc' ) );
	} elseif ( isset( $query['base'] ) ) {
		// Only btc/usd has data; any other asset reads no row.
		$period = (int) substr( (string) ( $query['period'] ?? '' ), 3 );
		$rows   = array();
		if ( 'eq.btc' === $query['base'] && 'eq.usd' === ( $query['quote'] ?? '' ) && in_array( $period, array( 1, 3, 6, 12 ), true ) ) {
			$rows[] = array(
				'title'  => 'Bitcoin - BTC',
				'base'   => 'btc',
				'quote'  => 'usd',
				'period' => $period,
				// Years and months arrive unsorted; 2026 is all null; 2024 holds a real 0.
				'data'   => array(
					2024 => array_combine( range( 1, 12 ), array( 0.5, -3.2, 0, 4.75, -1.1, 2.4, 3.21, -2.1, 1.05, 6.3, -0.4, 2.2 ) ),
					2026 => array_fill_keys( range( 1, 12 ), null ),
					2025 => array_combine( range( 12, 1 ), array( null, null, null, null, null, null, null, -4.4, 1.9, 0.3, -2.75, 5.5 ) ),
				),
			);
		}
	}

	return array(
		'headers'  => array( 'content-type' => 'application/json' ),
		'body'     => wp_json_encode( $rows ),
		'response' => array(
			'code'    => 200,
			'message' => 'OK',
		),
		'cookies'  => array(),
		'filename' => null,
	);
}

/**
 * Answers a Stripe call: Customer Search per email, the suite product, and the subscription list.
 *
 * @param string $url Request URL.
 * @return false|array<string, mixed>
 */
function tia_elements_test_stripe( $url ) {
	if ( 'api.stripe.com' !== wp_parse_url( $url, PHP_URL_HOST ) ) {
		return false;
	}
	$path = (string) wp_parse_url( $url, PHP_URL_PATH );
	parse_str( (string) wp_parse_url( $url, PHP_URL_QUERY ), $query );
	$now     = time();
	$product = 'prod_QhxKPj5ay8NjPH';
	$list    = static fn( $data ) => array(
		'object'   => 'list',
		'data'     => $data,
		'has_more' => false,
	);

	$status = 200;
	if ( str_starts_with( $path, '/v1/products/' ) ) {
		$body = array(
			'id'       => substr( $path, strlen( '/v1/products/' ) ),
			'object'   => 'product',
			'name'     => 'TIA Indicator Suite (stub)',
			'livemode' => false,
		);
	} elseif ( '/v1/subscriptions' === $path ) {
		$body = $list( array() );
	} elseif ( '/v1/customers/search' === $path ) {
		preg_match( '/^email:"(.*)"$/', (string) ( $query['query'] ?? '' ), $match );
		$email    = $match[1] ?? '';
		$statuses = array(
			'fx-suite-active@example.test' => array( 'active', 0, $now + 300 * DAY_IN_SECONDS ),
			'fx-suite-trial@example.test'  => array( 'trialing', $now + 5 * DAY_IN_SECONDS, $now + 5 * DAY_IN_SECONDS ),
			'fx-suite-paused@example.test' => array( 'paused', 0, $now - DAY_IN_SECONDS ),
		);
		$body     = $list( array() );
		if ( 'fx-suite-error@example.test' === $email ) {
			$status = 500;
			// Stripe's message can echo the query; the client must not pass it on.
			$body = array(
				'error' => array(
					'type'    => 'api_error',
					'message' => 'Something went wrong searching ' . $email,
				),
			);
		} elseif ( isset( $statuses[ $email ] ) ) {
			list( $sub_status, $trial_end, $period_end ) = $statuses[ $email ];

			$body = $list(
				array(
					array(
						'id'            => 'cus_stub_' . md5( $email ),
						'object'        => 'customer',
						'email'         => $email,
						'subscriptions' => $list(
							array(
								array(
									'id'                   => 'sub_stub_' . md5( $email ),
									'object'               => 'subscription',
									'status'               => $sub_status,
									'created'              => $now - 2 * DAY_IN_SECONDS,
									'trial_end'            => $trial_end ? $trial_end : null,
									'cancel_at_period_end' => false,
									'currency'             => 'usd',
									'items'                => $list(
										array(
											array(
												'price'    => array(
													'product'     => $product,
													'unit_amount' => 29900,
													'recurring'   => array( 'interval' => 'year' ),
												),
												'quantity' => 1,
												'current_period_end' => $period_end,
											),
										)
									),
								),
							)
						),
					),
				)
			);
		}
	} else {
		$status = 404;
		$body   = array(
			'error' => array(
				'type' => 'invalid_request_error',
				'code' => 'resource_missing',
			),
		);
	}

	return array(
		'headers'  => array( 'content-type' => 'application/json' ),
		'body'     => wp_json_encode( $body ),
		'response' => array(
			'code'    => $status,
			'message' => 200 === $status ? 'OK' : 'Error',
		),
		'cookies'  => array(),
		'filename' => null,
	);
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
	$stubs = array(
		'supabase-stub' => 'tia_elements_test_supabase',
		'stripe-stub'   => 'tia_elements_test_stripe',
	);
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
if ( in_array( 'supabase-stub', tia_elements_test_switches(), true ) ) {
	add_filter( 'pre_option_tia_supabase_url', static fn() => 'https://supabase.test' );
	add_filter( 'pre_option_tia_supabase_key', static fn() => 'test-key' );
}
if ( in_array( 'stripe-stub', tia_elements_test_switches(), true ) ) {
	add_filter( 'pre_option_tia_stripe_key', static fn() => 'rk_test_stub' );
}
add_filter( 'pre_http_request', 'tia_elements_test_http', 10, 3 );
