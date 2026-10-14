<?php
/**
 * The `wcs-unavailable` switch of the test mu-plugin, tia-elements-test.php. Dev site only.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * The WCS customer store with every subscription read failing. It keeps the parent's hooks.
 */
class TIA_Elements_Test_Throwing_Customer_Store extends WCS_Customer_Store_Cached_CPT {
	/**
	 * Fails the read, as an unreachable database would.
	 *
	 * @param int $user_id The user.
	 * @throws RuntimeException Always.
	 */
	public function get_users_subscription_ids( $user_id ) {
		throw new RuntimeException( 'tia-elements-test: wcs-unavailable' );
	}
}
