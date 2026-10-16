<?php
/**
 * The WooCommerce access rules.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * Turns facts about a user into access. Pure, so it runs without WordPress.
 *
 * @phpstan-type Record array{status: string, created: int, trial_end: int, period_end: int, trial_end_pre_cancellation: string}
 * @phpstan-type MemberProduct array{id: int, field: 'product_id'|'variation_id'}
 * @phpstan-import-type Subscription from TIA_Elements_Suite_Subscriptions
 */
final class TIA_Elements_Access_Resolver {

	// Checkout Trials run 7 days; a wind-down `trialing` pauses billing for months and is not a Trial.
	private const STRIPE_TRIAL_MAX_SECONDS = 31 * 86400;

	/**
	 * Products that make a subscription a member subscription, each with the line-item field it matches.
	 * TIA Elite matches on its variation, because its parent 244 is TIA Premium's parent too.
	 *
	 * @var list<MemberProduct>
	 */
	public const MEMBER_PRODUCTS = array(
		array(
			'id'    => 19339,
			'field' => 'product_id',
		),
		array(
			'id'    => 19195,
			'field' => 'variation_id',
		),
	);

	/**
	 * Statuses that grant access. Every other status, `trash` included, is dead.
	 */
	public const LIVE_STATUSES = array( 'active', 'on-hold', 'pending-cancel' );

	/**
	 * Whether the user holds a role that makes a user a member.
	 *
	 * @param array<string> $roles        The user's roles.
	 * @param array<string> $member_roles Roles that make a user a member.
	 */
	public static function has_member_role( array $roles, array $member_roles ): bool {
		return (bool) array_intersect( $roles, $member_roles );
	}

	/**
	 * The valid entries of a member product list, as the `tia_member_products` filter returned it.
	 *
	 * @param mixed $products The filtered list.
	 * @return list<MemberProduct>
	 */
	public static function member_products( mixed $products ): array {
		$valid = array();
		foreach ( is_array( $products ) ? $products : array() as $product ) {
			if ( is_array( $product ) && is_int( $product['id'] ?? null ) && $product['id'] > 0 && in_array( $product['field'] ?? null, array( 'product_id', 'variation_id' ), true ) ) {
				$valid[] = array(
					'id'    => $product['id'],
					'field' => $product['field'],
				);
			}
		}
		return $valid;
	}

	/**
	 * Whether any line item is a member product.
	 *
	 * @param array<array{product_id: int, variation_id: int}> $items    The subscription's line items.
	 * @param array                                            $products Member products.
	 *
	 * @phpstan-param list<MemberProduct> $products
	 */
	public static function is_member_subscription( array $items, array $products ): bool {
		foreach ( $items as $item ) {
			foreach ( $products as $product ) {
				if ( $item[ $product['field'] ] === $product['id'] ) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Access from the user's member subscriptions, for a user who holds a member role.
	 *
	 * @param array $records Member subscriptions, dates as UTC epochs (0 = unset).
	 * @param int   $now     UTC epoch.
	 *
	 * @phpstan-param list<Record> $records
	 */
	public static function woocommerce( array $records, int $now ): TIA_Elements_Access {
		if ( ! $records ) {
			return TIA_Elements_Access::full( 'tia-pro' );
		}
		$best = null;
		foreach ( $records as $record ) {
			if ( ! in_array( $record['status'], self::LIVE_STATUSES, true ) ) {
				continue;
			}
			$access = self::subscription_access( $record, $now );
			if ( self::beats( $access, $best ) ) {
				$best = $access;
			}
		}
		return $best ?? TIA_Elements_Access::denied();
	}

	/**
	 * Access from the user's TIA Indicator Suite subscriptions.
	 *
	 * @param array $subscriptions Suite subscriptions with raw Stripe statuses.
	 *
	 * @phpstan-param list<Subscription> $subscriptions
	 */
	public static function stripe( array $subscriptions ): TIA_Elements_Access {
		$best = null;
		foreach ( $subscriptions as $subscription ) {
			$access = match ( $subscription['status'] ) {
				'active', 'past_due' => TIA_Elements_Access::full( 'indicator-suite', $subscription['created'], $subscription['current_period_end'] ),
				'trialing'           => self::is_stripe_trial( $subscription )
					? TIA_Elements_Access::trial( 'indicator-suite', $subscription['trial_end'] )
					: TIA_Elements_Access::full( 'indicator-suite', $subscription['created'], $subscription['trial_end'] ),
				default              => null,
			};
			if ( null !== $access && self::beats( $access, $best ) ) {
				$best = $access;
			}
		}
		return $best ?? TIA_Elements_Access::denied();
	}

	/**
	 * The Access Cut-off of full access, from the subscription's age at its period end.
	 *
	 * Counts calendar months and ignores the day: past 11 months it is Dec 31 of the period-end year,
	 * else one calendar month after the period end, rolling over like `Date.setMonth` (31 Jan → early March).
	 *
	 * @param int $created    UTC epoch the subscription started.
	 * @param int $period_end UTC epoch the paid period ends.
	 * @return int UTC epoch.
	 */
	public static function year_end_cutoff( int $created, int $period_end ): int {
		$year   = (int) gmdate( 'Y', $period_end );
		$months = 12 * ( $year - (int) gmdate( 'Y', $created ) ) + (int) gmdate( 'n', $period_end ) - (int) gmdate( 'n', $created );
		if ( $months > 11 ) {
			return (int) gmmktime( 0, 0, 0, 12, 31, $year );
		}
		return ( new DateTimeImmutable( '@' . $period_end ) )->add( new DateInterval( 'P1M' ) )->getTimestamp();
	}

	/**
	 * Whether a suite subscription is a Trial: `trialing` for at most 31 days.
	 *
	 * @param array $subscription A suite subscription.
	 *
	 * @phpstan-param Subscription $subscription
	 */
	public static function is_stripe_trial( array $subscription ): bool {
		return 'trialing' === $subscription['status'] && $subscription['trial_end'] - $subscription['created'] <= self::STRIPE_TRIAL_MAX_SECONDS;
	}

	/**
	 * Whether granted access beats the best so far: full beats Trial, then the later cut-off; none counts as latest.
	 *
	 * @param TIA_Elements_Access      $access Granted access.
	 * @param TIA_Elements_Access|null $best   The best granted access so far.
	 */
	private static function beats( TIA_Elements_Access $access, ?TIA_Elements_Access $best ): bool {
		if ( null === $best ) {
			return true;
		}
		if ( $access->level !== $best->level ) {
			return 'full' === $access->level;
		}
		$cutoff = $access->cutoff();
		$least  = $best->cutoff();
		return null !== $least && ( null === $cutoff || $cutoff > $least );
	}

	/**
	 * Access from one live member subscription.
	 *
	 * @param array $record A live member subscription.
	 * @param int   $now    UTC epoch.
	 *
	 * @phpstan-param Record $record
	 */
	private static function subscription_access( array $record, int $now ): TIA_Elements_Access {
		$trial_end = match ( $record['status'] ) {
			'active'         => $record['trial_end'],
			// Pending-cancel deletes `trial_end`; only this meta keeps it.
			'pending-cancel' => self::gmt_time( $record['trial_end_pre_cancellation'] ),
			default          => 0,
		};
		if ( $trial_end > $now ) {
			return TIA_Elements_Access::trial( 'tia-pro', $trial_end );
		}
		return TIA_Elements_Access::full( 'tia-pro', $record['created'], $record['period_end'] ? $record['period_end'] : null );
	}

	/**
	 * A GMT MySQL date as a UTC epoch; 0 for WCS's '0' (no trial) or anything unreadable.
	 *
	 * @param string $date `Y-m-d H:i:s` in GMT.
	 */
	private static function gmt_time( string $date ): int {
		$time = DateTimeImmutable::createFromFormat( '!Y-m-d H:i:s', $date, new DateTimeZone( 'UTC' ) );
		return $time ? $time->getTimestamp() : 0;
	}
}
