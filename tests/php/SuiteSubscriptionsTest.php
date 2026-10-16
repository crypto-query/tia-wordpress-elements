<?php
/**
 * The TIA Indicator Suite subscriptions normaliser.
 *
 * @package tia-wordpress-elements
 */

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../includes/class-tia-elements-suite-subscriptions.php';

/**
 * Exercises TIA_Elements_Suite_Subscriptions with Customer Search results.
 */
final class SuiteSubscriptionsTest extends TestCase {

	private const SUITE = 'prod_suite';
	private const EMAIL = 'ann@example.test';

	/**
	 * One subscription item.
	 *
	 * @param string $product    The price's product.
	 * @param int    $unit       Unit amount in the smallest currency unit.
	 * @param int    $quantity   Quantity.
	 * @param int    $period_end UTC epoch the item's period ends.
	 * @param string $interval   Billing interval.
	 * @return array<string, mixed>
	 */
	private static function item( string $product, int $unit = 29900, int $quantity = 1, int $period_end = 1_900_000_000, string $interval = 'year' ): array {
		return array(
			'price'              => array(
				'product'     => $product,
				'unit_amount' => $unit,
				'recurring'   => array( 'interval' => $interval ),
			),
			'quantity'           => $quantity,
			'current_period_end' => $period_end,
		);
	}

	/**
	 * One subscription as Stripe returns it.
	 *
	 * @param list<array<string, mixed>> $items     Its items.
	 * @param string                     $status    Stripe status.
	 * @param int|null                   $trial_end UTC epoch, or null without a trial.
	 * @return array<string, mixed>
	 */
	private static function sub( array $items, string $status = 'active', ?int $trial_end = null ): array {
		return array(
			'id'                   => 'sub_1',
			'status'               => $status,
			'created'              => 1_800_000_000,
			'trial_end'            => $trial_end,
			'cancel_at_period_end' => false,
			'currency'             => 'usd',
			'items'                => array( 'data' => $items ),
		);
	}

	/**
	 * One customer with its expanded subscriptions.
	 *
	 * @param string                     $email Customer email.
	 * @param list<array<string, mixed>> $subs  Its subscriptions.
	 * @return array<string, mixed>
	 */
	private static function customer( string $email, array $subs ): array {
		return array(
			'id'            => 'cus_1',
			'email'         => $email,
			'subscriptions' => array(
				'data'     => $subs,
				'has_more' => false,
			),
		);
	}

	/**
	 * A suite subscription keeps its fields as Stripe gives them.
	 */
	public function test_suite_subscription_is_normalised(): void {
		$this->assertSame(
			array(
				array(
					'status'               => 'past_due',
					'created'              => 1_800_000_000,
					'trial_end'            => 1_800_604_800,
					'current_period_end'   => 1_900_000_000,
					'cancel_at_period_end' => false,
					'amount'               => 29900,
					'currency'             => 'usd',
					'interval'             => 'year',
				),
			),
			TIA_Elements_Suite_Subscriptions::from_customers(
				array( self::customer( self::EMAIL, array( self::sub( array( self::item( self::SUITE ) ), 'past_due', 1_800_604_800 ) ) ) ),
				self::EMAIL,
				self::SUITE
			)
		);
	}

	/**
	 * No trial reads as trial_end 0; a raw status the gate does not grant still passes through.
	 */
	public function test_null_trial_end_is_zero_and_status_is_raw(): void {
		$subs = TIA_Elements_Suite_Subscriptions::from_customers(
			array( self::customer( self::EMAIL, array( self::sub( array( self::item( self::SUITE ) ), 'paused' ) ) ) ),
			self::EMAIL,
			self::SUITE
		);

		$this->assertSame( 0, $subs[0]['trial_end'] );
		$this->assertSame( 'paused', $subs[0]['status'] );
	}

	/**
	 * The email check ignores case, keeps every matching customer and drops the rest.
	 */
	public function test_only_customers_with_the_email_count(): void {
		$subs = TIA_Elements_Suite_Subscriptions::from_customers(
			array(
				self::customer( 'Ann@Example.TEST', array( self::sub( array( self::item( self::SUITE ) ), 'active' ) ) ),
				self::customer( 'annie@example.test', array( self::sub( array( self::item( self::SUITE ) ), 'active' ) ) ),
				self::customer( self::EMAIL, array( self::sub( array( self::item( self::SUITE ) ), 'trialing' ) ) ),
			),
			self::EMAIL,
			self::SUITE
		);

		$this->assertSame( array( 'active', 'trialing' ), array_column( $subs, 'status' ) );
	}

	/**
	 * Items of other products are dropped, and a subscription with no suite item is dropped whole.
	 */
	public function test_only_suite_items_count(): void {
		$subs = TIA_Elements_Suite_Subscriptions::from_customers(
			array(
				self::customer(
					self::EMAIL,
					array(
						self::sub( array( self::item( 'prod_other', 500, 1, 1_700_000_000, 'month' ), self::item( self::SUITE, 29900, 1, 1_900_000_000, 'year' ) ) ),
						self::sub( array( self::item( 'prod_other' ) ) ),
					)
				),
			),
			self::EMAIL,
			self::SUITE
		);

		$this->assertCount( 1, $subs );
		$this->assertSame( 29900, $subs[0]['amount'] );
		$this->assertSame( 1_900_000_000, $subs[0]['current_period_end'] );
		$this->assertSame( 'year', $subs[0]['interval'] );
	}

	/**
	 * Amount sums unit amount times quantity; the period ends at the earliest item; the interval is the first item's.
	 */
	public function test_several_suite_items_combine(): void {
		$subs = TIA_Elements_Suite_Subscriptions::from_customers(
			array(
				self::customer(
					self::EMAIL,
					array( self::sub( array( self::item( self::SUITE, 1000, 3, 1_950_000_000, 'month' ), self::item( self::SUITE, 250, 2, 1_900_000_000, 'year' ) ) ) )
				),
			),
			self::EMAIL,
			self::SUITE
		);

		$this->assertSame( 3500, $subs[0]['amount'] );
		$this->assertSame( 1_900_000_000, $subs[0]['current_period_end'] );
		$this->assertSame( 'month', $subs[0]['interval'] );
	}

	/**
	 * A customer whose email matches but who has no subscriptions gives none.
	 */
	public function test_no_subscriptions_gives_an_empty_list(): void {
		$this->assertSame( array(), TIA_Elements_Suite_Subscriptions::from_customers( array( self::customer( self::EMAIL, array() ) ), self::EMAIL, self::SUITE ) );
	}
}
