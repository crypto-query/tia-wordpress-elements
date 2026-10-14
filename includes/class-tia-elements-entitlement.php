<?php
/**
 * The entitlement service: one access value per user and request.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * Decides the current user's access, fail closed, and memoizes it for the request.
 *
 * @phpstan-import-type Record from TIA_Elements_Access_Resolver
 */
final class TIA_Elements_Entitlement {

	/**
	 * Access per user ID for this request.
	 *
	 * @var array<int, TIA_Elements_Access>
	 */
	private static array $memo = array();

	/**
	 * The current user's access.
	 */
	public static function current(): TIA_Elements_Access {
		$user_id = get_current_user_id();
		if ( ! isset( self::$memo[ $user_id ] ) ) {
			self::$memo[ $user_id ] = self::decide(
				$user_id > 0,
				current_user_can( 'manage_options' ),
				wp_get_current_user()->roles,
				TIA_Elements_Settings::from_wordpress()->member_roles(),
				static fn( bool $fresh ) => TIA_Elements_WCS_Reader::read( $user_id, $fresh ),
				time()
			);
		}
		return self::$memo[ $user_id ];
	}

	/**
	 * Runs the checks in order: admin, member role, then the member subscriptions.
	 *
	 * @param bool                                $logged_in    Whether the user is logged in.
	 * @param bool                                $is_admin     Whether the user has `manage_options`.
	 * @param array<string>                       $roles        The user's roles.
	 * @param array<string>                       $member_roles Roles that make a user a member.
	 * @param callable(bool): (list<Record>|null) $read         Reads the member subscriptions, null on failure; true clears the cache first.
	 * @param int                                 $now          UTC epoch.
	 */
	public static function decide( bool $logged_in, bool $is_admin, array $roles, array $member_roles, callable $read, int $now ): TIA_Elements_Access {
		if ( ! $logged_in ) {
			return TIA_Elements_Access::denied();
		}
		if ( $is_admin ) {
			return TIA_Elements_Access::full();
		}
		if ( ! TIA_Elements_Access_Resolver::has_member_role( $roles, $member_roles ) ) {
			return TIA_Elements_Access::denied();
		}
		$records = $read( false );
		if ( null === $records ) {
			return TIA_Elements_Access::unavailable();
		}
		$access = TIA_Elements_Access_Resolver::woocommerce( $records, $now );
		if ( 'denied' !== $access->state ) {
			return $access;
		}
		// The subscription ID cache can miss a new subscription, so read once more before a deny.
		$records = $read( true );
		return null === $records ? TIA_Elements_Access::unavailable() : TIA_Elements_Access_Resolver::woocommerce( $records, $now );
	}
}
