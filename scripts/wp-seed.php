<?php
/**
 * Entitlement test data for the LOCAL WordPress only. Never run it on a live site.
 *
 * Run through `bun run wp:seed` (add `clean` to only remove the data). Each run removes
 * what the previous run made: users, subscriptions, products and pages that carry the seed marker,
 * then makes them again with dates relative to now (UTC), and checks the result. It also links
 * the test mu-plugin, tests/mu-plugins/tia-elements-test.php, into wp-content/mu-plugins/.
 *
 * @package tia-wordpress-elements
 */

defined( 'WP_CLI' ) || exit;

const TIA_ELEMENTS_SEED_MARKER    = '_tia_elements_seed';
const TIA_ELEMENTS_SEED_ROLES_OPT = 'tia_elements_seed_roles';
const TIA_ELEMENTS_SEED_OTHER_SKU = 'tia-seed-other-subscription';
const TIA_ELEMENTS_SEED_MU_FILE   = 'tia-elements-test.php';
// The live IDs. Variations come before their parent, so `clean` deletes in this order.
const TIA_ELEMENTS_SEED_IDS   = array(
	'pro'        => 19339,
	'premium'    => 247,
	'elite'      => 19195,
	'membership' => 244,
);
const TIA_ELEMENTS_SEED_PAGES = array(
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
		'fx-elite'               => array(
			'role' => $pro,
			'subs' => array(
				array(
					'product' => 'elite',
					'status'  => 'active',
					'start'   => $months( -6 ),
					'set'     => array( 'next_payment' => $months( 30 ) ),
					'expect'  => array_merge( $none, array( 'next_payment' => $months( 30 ) ) ),
				),
			),
		),
		'fx-premium'             => array(
			'role' => 'tia_premium_-_annually',
			'subs' => array(
				array(
					'product' => 'premium',
					'status'  => 'active',
					'start'   => $months( -2 ),
					'set'     => array( 'next_payment' => $months( 10 ) ),
					'expect'  => array_merge( $none, array( 'next_payment' => $months( 10 ) ) ),
				),
			),
		),
		'fx-stale-pro-role'      => array(
			'role' => $pro,
			'subs' => array(
				array(
					'product' => 'pro',
					'status'  => 'cancelled',
					'start'   => $months( -14 ),
					'set'     => array(),
					'expect'  => array(),
				),
				array(
					'product' => 'premium',
					'status'  => 'active',
					'start'   => $months( -1 ),
					'set'     => array( 'next_payment' => $months( 11 ) ),
					'expect'  => array_merge( $none, array( 'next_payment' => $months( 11 ) ) ),
				),
			),
		),
		'fx-active-membership'   => array(
			'role' => 'active_membership',
			'subs' => array(),
		),
		'fx-two-member-subs'     => array(
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
				array(
					'product' => 'elite',
					'status'  => 'active',
					'start'   => $months( -3 ),
					'set'     => array( 'next_payment' => $months( 33 ) ),
					'expect'  => array_merge( $none, array( 'next_payment' => $months( 33 ) ) ),
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
 * The seed products that exist now, keyed as TIA_ELEMENTS_SEED_IDS plus `other`.
 * Fails on a foreign post at one of the live IDs.
 *
 * @return array<string, WC_Product>
 */
function tia_elements_seed_products() {
	$found = array();
	foreach ( TIA_ELEMENTS_SEED_IDS as $key => $id ) {
		if ( ! get_post( $id ) ) {
			continue;
		}
		$product = wc_get_product( $id );
		if ( ! tia_elements_seed_is_ours( $product ) ) {
			WP_CLI::error( sprintf( 'Post %d exists and is not a seed product. Remove it or pick another site.', $id ) );
		}
		$found[ $key ] = $product;
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
 * Adds the paid roles if missing, with the `read` capability they carry on the live site.
 * Records the ones it adds, so `clean` removes only those.
 */
function tia_elements_seed_add_roles() {
	$added = (array) get_option( TIA_ELEMENTS_SEED_ROLES_OPT, array() );
	$roles = array(
		'tia_pro_-_annual'        => 'TIA Pro - Annual',
		'tia_standard_-_annually' => 'TIA Standard - Annually',
		'tia_premium_-_annually'  => 'TIA Premium - Annually',
		'active_membership'       => 'Active Membership',
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
 * Saves a subscription product or variation that renews every `$years` years.
 *
 * @param WC_Product $product  A new WC_Product_Subscription or WC_Product_Subscription_Variation.
 * @param string     $name     Product name.
 * @param string     $price    Price per period in the store currency.
 * @param int        $years    Years per period.
 */
function tia_elements_seed_product( $product, $name, $price, $years ) {
	$product->set_name( $name );
	$product->set_status( 'publish' );
	$product->set_regular_price( $price );
	$product->set_virtual( true );
	$product->update_meta_data( '_subscription_price', $price );
	$product->update_meta_data( '_subscription_period', 'year' );
	$product->update_meta_data( '_subscription_period_interval', (string) $years );
	$product->update_meta_data( '_subscription_length', '0' );
	$product->update_meta_data( '_subscription_trial_length', '0' );
	$product->update_meta_data( '_subscription_sign_up_fee', '0' );
	$product->update_meta_data( TIA_ELEMENTS_SEED_MARKER, '1' );
	$product->save();
	return $product;
}

/**
 * Makes the variable subscription with its TIA Premium and TIA Elite variations, at their live IDs.
 *
 * @return array<string, WC_Product>
 */
function tia_elements_seed_membership() {
	$plan = new WC_Product_Attribute();
	$plan->set_name( 'Plan' );
	$plan->set_options( array( 'TIA Premium', 'TIA Elite' ) );
	$plan->set_visible( true );
	$plan->set_variation( true );

	$parent = tia_elements_seed_with_id(
		'membership',
		function () use ( $plan ) {
			$parent = new WC_Product_Variable_Subscription();
			$parent->set_name( 'TIA Membership - Annual' );
			$parent->set_status( 'publish' );
			$parent->set_virtual( true );
			$parent->set_attributes( array( $plan ) );
			$parent->update_meta_data( TIA_ELEMENTS_SEED_MARKER, '1' );
			$parent->save();
			return $parent;
		}
	);

	$variations = array(
		'premium' => array( 'TIA Premium', '1497', 1 ),
		'elite'   => array( 'TIA Elite', '6999', 3 ),
	);
	$made       = array( 'membership' => $parent );
	foreach ( $variations as $key => list( $label, $price, $years ) ) {
		$made[ $key ] = tia_elements_seed_with_id(
			$key,
			function () use ( $parent, $label, $price, $years ) {
				$variation = new WC_Product_Subscription_Variation();
				$variation->set_parent_id( $parent->get_id() );
				$variation->set_attributes( array( 'plan' => $label ) );
				return tia_elements_seed_product( $variation, 'TIA Membership - Annual - ' . $label, $price, $years );
			}
		);
	}
	WC_Product_Variable::sync( $parent->get_id() );
	return $made;
}

/**
 * Runs `$make` with the next new product or variation forced to its live ID. Fails if it gets another.
 *
 * @param string                 $key  A key of TIA_ELEMENTS_SEED_IDS.
 * @param callable(): WC_Product $make Makes and saves the product.
 */
function tia_elements_seed_with_id( $key, $make ) {
	$id    = TIA_ELEMENTS_SEED_IDS[ $key ];
	$force = function ( $data ) use ( $id ) {
		$data['import_id'] = $id;
		return $data;
	};
	add_filter( 'woocommerce_new_product_data', $force );
	add_filter( 'woocommerce_new_product_variation_data', $force );
	$product = $make();
	remove_filter( 'woocommerce_new_product_data', $force );
	remove_filter( 'woocommerce_new_product_variation_data', $force );
	if ( $id !== $product->get_id() ) {
		WP_CLI::error( sprintf( 'Product %s got ID %d, not %d.', $key, $product->get_id(), $id ) );
	}
	return $product;
}

/**
 * Removes the test mu-plugin link. Fails if a real file sits at its path.
 */
function tia_elements_seed_unlink_mu_plugin() {
	$link = WPMU_PLUGIN_DIR . '/' . TIA_ELEMENTS_SEED_MU_FILE;
	if ( is_link( $link ) ) {
		wp_delete_file( $link );
	} elseif ( file_exists( $link ) ) {
		WP_CLI::error( sprintf( '%s exists and is not the seed link.', $link ) );
	}
}

/**
 * Links the test mu-plugin of the active copy of this plugin (main checkout or a worktree)
 * into wp-content/mu-plugins/, relative, so `bun run wp:use` can re-point it.
 */
function tia_elements_seed_link_mu_plugin() {
	$slug = '';
	foreach ( (array) get_option( 'active_plugins', array() ) as $plugin ) {
		if ( preg_match( '#^(tia-wordpress-elements(?:--[^/]+)?)/tia-wordpress-elements\.php$#', $plugin, $m ) ) {
			$slug = $m[1];
		}
	}
	if ( ! $slug ) {
		WP_CLI::error( 'No copy of tia-wordpress-elements is active. Run `bun run wp:use` first.' );
	}
	$link   = WPMU_PLUGIN_DIR . '/' . TIA_ELEMENTS_SEED_MU_FILE;
	$target = '../plugins/' . $slug . '/tests/mu-plugins/' . TIA_ELEMENTS_SEED_MU_FILE;
	if ( ! wp_mkdir_p( WPMU_PLUGIN_DIR ) || ! symlink( $target, $link ) ) {
		WP_CLI::error( sprintf( 'Could not link %s.', $link ) );
	}
	WP_CLI::log( sprintf( 'Mu-plugin: %s -> %s', $link, $target ) );
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
			'billing_period'   => WC_Subscriptions_Product::get_period( $product ),
			'billing_interval' => (int) WC_Subscriptions_Product::get_interval( $product ),
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
	$errors   = 0;
	$fmt      = fn( $date ) => $date ? str_replace( ' ', 'T', $date ) . 'Z' : '-';
	$spec_key = fn( $spec ) => $products[ $spec['product'] ]->get_id() . ':' . $spec['status'];
	// A variation subscription matches on its variation ID.
	$sub_key = function ( $sub ) {
		$items = $sub->get_items();
		$item  = $items ? reset( $items ) : null;
		$id    = 0;
		if ( $item ) {
			$id = $item->get_variation_id() ? $item->get_variation_id() : $item->get_product_id();
		}
		return $id . ':' . $sub->get_status();
	};
	foreach ( $fixtures as $login => $fixture ) {
		$user = get_user_by( 'login', $login );
		WCS_Customer_Store::instance()->delete_cache_for_user( $user->ID );
		$subs = array_values( wcs_get_users_subscriptions( $user->ID ) );
		$out  = array();
		$bad  = array();

		if ( array( $fixture['role'] ) !== array_values( $user->roles ) ) {
			$bad[] = 'role';
		}
		$want = array_map( $spec_key, $fixture['subs'] );
		$have = array_map( $sub_key, $subs );
		sort( $want );
		sort( $have );
		if ( $want !== $have ) {
			$bad[] = 'subscriptions';
		}

		foreach ( $fixture['subs'] as $spec ) {
			$match = array_filter( $subs, fn( $s ) => $sub_key( $s ) === $spec_key( $spec ) );
			$sub   = reset( $match );
			$line  = $spec_key( $spec );
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
	tia_elements_seed_unlink_mu_plugin();
	if ( in_array( 'clean', (array) $cli_args, true ) ) {
		tia_elements_seed_remove_roles();
		WP_CLI::success( 'Seed data removed.' );
		return;
	}

	tia_elements_seed_add_roles();

	$products = array(
		'pro' => tia_elements_seed_with_id(
			'pro',
			fn() => tia_elements_seed_product( new WC_Product_Subscription(), 'TIA Pro', '2999', 1 )
		),
	);
	$products = array_merge( $products, tia_elements_seed_membership() );
	$other    = new WC_Product_Subscription();
	$other->set_sku( TIA_ELEMENTS_SEED_OTHER_SKU );
	$products['other'] = tia_elements_seed_product( $other, 'Test: other subscription', '99', 1 );

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
	tia_elements_seed_link_mu_plugin();
	WP_CLI::log( 'Currency: ' . get_woocommerce_currency() . ', TIA Pro price: ' . wp_strip_all_tags( $products['pro']->get_price_html() ) );
	$errors = tia_elements_seed_check( $fixtures, $products );
	if ( $errors ) {
		WP_CLI::error( sprintf( '%d mismatches against the fixture table.', $errors ) );
	}
	WP_CLI::success( sprintf( 'Seeded %d users.', count( $fixtures ) ) );
}

tia_elements_seed_run( $args ?? array() );
