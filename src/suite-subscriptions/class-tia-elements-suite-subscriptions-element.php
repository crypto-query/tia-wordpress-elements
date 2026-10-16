<?php
/**
 * Shows the user's TIA Indicator Suite subscriptions under the WooCommerce Subscriptions table.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * The Suite Subscriptions Element. Switch it off with
 * `remove_action( 'woocommerce_account_subscriptions_endpoint', array( 'TIA_Elements_Suite_Subscriptions_Element', 'render' ), 20 )`.
 */
final class TIA_Elements_Suite_Subscriptions_Element {

	/**
	 * Hooks the table in after the WooCommerce Subscriptions table, which renders at priority 10.
	 */
	public static function register(): void {
		add_action( 'woocommerce_account_subscriptions_endpoint', array( self::class, 'render' ), 20 );
	}

	/**
	 * Prints the table, or nothing without a row to show.
	 */
	public static function render(): void {
		$user = wp_get_current_user();
		$rows = TIA_Elements_Suite_Subscription_Rows::from_lookup(
			TIA_Elements_Stripe_Entitlement_Source::lookup( $user->ID, $user->user_email ),
			static fn( int $time ): string => wc_format_datetime( wc_string_to_datetime( gmdate( 'Y-m-d\TH:i:s\Z', $time ) ) ),
			static fn( float $amount, string $currency ): string => wc_price( $amount, array( 'currency' => $currency ) )
		);
		if ( $rows ) {
			require __DIR__ . '/template.php';
		}
	}
}
