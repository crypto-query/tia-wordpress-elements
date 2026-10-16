<?php
/**
 * Turns a Stripe Customer Search result into the user's TIA Indicator Suite subscriptions.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * The normaliser. Pure, so it runs without WordPress.
 *
 * @phpstan-type Subscription array{status: string, created: int, trial_end: int, current_period_end: int, cancel_at_period_end: bool, amount: int, currency: string, interval: string}
 */
final class TIA_Elements_Suite_Subscriptions {

	/**
	 * Whether a customer belongs to the user: Stripe's search can match more than the exact email.
	 *
	 * @param mixed  $customer A customer object.
	 * @param string $email    The user's email.
	 */
	public static function is_customer( mixed $customer, string $email ): bool {
		return is_array( $customer ) && is_string( $customer['email'] ?? null ) && 0 === strcasecmp( $customer['email'], $email );
	}

	/**
	 * The suite subscriptions of every customer with the user's email; statuses stay raw.
	 *
	 * @param array<mixed> $customers Customers, each with its `subscriptions` list expanded.
	 * @param string       $email     The user's email.
	 * @param string       $product   The suite product ID.
	 * @return list<Subscription>
	 */
	public static function from_customers( array $customers, string $email, string $product ): array {
		$subscriptions = array();
		foreach ( $customers as $customer ) {
			if ( ! self::is_customer( $customer, $email ) || ! is_array( $customer['subscriptions']['data'] ?? null ) ) {
				continue;
			}
			foreach ( $customer['subscriptions']['data'] as $subscription ) {
				$normal = self::subscription( $subscription, $product );
				if ( null !== $normal ) {
					$subscriptions[] = $normal;
				}
			}
		}
		return $subscriptions;
	}

	/**
	 * One subscription, reduced to its suite items; null without a suite item.
	 *
	 * @param mixed  $subscription A subscription object.
	 * @param string $product      The suite product ID.
	 * @return Subscription|null
	 */
	private static function subscription( mixed $subscription, string $product ): ?array {
		if ( ! is_array( $subscription ) || ! is_string( $subscription['status'] ?? null ) || ! is_array( $subscription['items']['data'] ?? null ) ) {
			return null;
		}
		$items = array_values(
			array_filter(
				$subscription['items']['data'],
				static fn( $item ) => is_array( $item ) && ( $item['price']['product'] ?? null ) === $product
			)
		);
		if ( ! $items ) {
			return null;
		}

		$amount = 0;
		foreach ( $items as $item ) {
			$amount += (int) ( $item['price']['unit_amount'] ?? 0 ) * (int) ( $item['quantity'] ?? 1 );
		}

		return array(
			'status'               => $subscription['status'],
			'created'              => (int) ( $subscription['created'] ?? 0 ),
			'trial_end'            => (int) ( $subscription['trial_end'] ?? 0 ),
			'current_period_end'   => min( array_map( static fn( array $item ) => (int) ( $item['current_period_end'] ?? 0 ), $items ) ),
			'cancel_at_period_end' => (bool) ( $subscription['cancel_at_period_end'] ?? false ),
			'amount'               => $amount,
			'currency'             => (string) ( $subscription['currency'] ?? '' ),
			'interval'             => (string) ( $items[0]['price']['recurring']['interval'] ?? '' ),
		);
	}
}
