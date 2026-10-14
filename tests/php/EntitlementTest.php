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
	 */
	private static function decide( bool $is_admin, array $roles, callable $read ): TIA_Elements_Access {
		return TIA_Elements_Entitlement::decide( true, $is_admin, $roles, self::MEMBER, $read, self::NOW );
	}

	/**
	 * A logged-out visitor is denied without a read.
	 */
	public function test_logged_out_is_denied_without_a_read(): void {
		$access = TIA_Elements_Entitlement::decide( false, false, array(), self::MEMBER, $this->reader( array() ), self::NOW );

		$this->assertEquals( TIA_Elements_Access::denied(), $access );
		$this->assertSame( array(), $this->reads );
	}

	/**
	 * An admin gets full access with no cut-off and no WCS read.
	 */
	public function test_admin_gets_full_access_without_a_read(): void {
		$this->assertEquals( TIA_Elements_Access::full(), self::decide( true, array( 'administrator' ), $this->reader( array() ) ) );
		$this->assertSame( array(), $this->reads );
	}

	/**
	 * Without a member role the user is denied with no WCS read, even with a live member subscription.
	 */
	public function test_no_member_role_is_denied_without_a_read(): void {
		$read = $this->reader( array( array( self::sub( 'active' ) ) ) );

		$this->assertEquals( TIA_Elements_Access::denied(), self::decide( false, array( 'tia_premium_-_annually' ), $read ) );
		$this->assertSame( array(), $this->reads );
	}

	/**
	 * A member role with a live member subscription grants with one read.
	 */
	public function test_member_with_live_subscription_reads_once(): void {
		$access = self::decide( false, array( 'subscriber', 'tia_pro_-_annual' ), $this->reader( array( array( self::sub( 'active' ) ) ) ) );

		$this->assertEquals( TIA_Elements_Access::full( 'tia-pro', self::NOW - 1000, self::NOW + 1000 ), $access );
		$this->assertSame( array( false ), $this->reads );
	}

	/**
	 * Before a deny on only dead subscriptions, the cache is cleared and read once more.
	 */
	public function test_only_dead_rereads_once_then_denies(): void {
		$dead = array( self::sub( 'cancelled' ) );

		$this->assertEquals( TIA_Elements_Access::denied(), self::decide( false, self::MEMBER, $this->reader( array( $dead, $dead ) ) ) );
		$this->assertSame( array( false, true ), $this->reads );
	}

	/**
	 * A stale cache that missed a new subscription: the re-read grants.
	 */
	public function test_reread_finds_a_new_subscription(): void {
		$read = $this->reader( array( array( self::sub( 'cancelled' ) ), array( self::sub( 'cancelled' ), self::sub( 'active' ) ) ) );

		$this->assertSame( 'granted', self::decide( false, self::MEMBER, $read )->state );
	}

	/**
	 * A failed read fails closed, on the first read or on the re-read.
	 */
	public function test_failed_read_is_unavailable(): void {
		$this->assertEquals( TIA_Elements_Access::unavailable(), self::decide( false, self::MEMBER, $this->reader( array( null ) ) ) );
		$this->assertEquals( TIA_Elements_Access::unavailable(), self::decide( false, self::MEMBER, $this->reader( array( array( self::sub( 'expired' ) ), null ) ) ) );
	}
}
