<?php
/**
 * The Stripe client: GET requests against the Stripe REST API.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * One GET per call, with the restricted key. No retry, no cache, no log.
 */
final class TIA_Elements_Stripe_Client {

	private const API_VERSION = '2026-07-29.dahlia';

	private const BASE_URL = 'https://api.stripe.com';

	/**
	 * GETs a Stripe object or list.
	 *
	 * Error messages never carry Stripe's free-text `error.message`: it can echo the search query.
	 *
	 * @param string               $path   API path, e.g. `/v1/customers/search`.
	 * @param array<string, mixed> $query  Query parameters; arrays encode as `expand[0]=…`.
	 * @param int                  $status Set to the HTTP status, 0 without an answer.
	 * @return array<string, mixed>|WP_Error The decoded JSON object.
	 */
	public static function get( string $path, array $query = array(), int &$status = 0 ): array|WP_Error {
		$key = TIA_Elements_Settings::from_wordpress()->get( 'stripe_key' )['value'];
		if ( '' === $key ) {
			return new WP_Error( 'tia_stripe_not_configured', 'not configured' );
		}

		$response = wp_remote_get(
			self::BASE_URL . $path . ( $query ? '?' . http_build_query( $query, '', '&', PHP_QUERY_RFC3986 ) : '' ),
			array(
				'timeout' => TIA_Elements_Settings::STRIPE_TIMEOUT,
				'headers' => array(
					'Authorization'  => 'Bearer ' . $key,
					'Stripe-Version' => self::API_VERSION,
				),
			)
		);
		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'tia_stripe_upstream', $response->get_error_message() );
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		$body   = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $status < 200 || $status > 299 ) {
			$error  = is_array( $body ) && is_array( $body['error'] ?? null ) ? $body['error'] : array();
			$detail = array_filter( array( $error['type'] ?? null, $error['code'] ?? null ), 'is_string' );
			return new WP_Error( 'tia_stripe_upstream', trim( sprintf( 'HTTP %d %s', $status, implode( ' ', $detail ) ) ) );
		}
		if ( ! is_array( $body ) || array_is_list( $body ) ) {
			return new WP_Error( 'tia_stripe_upstream', sprintf( 'HTTP %d, but the body is not a JSON object', $status ) );
		}

		/** A JSON object decodes to string keys. @var array<string, mixed> $body */
		return $body;
	}
}
