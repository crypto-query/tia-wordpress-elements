<?php
/**
 * The Supabase client: reads public.month_returns through PostgREST.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * One GET per read, with the service role key. No retry, no cache.
 */
final class TIA_Elements_Supabase {

	/**
	 * Reads month_returns rows.
	 *
	 * The error data holds `status` (the REST status) and `detail` (for admins only).
	 *
	 * @param array<string, string|int> $query  PostgREST query parameters; each value is URL-encoded.
	 * @param int                       $status Set to the upstream HTTP status, 0 without an answer.
	 * @return list<array<string, mixed>>|WP_Error
	 */
	public static function read( array $query, int &$status = 0 ): array|WP_Error {
		$settings = TIA_Elements_Settings::from_wordpress();
		$url      = $settings->get( 'supabase_url' )['value'];
		$key      = $settings->get( 'supabase_key' )['value'];
		if ( '' === $url || '' === $key ) {
			return self::error( 'tia_data_not_configured', 503, 'not configured: set the URL and the API key' );
		}

		$response = wp_remote_get(
			untrailingslashit( $url ) . '/rest/v1/month_returns?' . http_build_query( $query, '', '&', PHP_QUERY_RFC3986 ),
			array(
				'timeout' => TIA_Elements_Settings::SUPABASE_TIMEOUT,
				'headers' => array(
					'apikey'        => $key,
					'Authorization' => 'Bearer ' . $key,
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			$message = $response->get_error_message();
			$timeout = str_contains( $message, 'cURL error 28' ) || str_contains( $message, 'timed out' );

			return self::error( $timeout ? 'tia_data_timeout' : 'tia_data_upstream', $timeout ? 504 : 502, $message );
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		$body   = wp_remote_retrieve_body( $response );
		if ( $status < 200 || $status > 299 ) {
			return self::error( 'tia_data_upstream', 502, sprintf( 'HTTP %d', $status ), $body );
		}

		$rows = json_decode( $body, true );
		if ( ! is_array( $rows ) || ! array_is_list( $rows ) || array_filter( $rows, 'is_array' ) !== $rows ) {
			return self::error( 'tia_data_upstream', 502, sprintf( 'HTTP %d, but the body is not a JSON array of rows', $status ), $body );
		}

		/** The check above proves every row is an array; JSON object keys are strings. @var list<array<string, mixed>> $rows */
		return $rows;
	}

	/**
	 * A read failure with a generic message; the detail goes to the log.
	 *
	 * @param string $code            The REST error code.
	 * @param int    $status          The REST status.
	 * @param string $detail          What went wrong, for the log and the Test connection check.
	 * @param string $body            The upstream body, for the log.
	 */
	private static function error( string $code, int $status, string $detail, string $body = '' ): WP_Error {
		error_log( sprintf( 'TIA Elements: Supabase read failed: %s %s', $detail, substr( $body, 0, 300 ) ) ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Upstream detail belongs in the server log, never in the REST message.

		$data = array(
			'status' => $status,
			'detail' => $detail,
		);

		return new WP_Error( $code, __( 'This data is not available right now.', 'tia-wordpress-elements' ), $data );
	}
}
