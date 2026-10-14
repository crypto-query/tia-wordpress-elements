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
 */
final class TIA_Elements_Access_Resolver {

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
			if ( null === $best || ( 'full' === $access->level && 'trial' === $best->level ) ) {
				$best = $access;
			}
		}
		return $best ?? TIA_Elements_Access::denied();
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
