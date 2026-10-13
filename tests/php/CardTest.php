<?php
/**
 * The card a Block shows in place of its data.
 *
 * @package tia-wordpress-elements
 */

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../includes/class-tia-elements-card.php';

/**
 * Exercises TIA_Elements_Card through its public interface, without WordPress.
 */
final class CardTest extends TestCase {

	private const PRICE = '<span class="amount">$2,999.00</span> / year';
	private const CTA   = 'https://example.test/product/tia-pro/';
	private const LOGIN = 'https://example.test/wp-login.php?redirect_to=x';

	/**
	 * A logged-out visitor gets the Purchase card with the Log in link.
	 */
	public function test_logged_out_visitor_gets_purchase_with_login(): void {
		$this->assertSame(
			array(
				'case'      => 'purchase',
				'priceHtml' => self::PRICE,
				'ctaUrl'    => self::CTA,
				'loginUrl'  => self::LOGIN,
			),
			TIA_Elements_Card::for_visitor( false, false, self::PRICE, self::CTA, self::LOGIN )
		);
	}

	/**
	 * A logged-in non-admin gets the Purchase card without the Log in link.
	 */
	public function test_logged_in_visitor_gets_purchase_without_login(): void {
		$this->assertSame(
			array(
				'case'      => 'purchase',
				'priceHtml' => self::PRICE,
				'ctaUrl'    => self::CTA,
			),
			TIA_Elements_Card::for_visitor( false, true, self::PRICE, self::CTA, self::LOGIN )
		);
	}

	/**
	 * An admin gets no card, so the Block fetches the data.
	 */
	public function test_admin_gets_no_card(): void {
		$this->assertNull( TIA_Elements_Card::for_visitor( true, true, self::PRICE, self::CTA, self::LOGIN ) );
	}
}
