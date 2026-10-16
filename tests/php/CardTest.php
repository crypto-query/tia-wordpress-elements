<?php
/**
 * The card a Block shows in place of its data.
 *
 * @package tia-wordpress-elements
 */

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../includes/class-tia-elements-access.php';
require_once __DIR__ . '/../../includes/class-tia-elements-access-resolver.php';
require_once __DIR__ . '/../../includes/class-tia-elements-card.php';

/**
 * Exercises TIA_Elements_Card through its public interface, without WordPress.
 */
final class CardTest extends TestCase {

	private const PRICE  = '<span class="amount">$2,999.00</span> / year';
	private const CTA    = 'https://example.test/product/tia-pro/';
	private const LOGIN  = 'https://example.test/wp-login.php?redirect_to=x';
	private const MEMBER = array( 'tia_pro_-_annual' );

	/**
	 * The card for a set of facts.
	 *
	 * @param TIA_Elements_Access $access    The user's access.
	 * @param bool                $logged_in Whether the user is logged in.
	 * @param array<string>       $roles     The user's roles.
	 * @return array<string, string>|null
	 */
	private static function card( TIA_Elements_Access $access, bool $logged_in, array $roles ): ?array {
		return TIA_Elements_Card::for_access( $access, $logged_in, $roles, self::MEMBER, self::PRICE, self::CTA, self::LOGIN );
	}

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
			self::card( TIA_Elements_Access::denied(), false, array() )
		);
	}

	/**
	 * Denied logged-in users get Purchase or Upgrade without the Log in link.
	 *
	 * @param array<string> $roles The user's roles.
	 * @param string        $want  The card case.
	 */
	#[DataProvider( 'denied_users' )]
	public function test_denied_user_card( array $roles, string $want ): void {
		$this->assertSame(
			array(
				'case'      => $want,
				'priceHtml' => self::PRICE,
				'ctaUrl'    => self::CTA,
			),
			self::card( TIA_Elements_Access::denied(), true, $roles )
		);
	}

	/**
	 * Roles of a denied user and the card they get.
	 *
	 * @return array<string, array{list<string>, string}>
	 */
	public static function denied_users(): array {
		return array(
			'no paid role'                            => array( array( 'subscriber' ), 'purchase' ),
			'no role at all'                          => array( array(), 'purchase' ),
			'TIA Premium'                             => array( array( 'tia_premium_-_annually' ), 'upgrade' ),
			'TIA Standard'                            => array( array( 'subscriber', 'tia_standard_-_annually' ), 'upgrade' ),
			'active membership'                       => array( array( 'active_membership' ), 'upgrade' ),
			'a role that only starts like one'        => array( array( 'active_membership_old' ), 'purchase' ),
			'member role, only dead subscriptions'    => array( self::MEMBER, 'purchase' ),
			'member and premium role, only dead subs' => array( array( 'tia_pro_-_annual', 'tia_premium_-_annually' ), 'purchase' ),
		);
	}

	/**
	 * Full access shows the data: no card, for a Member and for an admin.
	 */
	public function test_full_access_gets_no_card(): void {
		$this->assertNull( self::card( TIA_Elements_Access::full( 'tia-pro', 1, 2 ), true, self::MEMBER ) );
		$this->assertNull( self::card( TIA_Elements_Access::full(), true, array( 'administrator' ) ) );
	}

	/**
	 * A Trial gets the Trial card with its source and no CTA.
	 */
	public function test_trial_gets_trial_card(): void {
		$this->assertSame(
			array(
				'case'   => 'trial',
				'source' => 'tia-pro',
			),
			self::card( TIA_Elements_Access::trial( 'tia-pro', 2_000_000_000 ), true, self::MEMBER )
		);
	}

	/**
	 * A TIA Indicator Suite Trial gets the Trial card with its own source.
	 */
	public function test_suite_trial_gets_trial_card(): void {
		$this->assertSame(
			array(
				'case'   => 'trial',
				'source' => 'indicator-suite',
			),
			self::card( TIA_Elements_Access::trial( 'indicator-suite', 2_000_000_000 ), true, array( 'subscriber' ) )
		);
	}

	/**
	 * A Block that shows data in a Trial gives a Trial no card; other cases stay.
	 */
	public function test_trial_sees_data_where_the_block_allows_it(): void {
		$card = static fn( TIA_Elements_Access $access, bool $logged_in, array $roles ) => TIA_Elements_Card::for_access( $access, $logged_in, $roles, self::MEMBER, self::PRICE, self::CTA, self::LOGIN, false );

		$this->assertNull( $card( TIA_Elements_Access::trial( 'tia-pro', 2_000_000_000 ), true, self::MEMBER ) );
		$this->assertNull( $card( TIA_Elements_Access::trial( 'indicator-suite', 2_000_000_000 ), true, array( 'subscriber' ) ) );
		$this->assertNull( $card( TIA_Elements_Access::full( 'tia-pro', 1, 2 ), true, self::MEMBER ) );
		$this->assertSame( array( 'case' => 'unavailable' ), $card( TIA_Elements_Access::unavailable(), true, self::MEMBER ) );
		$this->assertSame( 'purchase', $card( TIA_Elements_Access::denied(), false, array() )['case'] ?? null );
	}

	/**
	 * A failed source gets the Unavailable card, with no price and no CTA.
	 */
	public function test_unavailable_gets_unavailable_card(): void {
		$this->assertSame( array( 'case' => 'unavailable' ), self::card( TIA_Elements_Access::unavailable(), true, self::MEMBER ) );
	}
}
