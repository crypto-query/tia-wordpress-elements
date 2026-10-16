<?php
/**
 * Looks up a user's TIA Indicator Suite subscriptions on Stripe.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * Matches the user to Stripe customers by email, with a request memo and a short per-user transient.
 *
 * @phpstan-import-type Subscription from TIA_Elements_Suite_Subscriptions
 * @phpstan-type Lookup array{state: 'found', subscriptions: non-empty-list<Subscription>}|array{state: 'none'}|array{state: 'unavailable', reason: string}
 */
final class TIA_Elements_Stripe_Entitlement_Source {

	private const TRANSIENT_PREFIX = 'tia_elements_stripe_';

	private const FOUND_TTL = 300;

	private const NONE_TTL = 60;

	/**
	 * Lookups per transient name for this request.
	 *
	 * @var array<string, Lookup>
	 */
	private static array $memo = array();

	/**
	 * The user's suite subscriptions; `none` without a call for no user, no email or no key.
	 *
	 * @param int    $user_id The user.
	 * @param string $email   The user's email.
	 * @return Lookup
	 */
	public static function lookup( int $user_id, string $email ): array {
		$email    = strtolower( $email );
		$settings = TIA_Elements_Settings::from_wordpress();
		if ( $user_id <= 0 || '' === $email || '' === $settings->get( 'stripe_key' )['value'] ) {
			return array( 'state' => 'none' );
		}

		$name = self::TRANSIENT_PREFIX . $user_id . '_' . md5( $email );
		if ( isset( self::$memo[ $name ] ) ) {
			return self::$memo[ $name ];
		}
		$cached = self::cached( get_transient( $name ) );
		if ( null !== $cached ) {
			self::$memo[ $name ] = $cached;
			return $cached;
		}

		$lookup = self::fetch( $email, $settings->get( 'stripe_suite_product' )['value'] );
		if ( 'unavailable' === $lookup['state'] ) {
			error_log( 'TIA Elements: Stripe lookup failed: ' . $lookup['reason'] ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- The page shows only the Unavailable card; the cause belongs in the server log.
		} else {
			set_transient( $name, $lookup, 'found' === $lookup['state'] ? self::FOUND_TTL : self::NONE_TTL );
		}
		self::$memo[ $name ] = $lookup;
		return $lookup;
	}

	/**
	 * Deletes every cached lookup.
	 */
	public static function delete_transients(): void {
		global $wpdb;
		$wpdb->query( // phpcs:ignore WordPress.DB.DirectDatabaseQuery -- Transients have no API to delete by prefix.
			$wpdb->prepare(
				"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
				$wpdb->esc_like( '_transient_' . self::TRANSIENT_PREFIX ) . '%',
				$wpdb->esc_like( '_transient_timeout_' . self::TRANSIENT_PREFIX ) . '%'
			)
		);
		self::$memo = array();
	}

	/**
	 * A cached `found` or `none` lookup; null for anything else, e.g. a missing or outdated transient.
	 *
	 * @param mixed $value The transient value.
	 * @return array{state: 'found', subscriptions: non-empty-list<Subscription>}|array{state: 'none'}|null
	 */
	private static function cached( mixed $value ): ?array {
		if ( ! is_array( $value ) ) {
			return null;
		}
		if ( 'none' === ( $value['state'] ?? null ) ) {
			return array( 'state' => 'none' );
		}
		if ( 'found' !== ( $value['state'] ?? null ) || ! is_array( $value['subscriptions'] ?? null ) ) {
			return null;
		}
		$subscriptions = array();
		foreach ( $value['subscriptions'] as $subscription ) {
			if ( ! self::is_subscription( $subscription ) ) {
				return null;
			}
			$subscriptions[] = $subscription;
		}
		return $subscriptions ? array(
			'state'         => 'found',
			'subscriptions' => $subscriptions,
		) : null;
	}

	/**
	 * Whether a value has the normalised subscription shape.
	 *
	 * @param mixed $value The value.
	 * @phpstan-assert-if-true Subscription $value
	 */
	private static function is_subscription( mixed $value ): bool {
		return is_array( $value )
			&& is_string( $value['status'] ?? null )
			&& is_int( $value['created'] ?? null )
			&& is_int( $value['trial_end'] ?? null )
			&& is_int( $value['current_period_end'] ?? null )
			&& is_bool( $value['cancel_at_period_end'] ?? null )
			&& is_int( $value['amount'] ?? null )
			&& is_string( $value['currency'] ?? null )
			&& is_string( $value['interval'] ?? null );
	}

	/**
	 * One Customer Search with the subscriptions expanded, plus paging for a customer with more.
	 *
	 * @param string $email   The lower-cased email.
	 * @param string $product The suite product ID.
	 * @return Lookup
	 */
	private static function fetch( string $email, string $product ): array {
		$path   = '/v1/customers/search';
		$search = TIA_Elements_Stripe_Client::get(
			$path,
			array(
				'query'  => sprintf( 'email:"%s"', addcslashes( $email, '"\\' ) ),
				'limit'  => 100,
				'expand' => array( 'data.subscriptions' ),
			)
		);
		if ( is_wp_error( $search ) ) {
			return self::unavailable( $path, $search );
		}

		$customers = is_array( $search['data'] ?? null ) ? $search['data'] : array();
		foreach ( $customers as $index => $customer ) {
			if ( ! TIA_Elements_Suite_Subscriptions::is_customer( $customer, $email ) || empty( $customer['subscriptions']['has_more'] ) ) {
				continue;
			}
			$all = self::subscriptions( (string) ( $customer['id'] ?? '' ) );
			if ( is_wp_error( $all ) ) {
				return self::unavailable( '/v1/subscriptions', $all );
			}
			$customers[ $index ]['subscriptions']['data'] = $all;
		}

		$subscriptions = TIA_Elements_Suite_Subscriptions::from_customers( $customers, $email, $product );
		return $subscriptions ? array(
			'state'         => 'found',
			'subscriptions' => $subscriptions,
		) : array( 'state' => 'none' );
	}

	/**
	 * Every subscription of one customer that Stripe lists by default; ended ones are not listed.
	 *
	 * @param string $customer The customer ID.
	 * @return array<mixed>|WP_Error
	 */
	private static function subscriptions( string $customer ): array|WP_Error {
		$all   = array();
		$query = array(
			'customer' => $customer,
			'limit'    => 100,
		);
		do {
			$page = TIA_Elements_Stripe_Client::get( '/v1/subscriptions', $query );
			if ( is_wp_error( $page ) ) {
				return $page;
			}
			$data = is_array( $page['data'] ?? null ) ? array_values( $page['data'] ) : array();
			$all  = array_merge( $all, $data );
			$last = end( $data );

			$query['starting_after'] = is_array( $last ) && is_string( $last['id'] ?? null ) ? $last['id'] : '';
		} while ( ! empty( $page['has_more'] ) && '' !== $query['starting_after'] );
		return $all;
	}

	/**
	 * A failed lookup; the reason names the path and the client error, never the email.
	 *
	 * @param string   $path  The API path that failed.
	 * @param WP_Error $error The client error.
	 * @return array{state: 'unavailable', reason: string}
	 */
	private static function unavailable( string $path, WP_Error $error ): array {
		return array(
			'state'  => 'unavailable',
			'reason' => $path . ': ' . $error->get_error_message(),
		);
	}
}
