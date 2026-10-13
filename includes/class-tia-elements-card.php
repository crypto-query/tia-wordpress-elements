<?php
/**
 * Which card a Block shows in place of its data.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * Picks the card from facts about the visitor. Pure, so it runs without WordPress.
 */
final class TIA_Elements_Card {

	/**
	 * TIA Pro, the product every Purchase and Upgrade card sells.
	 */
	public const PRODUCT_ID = 19339;

	/**
	 * The card for a visitor, or null for an admin, who sees the data.
	 *
	 * @param bool   $is_admin   Whether the visitor has `manage_options`.
	 * @param bool   $logged_in  Whether the visitor is logged in.
	 * @param string $price_html TIA Pro's price HTML.
	 * @param string $cta_url    TIA Pro's product page.
	 * @param string $login_url  The login page, back to the current page.
	 * @return array{case: 'purchase', priceHtml: string, ctaUrl: string, loginUrl?: string}|null
	 */
	public static function for_visitor( bool $is_admin, bool $logged_in, string $price_html, string $cta_url, string $login_url ): ?array {
		if ( $is_admin ) {
			return null;
		}
		$card = array(
			'case'      => 'purchase',
			'priceHtml' => $price_html,
			'ctaUrl'    => $cta_url,
		);
		if ( ! $logged_in ) {
			$card['loginUrl'] = $login_url;
		}
		return $card;
	}
}
