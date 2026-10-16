<?php
/**
 * The order of the entitlement checks and what each one reads.
 *
 * @package tia-wordpress-elements
 */

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../includes/class-tia-elements-access.php';
require_once __DIR__ . '/../../includes/class-tia-elements-access-resolver.php';
require_once __DIR__ . '/../../includes/class-tia-elements-entitlement.php';

/**
 * Exercises TIA_Elements_Entitlement::decide() with a recording subscription reader.
 */
final class EntitlementTest extends TestCase {

	private const NOW    = 1_800_000_000;
	private const MEMBER = array( 'tia_pro_-_annual' );

	/**
	 * Each read the service asked for: false for a plain read, true after clearing the cache.
	 *
	 * @var list<bool>
	 */
	private array $reads = array();

	/**
	 * How often the service asked Stripe.
	 *
	 * @var int
	 */
	private int $stripe_calls = 0;

	/**
	 * A reader that answers each read with the next result and records the call.
	 *
	 * @param array<int, list<array<string, mixed>>|null> $results One result per read; null = the read failed.
	 * @return callable(bool): mixed
	 */
	private function reader( array $results ): callable {
		return function ( bool $fresh ) use ( &$results ) {
			$this->reads[] = $fresh;
			return array_shift( $results );
		};
	}

	/**
	 * A Stripe lookup that answers with a fixed result and counts the calls.
	 *
	 * @param array<string, mixed> $result The lookup result.
	 * @return callable(): mixed
	 */
	private function stripe( array $result = array( 'state' => 'none' ) ): callable {
		return function () use ( $result ) {
			++$this->stripe_calls;
			return $result;
		};
	}

	/**
	 * A Stripe lookup that found suite subscriptions with these statuses.
	 *
	 * @param string ...$statuses Stripe statuses.
	 * @return callable(): mixed
	 */
	private function stripe_found( string ...$statuses ): callable {
		$subscriptions = array();
		foreach ( $statuses as $status ) {
			$subscriptions[] = array(
				'status'               => $status,
				'created'              => self::NOW - 1000,
				'trial_end'            => 0,
				'current_period_end'   => self::NOW + 2000,
				'cancel_at_period_end' => false,
				'amount'               => 29900,
				'currency'             => 'usd',
				'interval'             => 'year',
			);
		}
		return $this->stripe(
			array(
				'state'         => 'found',
				'subscriptions' => $subscriptions,
			)
		);
	}

	/**
	 * One member subscription record.
	 *
	 * @param string $status WCS status.
	 * @return array<string, mixed>
	 */
	private static function sub( string $status ): array {
		return array(
			'status'                     => $status,
			'created'                    => self::NOW - 1000,
			'trial_end'                  => 0,
			'period_end'                 => self::NOW + 1000,
			'trial_end_pre_cancellation' => '0',
		);
	}

	/**
	 * Runs the checks for a logged-in user.
	 *
	 * @param bool          $is_admin Whether the user has `manage_options`.
	 * @param array<string> $roles   The user's roles.
	 * @param callable      $read     The subscription reader.
	 * @param callable|null $stripe   The Stripe lookup; null answers none.
	 */
	private function decide( bool $is_admin, array $roles, callable $read, ?callable $stripe = null ): TIA_Elements_Access {
		return TIA_Elements_Entitlement::decide( true, $is_admin, $roles, self::MEMBER, $read, $stripe ?? $this->stripe(), self::NOW );
	}

	/**
	 * A logged-out visitor is denied without a read.
	 */
	public function test_logged_out_is_denied_without_a_read(): void {
		$access = TIA_Elements_Entitlement::decide( false, false, array(), self::MEMBER, $this->reader( array() ), $this->stripe(), self::NOW );

		$this->assertEquals( TIA_Elements_Access::denied(), $access );
		$this->assertSame( array(), $this->reads );
		$this->assertSame( 0, $this->stripe_calls );
	}

	/**
	 * An admin gets full access with no cut-off, no WCS read and no Stripe call.
	 */
	public function test_admin_gets_full_access_without_a_read(): void {
		$this->assertEquals( TIA_Elements_Access::full(), $this->decide( true, array( 'administrator' ), $this->reader( array() ), $this->stripe_found( 'active' ) ) );
		$this->assertSame( array(), $this->reads );
		$this->assertSame( 0, $this->stripe_calls );
	}

	/**
	 * Without a member role there is no WCS read, even with a live member subscription; Stripe is asked.
	 */
	public function test_no_member_role_is_denied_without_a_read(): void {
		$read = $this->reader( array( array( self::sub( 'active' ) ) ) );

		$this->assertEquals( TIA_Elements_Access::denied(), $this->decide( false, array( 'tia_premium_-_annually' ), $read ) );
		$this->assertSame( array(), $this->reads );
		$this->assertSame( 1, $this->stripe_calls );
	}

	/**
	 * Without a member role, a granting suite subscription grants.
	 */
	public function test_no_member_role_with_suite_subscription_is_granted(): void {
		$access = $this->decide( false, array( 'subscriber' ), $this->reader( array() ), $this->stripe_found( 'active' ) );

		$this->assertEquals( TIA_Elements_Access::full( 'indicator-suite', self::NOW - 1000, self::NOW + 2000 ), $access );
		$this->assertSame( array(), $this->reads );
	}

	/**
	 * A member role with a live member subscription grants with one read.
	 */
	public function test_member_with_live_subscription_reads_once(): void {
		$access = $this->decide( false, array( 'subscriber', 'tia_pro_-_annual' ), $this->reader( array( array( self::sub( 'active' ) ) ) ) );

		$this->assertEquals( TIA_Elements_Access::full( 'tia-pro', self::NOW - 1000, self::NOW + 1000 ), $access );
		$this->assertSame( array( false ), $this->reads );
	}

	/**
	 * When WooCommerce grants, Stripe is not asked, even if it would grant too.
	 */
	public function test_woocommerce_grant_skips_stripe(): void {
		$access = $this->decide( false, self::MEMBER, $this->reader( array( array( self::sub( 'active' ) ) ) ), $this->stripe_found( 'active' ) );

		$this->assertSame( 'tia-pro', $access->source );
		$this->assertSame( 0, $this->stripe_calls );
	}

	/**
	 * A WooCommerce deny after the re-read asks Stripe once.
	 */
	public function test_woocommerce_deny_asks_stripe(): void {
		$dead   = array( self::sub( 'cancelled' ) );
		$access = $this->decide( false, self::MEMBER, $this->reader( array( $dead, $dead ) ), $this->stripe_found( 'past_due' ) );

		$this->assertEquals( TIA_Elements_Access::full( 'indicator-suite', self::NOW - 1000, self::NOW + 2000 ), $access );
		$this->assertSame( array( false, true ), $this->reads );
		$this->assertSame( 1, $this->stripe_calls );
	}

	/**
	 * A failed WooCommerce read with a granting suite subscription grants.
	 */
	public function test_woocommerce_unavailable_and_stripe_found_is_granted(): void {
		$this->assertSame( 'granted', $this->decide( false, self::MEMBER, $this->reader( array( null ) ), $this->stripe_found( 'past_due' ) )->state );
	}

	/**
	 * A failed WooCommerce read and no suite subscription stays unavailable.
	 */
	public function test_woocommerce_unavailable_and_stripe_none_is_unavailable(): void {
		$this->assertEquals( TIA_Elements_Access::unavailable(), $this->decide( false, self::MEMBER, $this->reader( array( null ) ) ) );
		$this->assertSame( 1, $this->stripe_calls );
	}

	/**
	 * A failed WooCommerce read and only non-granting suite subscriptions stays unavailable.
	 */
	public function test_woocommerce_unavailable_and_stripe_paused_is_unavailable(): void {
		$this->assertEquals( TIA_Elements_Access::unavailable(), $this->decide( false, self::MEMBER, $this->reader( array( null ) ), $this->stripe_found( 'paused' ) ) );
	}

	/**
	 * Both sources failing is unavailable.
	 */
	public function test_both_sources_unavailable(): void {
		$stripe = $this->stripe(
			array(
				'state'  => 'unavailable',
				'reason' => 'HTTP 500',
			)
		);

		$this->assertEquals( TIA_Elements_Access::unavailable(), $this->decide( false, self::MEMBER, $this->reader( array( null ) ), $stripe ) );
	}

	/**
	 * A WooCommerce deny and a failed Stripe lookup is unavailable.
	 */
	public function test_woocommerce_deny_and_stripe_unavailable_is_unavailable(): void {
		$stripe = $this->stripe(
			array(
				'state'  => 'unavailable',
				'reason' => 'HTTP 500',
			)
		);

		$this->assertEquals( TIA_Elements_Access::unavailable(), $this->decide( false, array( 'subscriber' ), $this->reader( array() ), $stripe ) );
	}

	/**
	 * Two clear no's deny: no member role and no suite subscription, or only non-granting ones.
	 */
	public function test_both_sources_deny(): void {
		$this->assertEquals( TIA_Elements_Access::denied(), $this->decide( false, array( 'subscriber' ), $this->reader( array() ) ) );
		$this->assertEquals( TIA_Elements_Access::denied(), $this->decide( false, array( 'subscriber' ), $this->reader( array() ), $this->stripe_found( 'paused' ) ) );
	}

	/**
	 * Before a deny on only dead subscriptions, the cache is cleared and read once more.
	 */
	public function test_only_dead_rereads_once_then_denies(): void {
		$dead = array( self::sub( 'cancelled' ) );

		$this->assertEquals( TIA_Elements_Access::denied(), $this->decide( false, self::MEMBER, $this->reader( array( $dead, $dead ) ) ) );
		$this->assertSame( array( false, true ), $this->reads );
	}

	/**
	 * A stale cache that missed a new subscription: the re-read grants.
	 */
	public function test_reread_finds_a_new_subscription(): void {
		$read = $this->reader( array( array( self::sub( 'cancelled' ) ), array( self::sub( 'cancelled' ), self::sub( 'active' ) ) ) );

		$this->assertSame( 'granted', $this->decide( false, self::MEMBER, $read )->state );
	}

	/**
	 * A failed read fails closed, on the first read or on the re-read.
	 */
	public function test_failed_read_is_unavailable(): void {
		$this->assertEquals( TIA_Elements_Access::unavailable(), $this->decide( false, self::MEMBER, $this->reader( array( null ) ) ) );
		$this->assertEquals( TIA_Elements_Access::unavailable(), $this->decide( false, self::MEMBER, $this->reader( array( array( self::sub( 'expired' ) ), null ) ) ) );
	}
}
