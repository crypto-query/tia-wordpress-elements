<?php
/**
 * Reads a user's member subscriptions from WooCommerce Subscriptions.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * The WCS adapter: turns each member subscription into a record. WC CRUD only, so it is HPOS-safe.
 *
 * @phpstan-import-type Record from TIA_Elements_Access_Resolver
 */
final class TIA_Elements_WCS_Reader {

	/**
	 * The user's member subscriptions, or null when WCS is missing or the read failed.
	 *
	 * @param int  $user_id The user.
	 * @param bool $fresh   Clear WCS's subscription ID cache for the user first.
	 * @return list<Record>|null
	 */
	public static function read( int $user_id, bool $fresh ): ?array {
		if ( ! function_exists( 'wcs_get_users_subscriptions' ) || ! class_exists( 'WCS_Customer_Store' ) ) {
			return null;
		}
		/**
		 * Filters the products that make a subscription a member subscription.
		 *
		 * @param list<array{id: int, field: 'product_id'|'variation_id'}> $products Each product with the line-item field it matches.
		 */
		$products = TIA_Elements_Access_Resolver::member_products( apply_filters( 'tia_member_products', TIA_Elements_Access_Resolver::MEMBER_PRODUCTS ) );

		// wcs_get_users_subscriptions() never returns an error; a failure surfaces only as a throw.
		try {
			if ( $fresh ) {
				$store = WCS_Customer_Store::instance();
				if ( $store instanceof WCS_Customer_Store_Cached_CPT ) {
					$store->delete_cache_for_user( $user_id );
				}
			}
			$records = array();
			foreach ( wcs_get_users_subscriptions( $user_id ) as $subscription ) {
				if ( ! $subscription instanceof WC_Subscription ) {
					continue;
				}
				$items = array();
				foreach ( $subscription->get_items() as $item ) {
					if ( $item instanceof WC_Order_Item_Product ) {
						$items[] = array(
							'product_id'   => $item->get_product_id(),
							'variation_id' => $item->get_variation_id(),
						);
					}
				}
				if ( ! TIA_Elements_Access_Resolver::is_member_subscription( $items, $products ) ) {
					continue;
				}
				$next_payment = $subscription->get_time( 'next_payment', 'gmt' );
				$records[]    = array(
					'status'                     => $subscription->get_status(),
					'created'                    => $subscription->get_time( 'start', 'gmt' ),
					'trial_end'                  => $subscription->get_time( 'trial_end', 'gmt' ),
					'period_end'                 => $next_payment ? $next_payment : $subscription->get_time( 'end', 'gmt' ),
					'trial_end_pre_cancellation' => (string) $subscription->get_meta( 'trial_end_pre_cancellation' ),
				);
			}
			return $records;
		} catch ( Throwable $error ) {
			error_log( 'TIA Elements: WooCommerce Subscriptions read failed: ' . $error->getMessage() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- The page shows only the Unavailable card; the cause belongs in the server log.
			return null;
		}
	}
}
