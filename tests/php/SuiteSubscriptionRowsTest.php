<?php
/**
 * The Suite Subscriptions row rules.
 *
 * @package tia-wordpress-elements
 */

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../includes/class-tia-elements-access.php';
require_once __DIR__ . '/../../includes/class-tia-elements-access-resolver.php';
require_once __DIR__ . '/../../src/suite-subscriptions/class-tia-elements-suite-subscription-rows.php';

/**
 * Exercises TIA_Elements_Suite_Subscription_Rows with Stripe lookups.
 */
final class SuiteSubscriptionRowsTest extends TestCase {

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
	 * The rows for found subscriptions, with a plain date and money format.
	 *
	 * @param list<array{status: string, created: int, trial_end: int, current_period_end: int, cancel_at_period_end: bool, amount: int, currency: string, interval: string}> $subs The subscriptions.
	 * @return list<array{status: string, next: string, note: string, total: string}>
	 */
	private static function rows( array $subs ): array {
		return self::lookup_rows(
			array(
				'state'         => 'found',
				'subscriptions' => $subs,
			)
		);
	}

	/**
	 * The rows for a lookup, with a plain date and money format.
	 *
	 * @param array<string, mixed> $lookup The lookup.
	 * @return list<array{status: string, next: string, note: string, total: string}>
	 */
	private static function lookup_rows( array $lookup ): array {
		return TIA_Elements_Suite_Subscription_Rows::from_lookup(
			$lookup,
			static fn( int $time ): string => gmdate( 'Y-m-d H:i:s', $time ),
			static fn( float $amount, string $currency ): string => sprintf( '%s %.2f', $currency, $amount )
		);
	}

	/**
	 * Each Stripe status the table knows gets its row.
	 *
	 * @param array<string, mixed>                                             $sub The subscription.
	 * @param array{status: string, next: string, note: string, total: string} $row The row.
	 */
	#[DataProvider( 'rules' )]
	public function test_each_status_gets_its_row( array $sub, array $row ): void {
		$this->assertSame( array( $row ), self::rows( array( self::sub( ...$sub ) ) ) );
	}

	/**
	 * One subscription and its row, per rule of the status table.
	 *
	 * @return array<string, array{array<mixed>, array{status: string, next: string, note: string, total: string}}>
	 */
	public static function rules(): array {
		$period_end = gmdate( 'Y-m-d H:i:s', self::PERIOD_END );
		$trial_31   = self::CREATED + 31 * self::DAY;
		$wind_down  = self::CREATED + 31 * self::DAY + 1;
		return array(
			'active'                          => array(
				array( 'active' ),
				array(
					'status' => 'Active',
					'next'   => $period_end,
					'note'   => '',
					'total'  => 'USD 299.00 / year',
				),
			),
			'active, cancel at period end'    => array(
				array( 'active', array( 'cancel_at_period_end' => true ) ),
				array(
					'status' => 'Pending cancellation',
					'next'   => '-',
					'note'   => 'Ends ' . $period_end,
					'total'  => 'USD 299.00 / year',
				),
			),
			'trialing for exactly 31 days'    => array(
				array(
					'trialing',
					array(
						'trial_end' => $trial_31,
						'amount'    => 2990,
						'interval'  => 'month',
					),
				),
				array(
					'status' => 'Active',
					'next'   => gmdate( 'Y-m-d H:i:s', $trial_31 ),
					'note'   => 'When the free trial ends',
					'total'  => 'USD 29.90 / month after trial',
				),
			),
			'trialing for more than 31 days'  => array(
				array( 'trialing', array( 'trial_end' => $wind_down ) ),
				array(
					'status' => 'Active',
					'next'   => '-',
					'note'   => 'Billing paused. Ends ' . gmdate( 'Y-m-d H:i:s', $wind_down ),
					'total'  => 'USD 299.00 / year',
				),
			),
			'wind-down, cancel at period end' => array(
				array(
					'trialing',
					array(
						'trial_end'            => self::CREATED + 300 * self::DAY,
						'cancel_at_period_end' => true,
					),
				),
				array(
					'status' => 'Active',
					'next'   => '-',
					'note'   => 'Billing paused. Ends ' . gmdate( 'Y-m-d H:i:s', self::CREATED + 300 * self::DAY ),
					'total'  => 'USD 299.00 / year',
				),
			),
			'past_due'                        => array(
				array( 'past_due' ),
				array(
					'status' => 'Payment overdue',
					'next'   => 'Overdue',
					'note'   => 'Update your card in TIA Indicators',
					'total'  => 'USD 299.00 / year',
				),
			),
			'paused'                          => array(
				array( 'paused' ),
				array(
					'status' => 'Paused',
					'next'   => '-',
					'note'   => 'No access while paused',
					'total'  => 'USD 299.00 / year',
				),
			),
			'incomplete'                      => array(
				array( 'incomplete', array( 'currency' => 'eur' ) ),
				array(
					'status' => 'Pending',
					'next'   => '-',
					'note'   => 'First payment not complete',
					'total'  => 'EUR 299.00 / year',
				),
			),
		);
	}

	/**
	 * A status outside the table gets no row.
	 *
	 * @param string $status Stripe status.
	 */
	#[DataProvider( 'unknown_statuses' )]
	public function test_a_status_outside_the_table_is_skipped( string $status ): void {
		$this->assertSame( array(), self::rows( array( self::sub( $status ) ) ) );
	}

	/**
	 * Statuses the table does not list.
	 *
	 * @return array<string, array{string}>
	 */
	public static function unknown_statuses(): array {
		return array(
			'unpaid'             => array( 'unpaid' ),
			'incomplete_expired' => array( 'incomplete_expired' ),
			'canceled'           => array( 'canceled' ),
		);
	}

	/**
	 * Several subscriptions give one row each, in order, without the skipped ones.
	 */
	public function test_several_subscriptions_give_one_row_each(): void {
		$rows = self::rows( array( self::sub( 'paused' ), self::sub( 'unpaid' ), self::sub( 'active' ) ) );

		$this->assertSame( array( 'Paused', 'Active' ), array_column( $rows, 'status' ) );
	}

	/**
	 * No suite subscription and a failed lookup give no rows.
	 *
	 * @param array{state: 'none'}|array{state: 'unavailable', reason: string} $lookup The lookup.
	 */
	#[DataProvider( 'empty_lookups' )]
	public function test_no_rows_without_found_subscriptions( array $lookup ): void {
		$this->assertSame( array(), self::lookup_rows( $lookup ) );
	}

	/**
	 * Lookups without subscriptions.
	 *
	 * @return array<string, array{array{state: 'none'}|array{state: 'unavailable', reason: string}}>
	 */
	public static function empty_lookups(): array {
		return array(
			'none'        => array( array( 'state' => 'none' ) ),
			'unavailable' => array(
				array(
					'state'  => 'unavailable',
					'reason' => 'timeout',
				),
			),
		);
	}
}
