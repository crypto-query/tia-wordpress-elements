<?php
/**
 * Entitlement test data for the LOCAL WordPress only. Never run it on a live site.
 *
 * Run through `bun run wp:seed` (add `clean` to only remove the data). Each run removes
 * what the previous run made: users, subscriptions, products and pages that carry the seed marker,
 * then makes them again with dates relative to now (UTC), and checks the result.
 *
 * @package tia-wordpress-elements
 */

defined( 'WP_CLI' ) || exit;

const TIA_ELEMENTS_SEED_MARKER    = '_tia_elements_seed';
const TIA_ELEMENTS_SEED_ROLES_OPT = 'tia_elements_seed_roles';
const TIA_ELEMENTS_SEED_PRO_ID    = 19339;
const TIA_ELEMENTS_SEED_OTHER_SKU = 'tia-seed-other-subscription';
const TIA_ELEMENTS_SEED_PAGES     = array(
	'forward-returns' => array(
		'title'   => 'Forward Returns',
		'content' => '<!-- wp:tia-elements/forward-returns /-->',
	),
);

/**
 * The fixture table. `set` holds the dates the seed writes; `expect` the end state to check.
 * An empty expected value means the date must be unset.
 *
 * @param int $now Unix time the run started.
 * @return array<string, array{role: string, subs: array<int, array<string, mixed>>}>
 */
function tia_elements_seed_fixtures( $now ) {
	$months = fn( $n ) => gmdate( 'Y-m-d H:i:s', strtotime( sprintf( '%+d months', $n ), $now ) );
	$days   = fn( $n ) => gmdate( 'Y-m-d H:i:s', $now + $n * DAY_IN_SECONDS );
	$pro    = 'tia_pro_-_annual';
	$none   = array(
		'trial_end'                  => '',
		'next_payment'               => '',
		'end'                        => '',
		'trial_end_pre_cancellation' => '',
	);

	return array(
		'fx-no-role'             => array(
			'role' => 'subscriber',
			'subs' => array(),
		),
		'fx-other-paid'          => array(
			'role' => 'tia_standard_-_annually',
			'subs' => array(),
		),
		'fx-pro-active'          => array(
			'role' => $pro,
			'subs' => array(
				array(
					'product' => 'pro',
					'status'  => 'active',
					'start'   => $months( -3 ),
					'set'     => array( 'next_payment' => $months( 9 ) ),
					'expect'  => array_merge( $none, array( 'next_payment' => $months( 9 ) ) ),
				),
			),
		),
		'fx-pro-trial'           => array(
			'role' => $pro,
			'subs' => array(
				array(
					'product' => 'pro',
					'status'  => 'active',
					'start'   => $days( -2 ),
					'set'     => array(
						'trial_end'    => $days( 5 ),
						'next_payment' => $days( 5 ),
					),
					'expect'  => array_merge(
						$none,
						array(
							'trial_end'    => $days( 5 ),
							'next_payment' => $days( 5 ),
						)
					),
				),
			),
		),
		'fx-pro-pending-cancel'  => array(
			'role' => $pro,
			'subs' => array(
				array(
					'product' => 'pro',
					'status'  => 'pending-cancel',
					'start'   => $months( -10 ),
					'set'     => array( 'next_payment' => $months( 2 ) ),
					'expect'  => array_merge( $none, array( 'end' => $months( 2 ) ) ),
				),
			),
		),
		'fx-pro-cancel-in-trial' => array(
			'role' => $pro,
			'subs' => array(
				array(
					'product' => 'pro',
					'status'  => 'pending-cancel',
					'start'   => $days( -2 ),
					'set'     => array(
						'trial_end'    => $days( 5 ),
						'next_payment' => $days( 5 ),
					),
					'expect'  => array_merge(
						$none,
						array(
							'end'                        => $days( 5 ),
							'trial_end_pre_cancellation' => $days( 5 ),
						)
					),
				),
			),
		),
		'fx-pro-on-hold-overdue' => array(
			'role' => $pro,
			'subs' => array(
				array(
					'product' => 'pro',
					'status'  => 'on-hold',
					'start'   => $months( -13 ),
					'set'     => array( 'next_payment' => $months( -1 ) ),
					'expect'  => array_merge( $none, array( 'next_payment' => $months( -1 ) ) ),
				),
			),
		),
		'fx-pro-no-subs'         => array(
			'role' => $pro,
			'subs' => array(),
		),
		'fx-pro-dead'            => array(
			'role' => $pro,
			'subs' => array(
				array(
					'product' => 'pro',
					'status'  => 'cancelled',
					'start'   => $months( -2 ),
					'set'     => array(),
					'expect'  => array(),
				),
				array(
					'product' => 'pro',
					'status'  => 'pending',
					'start'   => $days( -1 ),
					'set'     => array(),
					'expect'  => array(),
				),
			),
		),
		'fx-pro-other-product'   => array(
			'role' => $pro,
			'subs' => array(
				array(
					'product' => 'other',
					'status'  => 'active',
					'start'   => $months( -1 ),
					'set'     => array( 'next_payment' => $months( 11 ) ),
					'expect'  => array(),
				),
			),
		),
		'fx-sub-no-role'         => array(
			'role' => 'subscriber',
			'subs' => array(
				array(
					'product' => 'pro',
					'status'  => 'active',
					'start'   => $months( -1 ),
					'set'     => array( 'next_payment' => $months( 11 ) ),
					'expect'  => array_merge( $none, array( 'next_payment' => $months( 11 ) ) ),
				),
			),
		),
	);
}

/**
 * Whether a user, product or subscription carries the seed marker.
 *
 * @param WC_Data|WP_User|false|null $thing The object to test.
 */
function tia_elements_seed_is_ours( $thing ) {
	if ( $thing instanceof WP_User ) {
		return (bool) get_user_meta( $thing->ID, TIA_ELEMENTS_SEED_MARKER, true );
	}
	return $thing instanceof WC_Data && (bool) $thing->get_meta( TIA_ELEMENTS_SEED_MARKER );
}

/**
 * The seed products that exist now, keyed `pro` and `other`. Fails on a foreign post at 19339.
 *
 * @return array<string, WC_Product>
 */
function tia_elements_seed_products() {
	$found = array();
	$pro   = get_post( TIA_ELEMENTS_SEED_PRO_ID );
	if ( $pro ) {
		$product = wc_get_product( $pro );
		if ( ! tia_elements_seed_is_ours( $product ) ) {
			WP_CLI::error( sprintf( 'Post %d exists and is not a seed product. Remove it or pick another site.', TIA_ELEMENTS_SEED_PRO_ID ) );
		}
		$found['pro'] = $product;
	}
	$other = wc_get_product( wc_get_product_id_by_sku( TIA_ELEMENTS_SEED_OTHER_SKU ) );
	if ( $other ) {
		if ( ! tia_elements_seed_is_ours( $other ) ) {
			WP_CLI::error( sprintf( 'SKU %s belongs to a product the seed did not make.', TIA_ELEMENTS_SEED_OTHER_SKU ) );
		}
		$found['other'] = $other;
	}
	return $found;
}

/**
 * Removes every user, subscription and product the previous run made.
 *
 * @param array<string, mixed> $fixtures The fixture table.
 */
function tia_elements_seed_clean( $fixtures ) {
	require_once ABSPATH . 'wp-admin/includes/user.php';

	$products = tia_elements_seed_products();
	$users    = array();
	foreach ( array_keys( $fixtures ) as $login ) {
		$user = get_user_by( 'login', $login );
		if ( $user && ! tia_elements_seed_is_ours( $user ) ) {
			WP_CLI::error( sprintf( 'User %s exists and is not a seed user.', $login ) );
		}
		if ( $user ) {
			$users[] = $user;
		}
	}

	foreach ( $users as $user ) {
		foreach ( wcs_get_users_subscriptions( $user->ID ) as $sub ) {
			if ( tia_elements_seed_is_ours( $sub ) ) {
				// A forced delete leaves the line items behind under HPOS.
				$sub->remove_order_items();
				$sub->save();
				$sub->delete( true );
			}
		}
		wp_delete_user( $user->ID );
	}
	foreach ( $products as $product ) {
		$product->delete( true );
	}
}

/**
 * Removes the pages the previous run made. Fails on a foreign page at one of the seed slugs.
 */
function tia_elements_seed_clean_pages() {
	foreach ( array_keys( TIA_ELEMENTS_SEED_PAGES ) as $slug ) {
		$page = get_page_by_path( $slug );
		if ( $page && ! get_post_meta( $page->ID, TIA_ELEMENTS_SEED_MARKER, true ) ) {
			WP_CLI::error( sprintf( 'Page /%s/ exists and is not a seed page.', $slug ) );
		}
		if ( $page ) {
			wp_delete_post( $page->ID, true );
		}
	}
}

/**
 * Makes one published page per Block, for e2e tests and browser passes.
 */
function tia_elements_seed_pages() {
	foreach ( TIA_ELEMENTS_SEED_PAGES as $slug => $page ) {
		$id = wp_insert_post(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_name'    => $slug,
				'post_title'   => $page['title'],
				'post_content' => $page['content'],
				'meta_input'   => array( TIA_ELEMENTS_SEED_MARKER => '1' ),
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			WP_CLI::error( $id->get_error_message() );
		}
		WP_CLI::log( sprintf( 'Page: %s', get_permalink( $id ) ) );
	}
}

/**
 * Removes the roles the seed added, and the option that lists them.
 */
function tia_elements_seed_remove_roles() {
	foreach ( (array) get_option( TIA_ELEMENTS_SEED_ROLES_OPT, array() ) as $role ) {
		remove_role( $role );
	}
	delete_option( TIA_ELEMENTS_SEED_ROLES_OPT );
}

/**
 * Adds the two paid roles if missing, with the `read` capability they carry on the live site.
 * Records the ones it adds, so `clean` removes only those.
 */
function tia_elements_seed_add_roles() {
	$added = (array) get_option( TIA_ELEMENTS_SEED_ROLES_OPT, array() );
	$roles = array(
		'tia_pro_-_annual'        => 'TIA Pro - Annual',
		'tia_standard_-_annually' => 'TIA Standard - Annually',
	);
	foreach ( $roles as $slug => $name ) {
		if ( ! get_role( $slug ) ) {
			add_role( $slug, $name, array( 'read' => true ) );
			$added[] = $slug;
		}
	}
	if ( $added ) {
		update_option( TIA_ELEMENTS_SEED_ROLES_OPT, array_values( array_unique( $added ) ), false );
	}
}

/**
 * Makes one yearly subscription product.
 *
 * @param string $name  Product name.
 * @param string $price Yearly price in the store currency.
 * @param string $sku   SKU, or empty.
 */
function tia_elements_seed_product( $name, $price, $sku ) {
	$product = new WC_Product_Subscription();
	$product->set_name( $name );
	$product->set_status( 'publish' );
	$product->set_regular_price( $price );
	$product->set_virtual( true );
	$product->set_sku( $sku );
	$product->update_meta_data( '_subscription_price', $price );
	$product->update_meta_data( '_subscription_period', 'year' );
	$product->update_meta_data( '_subscription_period_interval', '1' );
	$product->update_meta_data( '_subscription_length', '0' );
	$product->update_meta_data( '_subscription_trial_length', '0' );
	$product->update_meta_data( '_subscription_sign_up_fee', '0' );
	$product->update_meta_data( TIA_ELEMENTS_SEED_MARKER, '1' );
	$product->save();
	return $product;
}

/**
 * Makes one subscription through the WCS API and walks it to its status, as a real one would.
 *
 * @param int                  $user_id The customer.
 * @param WC_Product           $product The product on the line item.
 * @param array<string, mixed> $spec    One `subs` entry of the fixture table.
 */
function tia_elements_seed_subscription( $user_id, $product, $spec ) {
	$sub = wcs_create_subscription(
		array(
			'customer_id'      => $user_id,
			'start_date'       => $spec['start'],
			'date_created'     => $spec['start'],
			'billing_period'   => 'year',
			'billing_interval' => 1,
		)
	);
	if ( is_wp_error( $sub ) ) {
		WP_CLI::error( $sub->get_error_message() );
	}
	$sub->add_product( $product );
	$sub->update_meta_data( TIA_ELEMENTS_SEED_MARKER, '1' );
	$sub->calculate_totals();

	// WCS recalculates next_payment on activation when it is in the past, so on-hold sets dates last.
	$dates_last = 'on-hold' === $spec['status'];
	if ( $spec['set'] && ! $dates_last ) {
		$sub->update_dates( $spec['set'] );
		$sub->save();
	}
	$path = array(
		'pending'        => array(),
		'active'         => array( 'active' ),
		'pending-cancel' => array( 'active', 'pending-cancel' ),
		'on-hold'        => array( 'active', 'on-hold' ),
		'cancelled'      => array( 'cancelled' ),
	);
	foreach ( $path[ $spec['status'] ] as $status ) {
		$sub->update_status( $status );
	}
	if ( $spec['set'] && $dates_last ) {
		$sub->update_dates( $spec['set'] );
		$sub->save();
	}
}

/**
 * Reads every fixture user back through WCS and compares it with the table.
 *
 * @param array<string, mixed>      $fixtures The fixture table.
 * @param array<string, WC_Product> $products The seed products.
 * @return int Number of mismatches.
 */
function tia_elements_seed_check( $fixtures, $products ) {
	$errors = 0;
	$fmt    = fn( $date ) => $date ? str_replace( ' ', 'T', $date ) . 'Z' : '-';
	foreach ( $fixtures as $login => $fixture ) {
		$user = get_user_by( 'login', $login );
		WCS_Customer_Store::instance()->delete_cache_for_user( $user->ID );
		$subs = array_values( wcs_get_users_subscriptions( $user->ID ) );
		$out  = array();
		$bad  = array();

		if ( array( $fixture['role'] ) !== array_values( $user->roles ) ) {
			$bad[] = 'role';
		}
		$want = array_map( fn( $s ) => $products[ $s['product'] ]->get_id() . ':' . $s['status'], $fixture['subs'] );
		$have = array();
		foreach ( $subs as $sub ) {
			$items  = $sub->get_items();
			$have[] = ( $items ? reset( $items )->get_product_id() : 0 ) . ':' . $sub->get_status();
		}
		sort( $want );
		sort( $have );
		if ( $want !== $have ) {
			$bad[] = 'subscriptions';
		}

		foreach ( $fixture['subs'] as $spec ) {
			$match = array_filter( $subs, fn( $s ) => $s->get_status() === $spec['status'] );
			$sub   = reset( $match );
			$line  = $spec['status'];
			foreach ( array( 'trial_end', 'next_payment', 'end' ) as $type ) {
				$value = $sub && $sub->get_date( $type ) ? $sub->get_date( $type ) : '';
				$line .= ' ' . $type . '=' . $fmt( $value );
				if ( isset( $spec['expect'][ $type ] ) && $spec['expect'][ $type ] !== $value ) {
					$bad[] = $type;
				}
			}
			// WCS stores '0' here when the subscription had no trial.
			$tepc  = $sub && $sub->get_meta( 'trial_end_pre_cancellation' ) ? $sub->get_meta( 'trial_end_pre_cancellation' ) : '';
			$line .= ' trial_end_pre_cancellation=' . $fmt( $tepc );
			if ( isset( $spec['expect']['trial_end_pre_cancellation'] ) && $spec['expect']['trial_end_pre_cancellation'] !== $tepc ) {
				$bad[] = 'trial_end_pre_cancellation';
			}
			$out[] = $line;
		}

		$errors += count( $bad );
		WP_CLI::log(
			sprintf(
				'%s %-22s roles=%s | %s',
				$bad ? 'FAIL(' . implode( ',', $bad ) . ')' : 'ok',
				$login,
				implode( ',', $user->roles ),
				$out ? implode( ' | ', $out ) : 'no subscriptions'
			)
		);
	}
	return $errors;
}

/**
 * Entry point.
 *
 * @param array<int, string> $cli_args Arguments after the file name; `clean` only removes.
 */
function tia_elements_seed_run( $cli_args ) {
	if ( ! function_exists( 'wcs_create_subscription' ) ) {
		WP_CLI::error( 'WooCommerce Subscriptions is not active.' );
	}

	// No mail, no Action Scheduler jobs and no WCS role changes while the seed runs.
	add_filter( 'pre_wp_mail', '__return_false' );
	add_filter( 'woocommerce_subscriptions_update_users_role', '__return_false' );
	foreach ( array( 'single', 'recurring', 'cron' ) as $kind ) {
		add_filter( 'pre_as_schedule_' . $kind . '_action', '__return_zero' );
	}
	add_filter( 'pre_as_enqueue_async_action', '__return_zero' );

	$now      = time();
	$fixtures = tia_elements_seed_fixtures( $now );
	tia_elements_seed_clean( $fixtures );
	tia_elements_seed_clean_pages();
	if ( in_array( 'clean', (array) $cli_args, true ) ) {
		tia_elements_seed_remove_roles();
		WP_CLI::success( 'Seed data removed.' );
		return;
	}

	tia_elements_seed_add_roles();

	add_filter( 'woocommerce_new_product_data', 'tia_elements_seed_force_pro_id' );
	$products = array( 'pro' => tia_elements_seed_product( 'TIA Pro', '2999', '' ) );
	remove_filter( 'woocommerce_new_product_data', 'tia_elements_seed_force_pro_id' );
	if ( TIA_ELEMENTS_SEED_PRO_ID !== $products['pro']->get_id() ) {
		WP_CLI::error( sprintf( 'TIA Pro got ID %d, not %d.', $products['pro']->get_id(), TIA_ELEMENTS_SEED_PRO_ID ) );
	}
	$products['other'] = tia_elements_seed_product( 'Test: other subscription', '99', TIA_ELEMENTS_SEED_OTHER_SKU );

	foreach ( $fixtures as $login => $fixture ) {
		$user_id = wp_insert_user(
			array(
				'user_login' => $login,
				'user_pass'  => 'password',
				'user_email' => $login . '@example.test',
				'role'       => $fixture['role'],
				'meta_input' => array( TIA_ELEMENTS_SEED_MARKER => '1' ),
			)
		);
		if ( is_wp_error( $user_id ) ) {
			WP_CLI::error( $user_id->get_error_message() );
		}
		foreach ( $fixture['subs'] as $spec ) {
			tia_elements_seed_subscription( $user_id, $products[ $spec['product'] ], $spec );
		}
	}

	tia_elements_seed_pages();
	WP_CLI::log( 'Currency: ' . get_woocommerce_currency() . ', TIA Pro price: ' . wp_strip_all_tags( $products['pro']->get_price_html() ) );
	$errors = tia_elements_seed_check( $fixtures, $products );
	if ( $errors ) {
		WP_CLI::error( sprintf( '%d mismatches against the fixture table.', $errors ) );
	}
	WP_CLI::success( sprintf( 'Seeded %d users.', count( $fixtures ) ) );
}

/**
 * Makes WordPress give the TIA Pro product its live ID.
 *
 * @param array<string, mixed> $data Post data for wp_insert_post().
 */
function tia_elements_seed_force_pro_id( $data ) {
	$data['import_id'] = TIA_ELEMENTS_SEED_PRO_ID;
	return $data;
}

tia_elements_seed_run( $args ?? array() );
