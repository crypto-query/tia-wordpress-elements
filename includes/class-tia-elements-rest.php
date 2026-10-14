<?php
/**
 * The REST contract: /wp-json/tia-data/v1/.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers the data routes behind the Member gate.
 */
final class TIA_Elements_Rest {

	private const NAMESPACE = 'tia-data/v1';

	/**
	 * Hooks the routes into the REST API.
	 */
	public static function register(): void {
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
	}

	/**
	 * Registers every route.
	 */
	public static function routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/forward-returns/assets',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => static fn() => self::respond( TIA_Elements_Forward_Returns_Service::assets() ),
				'permission_callback' => array( self::class, 'member_gate' ),
			)
		);

		// The defaults make a missing parameter fail validation as rest_invalid_param, not rest_missing_callback_param.
		// WordPress also sanitizes the defaults; absint keeps the out-of-enum period default from failing there.
		register_rest_route(
			self::NAMESPACE,
			'/forward-returns/data',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( self::class, 'forward_returns_data' ),
				'permission_callback' => array( self::class, 'member_gate' ),
				'args'                => array(
					'base'   => array(
						'type'              => 'string',
						'default'           => '',
						'validate_callback' => array( self::class, 'is_enabled_forward_returns_pair' ),
					),
					'quote'  => array(
						'type'    => 'string',
						'default' => '',
					),
					'period' => array(
						'type'              => 'integer',
						'enum'              => array( 1, 3, 6, 12 ),
						'default'           => 0,
						'validate_callback' => 'rest_validate_request_arg',
						'sanitize_callback' => 'absint',
					),
				),
			)
		);
	}

	/**
	 * The Member gate: logged in, access checked, granted in full.
	 */
	public static function member_gate(): true|WP_Error {
		if ( ! is_user_logged_in() ) {
			return new WP_Error( 'tia_data_logged_out', __( 'Log in to see this data.', 'tia-wordpress-elements' ), array( 'status' => 401 ) );
		}

		$access = TIA_Elements_Entitlement::current();
		if ( 'unavailable' === $access->state ) {
			return new WP_Error( 'tia_data_access_unavailable', __( 'Your access cannot be checked right now.', 'tia-wordpress-elements' ), array( 'status' => 503 ) );
		}
		if ( 'granted' !== $access->state ) {
			return new WP_Error( 'tia_data_not_member', __( 'This data is for Members only.', 'tia-wordpress-elements' ), array( 'status' => 403 ) );
		}
		if ( 'trial' === $access->level ) {
			return new WP_Error( 'tia_data_trial', __( 'This data is not part of the Trial.', 'tia-wordpress-elements' ), array( 'status' => 403 ) );
		}

		return true;
	}

	/**
	 * Whether the base, with the request's quote, is an enabled Forward Returns asset.
	 *
	 * @param mixed           $base    The base parameter.
	 * @param WP_REST_Request $request The request.
	 *
	 * @phpstan-param WP_REST_Request<array<string, mixed>> $request
	 */
	public static function is_enabled_forward_returns_pair( mixed $base, WP_REST_Request $request ): bool {
		$quote = $request->get_param( 'quote' );
		foreach ( TIA_Elements_Settings::from_wordpress()->forward_returns_assets() as $asset ) {
			if ( $asset['base'] === $base && $asset['quote'] === $quote ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * One Forward Returns asset for one Holding Period.
	 *
	 * @param WP_REST_Request $request The validated request.
	 *
	 * @phpstan-param WP_REST_Request<array<string, mixed>> $request
	 */
	public static function forward_returns_data( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		return self::respond(
			TIA_Elements_Forward_Returns_Service::data(
				(string) $request->get_param( 'base' ),
				(string) $request->get_param( 'quote' ),
				(int) $request->get_param( 'period' )
			)
		);
	}

	/**
	 * The response; an error keeps only its code, generic message and status.
	 *
	 * @param array<mixed>|WP_Error $result A service result.
	 */
	private static function respond( array|WP_Error $result ): WP_REST_Response|WP_Error {
		if ( ! is_wp_error( $result ) ) {
			return new WP_REST_Response( $result );
		}
		$data = $result->get_error_data();

		return new WP_Error( $result->get_error_code(), $result->get_error_message(), array( 'status' => is_array( $data ) ? $data['status'] ?? 502 : 502 ) );
	}
}
