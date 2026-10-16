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
 *   `fx-suite-paused@example.test` (paused), `fx-pro-active@example.test` (wind-down),
 *   `fx-no-role@example.test` (one of each Suite Subscriptions status, plus `unpaid`),
 *   `fx-suite-error@example.test` (HTTP 500); any other email finds none.
 * - `data-server-stub`: the data server URL is `https://data-server.test`. `/forecast_curves_assets` lists
 *   btc, dji and xau, each with Base Years from the current UTC year -2 to +2, plus `foo`, which no option
 *   enables. `/forecast_curves_data` answers one row per UTC day of the Base Year, Actual null after today;
 *   an unknown asset gets upstream's `400 {"error": "Invalid asset ID"}`.
 * - `data-server-forbidden`: the data server URL is `https://data-server.test`, and every call to it gets HTTP 403.
 * - `data-server-bad-request`: with `data-server-stub`, `/forecast_curves_data` answers `400 {"error": "Invalid asset ID"}`
 *   for every asset; `/forecast_curves_assets` still answers the stub list.
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
		$email = $match[1] ?? '';
		$day   = DAY_IN_SECONDS;
		// Per email: status, created, trial_end (0 = none), current_period_end, cancel_at_period_end, unit_amount, interval.
		$wind_down     = array( 'trialing', $now - 200 * $day, $now + 80 * $day, $now + 80 * $day, true, 99900, 'year' );
		$subscriptions = array(
			'fx-suite-active@example.test' => array( array( 'active', $now - 2 * $day, 0, $now + 300 * $day, false, 29900, 'year' ) ),
			'fx-suite-trial@example.test'  => array( array( 'trialing', $now - 2 * $day, $now + 5 * $day, $now + 5 * $day, false, 29900, 'year' ) ),
			'fx-suite-paused@example.test' => array( array( 'paused', $now - 2 * $day, 0, $now - $day, false, 29900, 'year' ) ),
			'fx-pro-active@example.test'   => array( $wind_down ),
			'fx-no-role@example.test'      => array(
				array( 'active', $now - 40 * $day, 0, $now + 20 * $day, false, 9900, 'month' ),
				array( 'active', $now - 300 * $day, 0, $now + 65 * $day, true, 99900, 'year' ),
				array( 'trialing', $now - 2 * $day, $now + 5 * $day, $now + 5 * $day, false, 9900, 'month' ),
				$wind_down,
				array( 'past_due', $now - 70 * $day, 0, $now + 10 * $day, false, 9900, 'month' ),
				array( 'paused', $now - 100 * $day, 0, $now - 10 * $day, false, 9900, 'month' ),
				array( 'incomplete', $now - $day, 0, $now + 29 * $day, false, 9900, 'month' ),
				array( 'unpaid', $now - 90 * $day, 0, $now - 30 * $day, false, 9900, 'month' ),
			),
		);
		$body          = $list( array() );
		if ( 'fx-suite-error@example.test' === $email ) {
			$status = 500;
			// Stripe's message can echo the query; the client must not pass it on.
			$body = array(
				'error' => array(
					'type'    => 'api_error',
					'message' => 'Something went wrong searching ' . $email,
				),
			);
		} elseif ( isset( $subscriptions[ $email ] ) ) {
			$subs = array();
			foreach ( $subscriptions[ $email ] as $index => list( $sub_status, $created, $trial_end, $period_end, $cancel, $amount, $interval ) ) {
				$subs[] = array(
					'id'                   => 'sub_stub_' . md5( $email ) . '_' . $index,
					'object'               => 'subscription',
					'status'               => $sub_status,
					'created'              => $created,
					'trial_end'            => $trial_end ? $trial_end : null,
					'cancel_at_period_end' => $cancel,
					'currency'             => 'usd',
					'items'                => $list(
						array(
							array(
								'price'              => array(
									'product'     => $product,
									'unit_amount' => $amount,
									'recurring'   => array( 'interval' => $interval ),
								),
								'quantity'           => 1,
								'current_period_end' => $period_end,
							),
						)
					),
				);
			}
			$body = $list(
				array(
					array(
						'id'            => 'cus_stub_' . md5( $email ),
						'object'        => 'customer',
						'email'         => $email,
						'subscriptions' => $list( $subs ),
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
 * The stub data server's assets: id => name, title, range begin, base, quote, curves (label, info, years, static).
 *
 * @return array<string, array{0: string, 1: string, 2: int, 3: string, 4: string, 5: array<int, array<string, mixed>>}>
 */
function tia_elements_test_data_server_assets() {
	$curve  = static fn( $label, $info, $extra = array() ) => array_merge( compact( 'label', 'info' ), $extra );
	$actual = $curve( 'Actual', 'Actual returns for the year' );
	$all    = $curve( 'All', 'Average returns for all years' );

	return array(
		'btc' => array(
			'Bitcoin - BTC',
			'Bitcoin Curves vs. Actual',
			2011,
			'btc',
			'usd',
			array(
				$actual,
				$all,
				$curve( 'Y1 Post-election', 'Average returns for post-election years', array( 'years' => array( 2013, 2017, 2021, 2025 ) ) ),
				$curve( 'Y2 Midterm', 'Average returns for midterm years', array( 'years' => array( 2014, 2018, 2022 ) ) ),
				$curve( 'Y3 Pre-election', 'Average returns for pre-election years', array( 'years' => array( 2015, 2019, 2023 ) ) ),
				$curve( 'Y4 Election', 'Average returns for election years', array( 'years' => array( 2012, 2016, 2020, 2024 ) ) ),
				$curve( 'Bear', 'Average returns for bear market years', array( 'years' => array( 2014, 2018, 2022 ) ) ),
				$curve( 'Bull', 'Average returns for bull market years', array( 'years' => array( 2013, 2017, 2021 ) ) ),
				$curve( 'Halving', 'Average returns for halving years', array( 'years' => array( 2012, 2016, 2020, 2024 ) ) ),
			),
		),
		'dji' => array(
			'Dow Jones Industrial - DJI',
			'Dow Jones Industrial Curves vs. Actual',
			1897,
			'^dji',
			'usd',
			array(
				$actual,
				$all,
				$curve( '20 & 60', 'Average returns for the selected years', array( 'static' => array( 20, 60 ) ) ),
				$curve( 'Y1 Post-election', 'Average returns for post-election years', array( 'years' => array( 2001, 2005, 2009, 2013, 2017, 2021, 2025 ) ) ),
				$curve( 'Y2 Midterm', 'Average returns for midterm years', array( 'years' => array( 2002, 2006, 2010, 2014, 2018, 2022 ) ) ),
				$curve( 'Y3 Pre-election', 'Average returns for pre-election years', array( 'years' => array( 2003, 2007, 2011, 2015, 2019, 2023 ) ) ),
				$curve( 'Y4 Election', 'Average returns for election years', array( 'years' => array( 2004, 2008, 2012, 2016, 2020, 2024 ) ) ),
				$curve( 'Decade offsets', 'Average returns for the same year of past decades', array( 'years' => array( 10, 20, 30 ) ) ),
			),
		),
		'xau' => array(
			'Gold - XAU',
			'Gold Curves vs. Actual',
			1971,
			'xauusd',
			'usd',
			array(
				$actual,
				$all,
				$curve( 'Y4 Election', 'Average returns for election years', array( 'years' => array( 2012, 2016, 2020, 2024 ) ) ),
			),
		),
		'foo' => array( 'Foo - not enabled', 'Foo Curves vs. Actual', 2000, 'foo', 'usd', array( $actual ) ),
	);
}

/**
 * Answers a data-server call: the asset list, or one asset's curve table for one Base Year.
 *
 * @param string               $url  Request URL.
 * @param array<string, mixed> $args Request arguments.
 * @return false|array<string, mixed>
 */
function tia_elements_test_data_server( $url, $args ) {
	if ( 'data-server.test' !== wp_parse_url( $url, PHP_URL_HOST ) ) {
		return false;
	}
	$path   = (string) wp_parse_url( $url, PHP_URL_PATH );
	$year   = (int) gmdate( 'Y' );
	$assets = tia_elements_test_data_server_assets();
	$status = 200;

	if ( '/forecast_curves_assets' === $path ) {
		$body = array( 'assets' => array() );
		foreach ( $assets as $id => list( $name, $title, $begin, $base, $quote, $curves ) ) {
			$body['assets'][] = array(
				'id'         => $id,
				'base'       => $base,
				'quote'      => $quote,
				'name'       => $name,
				'title'      => $title,
				'range'      => array(
					'begin' => $begin,
					'end'   => $year,
				),
				'base_years' => range( $year - 2, $year + 2 ),
				'curves'     => array_map( static fn( $curve, $curve_id ) => array( 'id' => $curve_id ) + $curve, $curves, array_keys( $curves ) ),
			);
		}
	} elseif ( '/forecast_curves_data' === $path ) {
		$request = json_decode( is_string( $args['body'] ?? null ) ? $args['body'] : '', true );
		$id      = is_array( $request ) ? $request['id'] ?? null : null;
		if ( ! is_string( $id ) || ! isset( $assets[ $id ] ) || in_array( 'data-server-bad-request', tia_elements_test_switches(), true ) ) {
			$status = 400;
			$body   = array( 'error' => 'Invalid asset ID' );
		} else {
			$base_year = (int) ( $request['base_year'] ?? $year );
			$ids       = array_map( static fn( $curve ) => (int) ( $curve['id'] ?? 0 ), (array) ( $request['curves'] ?? array() ) );
			$today     = strtotime( gmdate( 'Y-m-d' ) . ' 00:00:00 UTC' ) * 1000;
			$body      = array(
				'ids'     => $ids,
				'columns' => array_map( static fn( $curve_id ) => $assets[ $id ][5][ $curve_id ]['label'] ?? 'Curve ' . $curve_id, $ids ),
				'index'   => array(),
				'data'    => array(),
			);
			$day       = 0;
			$end       = gmmktime( 0, 0, 0, 1, 1, $base_year + 1 ) * 1000;
			for ( $at = gmmktime( 0, 0, 0, 1, 1, $base_year ) * 1000; $at < $end; $at += DAY_IN_SECONDS * 1000 ) {
				$body['index'][] = $at;
				$body['data'][]  = array_map(
					// Actual (id 0) has no value after today, as in the real data.
					static fn( $curve_id ) => 0 === $curve_id && $at > $today ? null : round( 8 * sin( ( $day + 23 * $curve_id ) / 40 ) + ( $curve_id - 3 ) * $day / 60, 2 ),
					$ids
				);
				++$day;
			}
		}
	} else {
		$status = 404;
		$body   = array( 'error' => 'Not found' );
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
 * Answers every data-server call with HTTP 403, as the allowlist does for an unknown egress IP.
 *
 * @param string $url Request URL.
 * @return false|array<string, mixed>
 */
function tia_elements_test_data_server_forbidden( $url ) {
	if ( 'data-server.test' !== wp_parse_url( $url, PHP_URL_HOST ) ) {
		return false;
	}
	return array(
		'headers'  => array( 'content-type' => 'text/html' ),
		'body'     => '<html><body><h1>403 Forbidden</h1></body></html>',
		'response' => array(
			'code'    => 403,
			'message' => 'Forbidden',
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
		'supabase-stub'         => 'tia_elements_test_supabase',
		'stripe-stub'           => 'tia_elements_test_stripe',
		'data-server-forbidden' => 'tia_elements_test_data_server_forbidden',
		'data-server-stub'      => 'tia_elements_test_data_server',
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
if ( array_intersect( array( 'data-server-stub', 'data-server-forbidden' ), tia_elements_test_switches() ) ) {
	add_filter( 'pre_option_tia_data_server_url', static fn() => 'https://data-server.test' );
}
if ( in_array( 'stripe-stub', tia_elements_test_switches(), true ) ) {
	add_filter( 'pre_option_tia_stripe_key', static fn() => 'rk_test_stub' );
}
add_filter( 'pre_http_request', 'tia_elements_test_http', 10, 3 );
