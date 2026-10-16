<?php
/**
 * The data-server client: reads the cycle curves from tia-data-server.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * One request per read, no auth (the data server allowlists IPs). No retry, no cache.
 */
final class TIA_Elements_Data_Server {

	/**
	 * GETs a JSON body.
	 *
	 * The error data holds `status` (the REST status) and `detail` (for admins only).
	 *
	 * @param string $path   Path such as `/forecast_curves_assets`.
	 * @param int    $status Set to the upstream HTTP status, 0 without an answer.
	 * @return array<mixed>|WP_Error
	 */
	public static function get( string $path, int &$status = 0 ): array|WP_Error {
		return self::request( 'GET', $path, null, $status );
	}

	/**
	 * POSTs a JSON body and reads a JSON body.
	 *
	 * @param string       $path   Path such as `/forecast_curves_data`.
	 * @param array<mixed> $body   The request body.
	 * @return array<mixed>|WP_Error
	 */
	public static function post( string $path, array $body ): array|WP_Error {
		$status = 0;
		return self::request( 'POST', $path, $body, $status );
	}

	/**
	 * One request.
	 *
	 * @param 'GET'|'POST'      $method HTTP method.
	 * @param string            $path   Path.
	 * @param array<mixed>|null $body   The JSON body of a POST.
	 * @param int               $status Set to the upstream HTTP status, 0 without an answer.
	 * @return array<mixed>|WP_Error
	 */
	private static function request( string $method, string $path, ?array $body, int &$status ): array|WP_Error {
		$url = TIA_Elements_Settings::from_wordpress()->get( 'data_server_url' )['value'];
		if ( '' === $url ) {
			return self::error( 'tia_data_not_configured', 503, 'not configured: set the data server URL' );
		}

		$args = array(
			'method'  => $method,
			'timeout' => TIA_Elements_Settings::DATA_SERVER_TIMEOUT,
			// The data server sits behind a Cloudflare bot rule that can block PHP's default user agent.
			'headers' => array( 'User-Agent' => sprintf( 'TIA-WordPress-Elements/%s (+%s)', self::version(), home_url() ) ),
		);
		if ( null !== $body ) {
			$args['headers']['Content-Type'] = 'application/json';
			$args['body']                    = (string) wp_json_encode( $body );
		}
		$response = wp_remote_request( untrailingslashit( $url ) . $path, $args );

		if ( is_wp_error( $response ) ) {
			$message = $response->get_error_message();
			$timeout = str_contains( $message, 'cURL error 28' ) || str_contains( $message, 'timed out' );

			return self::error( $timeout ? 'tia_data_timeout' : 'tia_data_upstream', $timeout ? 504 : 502, $message );
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		$text   = wp_remote_retrieve_body( $response );
		if ( 403 === $status ) {
			return self::error( 'tia_data_upstream', 502, "HTTP 403: this server's egress IP is not on the data server allowlist", $text );
		}
		if ( $status < 200 || $status > 299 ) {
			return self::error( 'tia_data_upstream', 502, sprintf( 'HTTP %d', $status ), $text );
		}

		$json = json_decode( $text, true );
		if ( ! is_array( $json ) ) {
			return self::error( 'tia_data_upstream', 502, sprintf( 'HTTP %d, but the body is not JSON', $status ), $text );
		}

		return $json;
	}

	/**
	 * The plugin version from its header.
	 */
	private static function version(): string {
		$version = get_file_data( dirname( __DIR__ ) . '/tia-wordpress-elements.php', array( 'version' => 'Version' ) )['version'];
		return '' === $version ? 'dev' : $version;
	}

	/**
	 * A read failure with a generic message; the detail goes to the log.
	 *
	 * @param string $code   The REST error code.
	 * @param int    $status The REST status.
	 * @param string $detail What went wrong, for the log and the Test connection check.
	 * @param string $body   The upstream body, for the log.
	 */
	private static function error( string $code, int $status, string $detail, string $body = '' ): WP_Error {
		error_log( sprintf( 'TIA Elements: data server read failed: %s %s', $detail, substr( $body, 0, 300 ) ) ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Upstream detail belongs in the server log, never in the REST message.

		$data = array(
			'status' => $status,
			'detail' => $detail,
		);

		return new WP_Error( $code, __( 'This data is not available right now.', 'tia-wordpress-elements' ), $data );
	}
}
