<?php
/**
 * The WooCommerce access rules.
 *
 * @package tia-wordpress-elements
 */

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../includes/class-tia-elements-access.php';
require_once __DIR__ . '/../../includes/class-tia-elements-access-resolver.php';

/**
 * Exercises TIA_Elements_Access_Resolver with subscription records and a fixed clock.
 */
final class AccessResolverTest extends TestCase {

	private const NOW = 1_800_000_000;
	private const DAY = 86_400;

	/**
	 * One member subscription record; dates default to unset.
	 *
	 * @param string               $status WCS status.
	 * @param array<string, mixed> $dates  Fields to override.
	 * @return array{status: string, created: int, trial_end: int, period_end: int, trial_end_pre_cancellation: string}
	 */
	private static function sub( string $status, array $dates = array() ): array {
		return array_merge(
			array(
				'status'                     => $status,
				'created'                    => self::NOW - 90 * self::DAY,
				'trial_end'                  => 0,
				'period_end'                 => 0,
				'trial_end_pre_cancellation' => '0',
			),
			$dates
		);
	}

	/**
	 * A user with a member role and no member subscription was granted by hand: full, no cut-off.
	 */
	public function test_no_member_subscription_is_a_manual_grant(): void {
		$this->assertEquals( TIA_Elements_Access::full( 'tia-pro' ), TIA_Elements_Access_Resolver::woocommerce( array(), self::NOW ) );
	}

	/**
	 * Active in a running trial: Trial, cut off at the trial end.
	 */
	public function test_active_in_trial(): void {
		$trial_end = self::NOW + 5 * self::DAY;
		$this->assertEquals(
			TIA_Elements_Access::trial( 'tia-pro', $trial_end ),
			TIA_Elements_Access_Resolver::woocommerce(
				array(
					self::sub(
						'active',
						array(
							'trial_end'  => $trial_end,
							'period_end' => $trial_end,
						)
					),
				),
				self::NOW
			)
		);
	}

	/**
	 * Active after its trial ended: full, with the period end.
	 */
	public function test_active_after_trial_is_full(): void {
		$sub = self::sub(
			'active',
			array(
				'trial_end'  => self::NOW - self::DAY,
				'period_end' => self::NOW + 300 * self::DAY,
			)
		);
		$this->assertEquals(
			TIA_Elements_Access::full( 'tia-pro', $sub['created'], $sub['period_end'] ),
			TIA_Elements_Access_Resolver::woocommerce( array( $sub ), self::NOW )
		);
	}

	/**
	 * Pending-cancel during a trial keeps the trial date only in the meta: Trial to that date.
	 */
	public function test_pending_cancel_in_trial(): void {
		$trial_end = self::NOW + 5 * self::DAY;
		$this->assertEquals(
			TIA_Elements_Access::trial( 'tia-pro', $trial_end ),
			TIA_Elements_Access_Resolver::woocommerce(
				array(
					self::sub(
						'pending-cancel',
						array(
							'period_end'                 => $trial_end,
							'trial_end_pre_cancellation' => gmdate( 'Y-m-d H:i:s', $trial_end ),
						)
					),
				),
				self::NOW
			)
		);
	}

	/**
	 * Full states: the period end passes through, and on-hold keeps a past one.
	 *
	 * @param string               $status     WCS status.
	 * @param array<string, mixed> $dates      Record fields.
	 * @param int|null             $period_end The period end the access reports.
	 */
	#[DataProvider( 'full_states' )]
	public function test_full_states( string $status, array $dates, ?int $period_end ): void {
		$sub = self::sub( $status, $dates );
		$this->assertEquals(
			TIA_Elements_Access::full( 'tia-pro', $sub['created'], $period_end ),
			TIA_Elements_Access_Resolver::woocommerce( array( $sub ), self::NOW )
		);
	}

	/**
	 * Full WCS states and the period end each one reports.
	 *
	 * @return array<string, array{string, array<string, mixed>, int|null}>
	 */
	public static function full_states(): array {
		return array(
			'active'                       => array( 'active', array( 'period_end' => self::NOW + 270 * self::DAY ), self::NOW + 270 * self::DAY ),
			'pending-cancel until its end' => array( 'pending-cancel', array( 'period_end' => self::NOW + 60 * self::DAY ), self::NOW + 60 * self::DAY ),
			'pending-cancel, no trial'     => array(
				'pending-cancel',
				array(
					'period_end'                 => self::NOW + 60 * self::DAY,
					'trial_end_pre_cancellation' => '0',
				),
				self::NOW + 60 * self::DAY,
			),
			'pending-cancel, trial over'   => array(
				'pending-cancel',
				array(
					'period_end'                 => self::NOW + 60 * self::DAY,
					'trial_end_pre_cancellation' => gmdate( 'Y-m-d H:i:s', self::NOW - self::DAY ),
				),
				self::NOW + 60 * self::DAY,
			),
			'on-hold, overdue'             => array( 'on-hold', array( 'period_end' => self::NOW - 30 * self::DAY ), self::NOW - 30 * self::DAY ),
			'on-hold, trial date ignored'  => array(
				'on-hold',
				array(
					'trial_end'  => self::NOW + self::DAY,
					'period_end' => self::NOW + self::DAY,
				),
				self::NOW + self::DAY,
			),
			'active, no period end'        => array( 'active', array(), null ),
		);
	}

	/**
	 * Only dead member subscriptions deny; every status that is not live is dead.
	 *
	 * @param string $status WCS status.
	 */
	#[DataProvider( 'dead_statuses' )]
	public function test_only_dead_subscriptions_deny( string $status ): void {
		$this->assertEquals(
			TIA_Elements_Access::denied(),
			TIA_Elements_Access_Resolver::woocommerce( array( self::sub( $status ), self::sub( 'cancelled' ) ), self::NOW )
		);
	}

	/**
	 * Statuses that grant nothing.
	 *
	 * @return array<string, array{string}>
	 */
	public static function dead_statuses(): array {
		$statuses = array( 'pending', 'cancelled', 'expired', 'switched', 'trash', 'unknown' );
		return array_combine( $statuses, array_map( fn( $status ) => array( $status ), $statuses ) );
	}

	/**
	 * A live subscription beats a dead one.
	 */
	public function test_live_beats_dead(): void {
		$live = self::sub( 'on-hold', array( 'period_end' => self::NOW + self::DAY ) );
		$this->assertEquals(
			TIA_Elements_Access::full( 'tia-pro', $live['created'], $live['period_end'] ),
			TIA_Elements_Access_Resolver::woocommerce( array( self::sub( 'expired' ), $live ), self::NOW )
		);
	}

	/**
	 * TIA Pro matches on the product, TIA Elite on the variation; TIA Premium and its parent never count.
	 *
	 * @param array<array{product_id: int, variation_id: int}> $items  Line items.
	 * @param bool                                             $member Whether they make a member subscription.
	 */
	#[DataProvider( 'line_items' )]
	public function test_member_subscription_by_line_item( array $items, bool $member ): void {
		$products = TIA_Elements_Access_Resolver::member_products( TIA_Elements_Access_Resolver::MEMBER_PRODUCTS );
		$this->assertSame( $member, TIA_Elements_Access_Resolver::is_member_subscription( $items, $products ) );
	}

	/**
	 * Line items and whether they make a member subscription.
	 *
	 * @return array<string, array{list<array{product_id: int, variation_id: int}>, bool}>
	 */
	public static function line_items(): array {
		$item = fn( $product, $variation = 0 ) => array(
			'product_id'   => $product,
			'variation_id' => $variation,
		);
		return array(
			'TIA Pro'                    => array( array( $item( 19339 ) ), true ),
			'TIA Elite'                  => array( array( $item( 244, 19195 ) ), true ),
			'TIA Premium'                => array( array( $item( 244, 247 ) ), false ),
			'the parent alone'           => array( array( $item( 244 ) ), false ),
			'TIA Elite id as a product'  => array( array( $item( 19195 ) ), false ),
			'TIA Pro id as a variation'  => array( array( $item( 1, 19339 ) ), false ),
			'another product'            => array( array( $item( 500 ) ), false ),
			'TIA Premium beside TIA Pro' => array( array( $item( 244, 247 ), $item( 19339 ) ), true ),
			'no line items'              => array( array(), false ),
		);
	}

	/**
	 * The `tia_member_products` filter can add a product; malformed entries are dropped.
	 */
	public function test_filtered_member_products(): void {
		$products = TIA_Elements_Access_Resolver::member_products(
			array(
				array(
					'id'    => 19339,
					'field' => 'product_id',
				),
				array(
					'id'    => 247,
					'field' => 'variation_id',
				),
				array(
					'id'    => 500,
					'field' => 'sku',
				),
				array( 'id' => '600' ),
				array(
					'id'    => 0,
					'field' => 'variation_id',
				),
				'19195',
			)
		);

		$this->assertSame(
			array(
				array(
					'id'    => 19339,
					'field' => 'product_id',
				),
				array(
					'id'    => 247,
					'field' => 'variation_id',
				),
			),
			$products
		);
		$premium = array(
			array(
				'product_id'   => 244,
				'variation_id' => 247,
			),
		);
		$this->assertTrue( TIA_Elements_Access_Resolver::is_member_subscription( $premium, $products ) );
		$this->assertSame( array(), TIA_Elements_Access_Resolver::member_products( 'not a list' ) );
	}

	/**
	 * Full beats Trial, in either order.
	 */
	public function test_full_beats_trial(): void {
		$trial = self::sub(
			'active',
			array(
				'trial_end'  => self::NOW + 5 * self::DAY,
				'period_end' => self::NOW + 5 * self::DAY,
			)
		);
		$full  = self::sub( 'active', array( 'period_end' => self::NOW + 900 * self::DAY ) );
		$want  = TIA_Elements_Access::full( 'tia-pro', $full['created'], $full['period_end'] );

		$this->assertEquals( $want, TIA_Elements_Access_Resolver::woocommerce( array( $trial, $full ), self::NOW ) );
		$this->assertEquals( $want, TIA_Elements_Access_Resolver::woocommerce( array( $full, $trial ), self::NOW ) );
	}

	/**
	 * Among full member subscriptions the later cut-off wins, in any order, not the later period end.
	 */
	public function test_later_cutoff_wins(): void {
		$utc = static fn( string $date ) => ( new DateTimeImmutable( $date, new DateTimeZone( 'UTC' ) ) )->getTimestamp();
		$now = $utc( '2027-01-15' );
		// Month 13 of a monthly TIA Pro: cut off Dec 31 2027.
		$monthly = self::sub(
			'active',
			array(
				'created'    => $utc( '2026-01-10' ),
				'period_end' => $utc( '2027-02-10' ),
			)
		);
		// A young subscription with a later period end, cut off Jul 20 2027.
		$young = self::sub(
			'pending-cancel',
			array(
				'created'    => $utc( '2026-12-20' ),
				'period_end' => $utc( '2027-06-20' ),
			)
		);
		// TIA Elite paid three years ahead: cut off Dec 31 2029.
		$elite   = self::sub(
			'active',
			array(
				'created'    => $utc( '2026-12-01' ),
				'period_end' => $utc( '2029-12-01' ),
			)
		);
		$overdue = self::sub( 'on-hold', array( 'period_end' => $utc( '2026-12-01' ) ) );
		$trial   = self::sub(
			'active',
			array(
				'trial_end'  => $utc( '2031-01-01' ),
				'period_end' => $utc( '2031-01-01' ),
			)
		);

		$this->assertEquals( $utc( '2029-12-31' ), TIA_Elements_Access_Resolver::woocommerce( array( $monthly, $young, $elite, $overdue, $trial ), $now )->cutoff() );
		$this->assertEquals( $utc( '2029-12-31' ), TIA_Elements_Access_Resolver::woocommerce( array( $trial, $elite, $overdue, $young, $monthly ), $now )->cutoff() );
		$this->assertEquals( $utc( '2027-12-31' ), TIA_Elements_Access_Resolver::woocommerce( array( $young, $monthly, $overdue ), $now )->cutoff() );
		$this->assertEquals( $utc( '2027-12-31' ), TIA_Elements_Access_Resolver::woocommerce( array( $overdue, $monthly, $young ), $now )->cutoff() );
	}

	/**
	 * A full subscription without a period end has no cut-off, so it counts as the latest.
	 */
	public function test_no_cutoff_counts_as_latest(): void {
		$dated = self::sub( 'active', array( 'period_end' => self::NOW + 900 * self::DAY ) );
		$open  = self::sub( 'active' );

		$this->assertNull( TIA_Elements_Access_Resolver::woocommerce( array( $dated, $open ), self::NOW )->cutoff() );
		$this->assertNull( TIA_Elements_Access_Resolver::woocommerce( array( $open, $dated ), self::NOW )->cutoff() );
	}

	/**
	 * Between two Trials the later trial end wins.
	 */
	public function test_later_trial_end_wins(): void {
		$early = self::sub( 'active', array( 'trial_end' => self::NOW + 2 * self::DAY ) );
		$late  = self::sub( 'active', array( 'trial_end' => self::NOW + 6 * self::DAY ) );
		$want  = TIA_Elements_Access::trial( 'tia-pro', self::NOW + 6 * self::DAY );

		$this->assertEquals( $want, TIA_Elements_Access_Resolver::woocommerce( array( $early, $late ), self::NOW ) );
		$this->assertEquals( $want, TIA_Elements_Access_Resolver::woocommerce( array( $late, $early ), self::NOW ) );
	}
}
