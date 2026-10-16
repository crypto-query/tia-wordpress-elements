<?php
/**
 * Turns a Stripe lookup into the rows of the Suite Subscriptions table.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * The row builder. Pure, so it runs without WordPress: the caller passes the date and money formats.
 *
 * @phpstan-import-type Lookup from TIA_Elements_Stripe_Entitlement_Source
 * @phpstan-type Row array{status: string, next: string, note: string, total: string}
 */
final class TIA_Elements_Suite_Subscription_Rows {

	/**
	 * One row per subscription whose status the table knows; none for `none` and `unavailable`.
	 *
	 * @param array                           $lookup The Stripe lookup.
	 * @param callable(int): string           $date   Formats a UTC epoch.
	 * @param callable(float, string): string $money Formats an amount in an upper-case currency, as HTML.
	 * @return list<Row> `total` is HTML; the other fields are plain text.
	 *
	 * @phpstan-param Lookup $lookup
	 */
	public static function from_lookup( array $lookup, callable $date, callable $money ): array {
		if ( 'found' !== $lookup['state'] ) {
			return array();
		}
		$rows = array();
		foreach ( $lookup['subscriptions'] as $sub ) {
			// The status decides before cancel_at_period_end: a wind-down `trialing` carries the flag too.
			$trial = TIA_Elements_Access_Resolver::is_stripe_trial( $sub );
			$row   = match ( $sub['status'] ) {
				'active'     => $sub['cancel_at_period_end']
					? self::row( 'Pending cancellation', '-', 'Ends ' . $date( $sub['current_period_end'] ) )
					: self::row( 'Active', $date( $sub['current_period_end'] ), '' ),
				'trialing'   => $trial
					? self::row( 'Active', $date( $sub['trial_end'] ), 'When the free trial ends' )
					: self::row( 'Active', '-', 'Billing paused. Ends ' . $date( $sub['trial_end'] ) ),
				'past_due'   => self::row( 'Payment overdue', 'Overdue', 'Update your card in TIA Indicators' ),
				'paused'     => self::row( 'Paused', '-', 'No access while paused' ),
				'incomplete' => self::row( 'Pending', '-', 'First payment not complete' ),
				default      => null,
			};
			if ( null !== $row ) {
				$rows[] = $row + array( 'total' => $money( $sub['amount'] / 100, strtoupper( $sub['currency'] ) ) . ' / ' . $sub['interval'] . ( $trial ? ' after trial' : '' ) );
			}
		}
		return $rows;
	}

	/**
	 * The text cells of one row.
	 *
	 * @param string $status The Status cell.
	 * @param string $next   The Next payment cell.
	 * @param string $note   The second line under Next payment; empty for none.
	 * @return array{status: string, next: string, note: string}
	 */
	private static function row( string $status, string $next, string $note ): array {
		return array(
			'status' => $status,
			'next'   => $next,
			'note'   => $note,
		);
	}
}
