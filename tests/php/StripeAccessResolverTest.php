<?php
/**
 * The Stripe access rules.
 *
 * @package tia-wordpress-elements
 */

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../includes/class-tia-elements-access.php';
require_once __DIR__ . '/../../includes/class-tia-elements-access-resolver.php';

/**
 * Exercises TIA_Elements_Access_Resolver::stripe() with normalised suite subscriptions.
 */
final class StripeAccessResolverTest extends TestCase {

	private const CREATED    = 1_800_000_000;
	private const PERIOD_END = 1_830_000_000;
	private const DAY        = 86_400;

	/**
	 * One normalised suite subscription.
	 *
	 * @param string               $status Stripe status.
	 * @param array<string, mixed> $fields Fields to override.
	 * @return array{status: string, created: int, trial_end: int, current_period_end: int, cancel_at_period_end: bool, amount: int, currency: string, interval: string}
	 */
	private static function sub( string $status, array $fields = array() ): array {
		return array_merge(
			array(
				'status'               => $status,
				'created'              => self::CREATED,
				'trial_end'            => 0,
				'current_period_end'   => self::PERIOD_END,
				'cancel_at_period_end' => false,
				'amount'               => 29900,
				'currency'             => 'usd',
				'interval'             => 'year',
			),
			$fields
		);
	}

	/**
	 * Active, active set to cancel, and past due grant full access up to the period end.
	 *
	 * @param array<string, mixed> $sub The subscription.
	 */
	#[DataProvider( 'full_statuses' )]
	public function test_paying_statuses_are_full( array $sub ): void {
		$this->assertEquals(
			TIA_Elements_Access::full( 'indicator-suite', self::CREATED, self::PERIOD_END ),
			TIA_Elements_Access_Resolver::stripe( array( $sub ) )
		);
	}

	/**
	 * Subscriptions that grant full access.
	 *
	 * @return array<string, array{array<string, mixed>}>
	 */
	public static function full_statuses(): array {
		return array(
			'active'                       => array( self::sub( 'active' ) ),
			'active, cancel at period end' => array( self::sub( 'active', array( 'cancel_at_period_end' => true ) ) ),
			'past_due'                     => array( self::sub( 'past_due' ) ),
		);
	}

	/**
	 * Statuses that grant nothing.
	 *
	 * @param string $status Stripe status.
	 */
	#[DataProvider( 'dead_statuses' )]
	public function test_other_statuses_are_denied( string $status ): void {
		$this->assertEquals( TIA_Elements_Access::denied(), TIA_Elements_Access_Resolver::stripe( array( self::sub( $status ) ) ) );
	}

	/**
	 * Statuses without access.
	 *
	 * @return array<string, array{string}>
	 */
	public static function dead_statuses(): array {
		return array(
			'paused'     => array( 'paused' ),
			'incomplete' => array( 'incomplete' ),
			'unpaid'     => array( 'unpaid' ),
			'unknown'    => array( 'something_new' ),
		);
	}

	/**
	 * No subscription is no access.
	 */
	public function test_no_subscription_is_denied(): void {
		$this->assertEquals( TIA_Elements_Access::denied(), TIA_Elements_Access_Resolver::stripe( array() ) );
	}

	/**
	 * A checkout Trial, and one of exactly 31 days, is a Trial cut off at its end.
	 *
	 * @param int $length Trial length in seconds.
	 */
	#[DataProvider( 'trial_lengths' )]
	public function test_short_trialing_is_a_trial( int $length ): void {
		$this->assertEquals(
			TIA_Elements_Access::trial( 'indicator-suite', self::CREATED + $length ),
			TIA_Elements_Access_Resolver::stripe( array( self::sub( 'trialing', array( 'trial_end' => self::CREATED + $length ) ) ) )
		);
	}

	/**
	 * Trial lengths that still count as a Trial.
	 *
	 * @return array<string, array{int}>
	 */
	public static function trial_lengths(): array {
		return array(
			'7 days'  => array( 7 * self::DAY ),
			'31 days' => array( 31 * self::DAY ),
		);
	}

	/**
	 * One second past 31 days is a billing pause: full access up to the trial end.
	 */
	public function test_trialing_past_31_days_is_full(): void {
		$trial_end = self::CREATED + 31 * self::DAY + 1;
		$this->assertEquals(
			TIA_Elements_Access::full( 'indicator-suite', self::CREATED, $trial_end ),
			TIA_Elements_Access_Resolver::stripe( array( self::sub( 'trialing', array( 'trial_end' => $trial_end ) ) ) )
		);
	}

	/**
	 * A wind-down subscription: billing paused for months and set to cancel, still full up to the trial end.
	 */
	public function test_wind_down_is_full(): void {
		$trial_end = self::CREATED + 200 * self::DAY;
		$sub       = self::sub(
			'trialing',
			array(
				'trial_end'            => $trial_end,
				'current_period_end'   => $trial_end,
				'cancel_at_period_end' => true,
			)
		);

		$this->assertEquals( TIA_Elements_Access::full( 'indicator-suite', self::CREATED, $trial_end ), TIA_Elements_Access_Resolver::stripe( array( $sub ) ) );
	}

	/**
	 * A granting subscription beats a non-granting one, in either order.
	 */
	public function test_granting_beats_non_granting(): void {
		$want = TIA_Elements_Access::full( 'indicator-suite', self::CREATED, self::PERIOD_END );

		$this->assertEquals( $want, TIA_Elements_Access_Resolver::stripe( array( self::sub( 'paused' ), self::sub( 'active' ) ) ) );
		$this->assertEquals( $want, TIA_Elements_Access_Resolver::stripe( array( self::sub( 'active' ), self::sub( 'incomplete' ) ) ) );
	}

	/**
	 * Full beats a Trial, in either order.
	 */
	public function test_full_beats_trial(): void {
		$trial = self::sub( 'trialing', array( 'trial_end' => self::CREATED + 7 * self::DAY ) );
		$want  = TIA_Elements_Access::full( 'indicator-suite', self::CREATED, self::PERIOD_END );

		$this->assertEquals( $want, TIA_Elements_Access_Resolver::stripe( array( $trial, self::sub( 'past_due' ) ) ) );
		$this->assertEquals( $want, TIA_Elements_Access_Resolver::stripe( array( self::sub( 'active' ), $trial ) ) );
	}
}
