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
 * @phpstan-import-type Lookup from TIA_Elements_Stripe_Entitlement_Source
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
				static fn() => TIA_Elements_Stripe_Entitlement_Source::lookup( $user_id, wp_get_current_user()->user_email ),
				time()
			);
		}
		return self::$memo[ $user_id ];
	}

	/**
	 * Runs the checks in order: admin, the WooCommerce gate, then Stripe when WooCommerce does not grant.
	 *
	 * @param bool                                $logged_in    Whether the user is logged in.
	 * @param bool                                $is_admin     Whether the user has `manage_options`.
	 * @param array<string>                       $roles        The user's roles.
	 * @param array<string>                       $member_roles Roles that make a user a member.
	 * @param callable(bool): (list<Record>|null) $read         Reads the member subscriptions, null on failure; true clears the cache first.
	 * @param callable(): Lookup                  $stripe       Looks up the user's TIA Indicator Suite subscriptions.
	 * @param int                                 $now          UTC epoch.
	 */
	public static function decide( bool $logged_in, bool $is_admin, array $roles, array $member_roles, callable $read, callable $stripe, int $now ): TIA_Elements_Access {
		if ( ! $logged_in ) {
			return TIA_Elements_Access::denied();
		}
		if ( $is_admin ) {
			return TIA_Elements_Access::full();
		}
		$woocommerce = self::woocommerce( $roles, $member_roles, $read, $now );
		if ( 'granted' === $woocommerce->state ) {
			return $woocommerce;
		}
		$lookup = $stripe();
		if ( 'found' === $lookup['state'] ) {
			$access = TIA_Elements_Access_Resolver::stripe( $lookup['subscriptions'] );
			if ( 'granted' === $access->state ) {
				return $access;
			}
		}
		return 'unavailable' === $woocommerce->state || 'unavailable' === $lookup['state'] ? TIA_Elements_Access::unavailable() : TIA_Elements_Access::denied();
	}

	/**
	 * The WooCommerce gate: the member role, then the member subscriptions.
	 *
	 * @param array<string>                       $roles        The user's roles.
	 * @param array<string>                       $member_roles Roles that make a user a member.
	 * @param callable(bool): (list<Record>|null) $read         Reads the member subscriptions, null on failure; true clears the cache first.
	 * @param int                                 $now          UTC epoch.
	 */
	private static function woocommerce( array $roles, array $member_roles, callable $read, int $now ): TIA_Elements_Access {
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
