<?php
/**
 * Which card a Block shows in place of its data.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * Picks the card from the user's access and roles. Pure, so it runs without WordPress.
 */
final class TIA_Elements_Card {

	/**
	 * TIA Pro, the product every Purchase and Upgrade card sells.
	 */
	public const PRODUCT_ID = 19339;

	/**
	 * Paid roles that do not include the indicators, matched by prefix; their holders get the Upgrade card.
	 */
	private const OTHER_PAID_ROLE_PREFIXES = array( 'tia_premium_', 'tia_standard_' );

	private const OTHER_PAID_ROLES = array( 'active_membership' );

	/**
	 * The card for a user, or null when the user sees the data.
	 *
	 * @param TIA_Elements_Access $access       The user's access.
	 * @param bool                $logged_in    Whether the user is logged in.
	 * @param array<string>       $roles        The user's roles.
	 * @param array<string>       $member_roles Roles that make a user a member.
	 * @param string              $price_html   TIA Pro's price HTML.
	 * @param string              $cta_url      TIA Pro's product page.
	 * @param string              $login_url    The login page, back to the current page.
	 * @param bool                $trial_card   Whether a Trial gets the Trial card; false where a Trial sees the data.
	 * @return array<string, string>|null
	 */
	public static function for_access( TIA_Elements_Access $access, bool $logged_in, array $roles, array $member_roles, string $price_html, string $cta_url, string $login_url, bool $trial_card = true ): ?array {
		if ( 'unavailable' === $access->state ) {
			return array( 'case' => 'unavailable' );
		}
		if ( 'granted' === $access->state ) {
			return 'trial' === $access->level && $trial_card ? array(
				'case'   => 'trial',
				'source' => (string) $access->source,
			) : null;
		}

		$upgrade = $logged_in && ! TIA_Elements_Access_Resolver::has_member_role( $roles, $member_roles ) && self::has_other_paid_role( $roles );
		$card    = array(
			'case'      => $upgrade ? 'upgrade' : 'purchase',
			'priceHtml' => $price_html,
			'ctaUrl'    => $cta_url,
		);
		if ( ! $logged_in ) {
			$card['loginUrl'] = $login_url;
		}
		return $card;
	}

	/**
	 * Whether the user holds a paid role that does not include the indicators.
	 *
	 * @param array<string> $roles The user's roles.
	 */
	private static function has_other_paid_role( array $roles ): bool {
		foreach ( $roles as $role ) {
			if ( in_array( $role, self::OTHER_PAID_ROLES, true ) ) {
				return true;
			}
			foreach ( self::OTHER_PAID_ROLE_PREFIXES as $prefix ) {
				if ( str_starts_with( $role, $prefix ) ) {
					return true;
				}
			}
		}
		return false;
	}
}
