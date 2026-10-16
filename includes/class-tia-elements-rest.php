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

		register_rest_route(
			self::NAMESPACE,
			'/predictive-cycles/assets',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => static fn() => self::respond( TIA_Elements_Predictive_Cycles_Service::assets() ),
				'permission_callback' => array( self::class, 'member_or_trial_gate' ),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/predictive-cycles/data',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( self::class, 'predictive_cycles_data' ),
				'permission_callback' => array( self::class, 'member_or_trial_gate' ),
				'args'                => array(
					'id'        => array(
						'type'              => 'string',
						'default'           => '',
						'validate_callback' => 'rest_validate_request_arg',
					),
					'base_year' => array(
						'type'              => 'integer',
						'default'           => 0,
						'validate_callback' => 'rest_validate_request_arg',
					),
					'curves'    => array(
						'type'              => 'array',
						'default'           => array(),
						'items'             => array(
							'type'       => 'object',
							'properties' => array(
								'id'    => array(
									'type'     => 'integer',
									'required' => true,
								),
								'years' => array(
									'type'  => 'array',
									'items' => array( 'type' => 'integer' ),
								),
							),
						),
						'validate_callback' => array( self::class, 'is_valid_predictive_cycles_request' ),
					),
				),
			)
		);
	}

	/**
	 * The Member gate for data a Trial does not include: logged in, access checked, granted in full.
	 */
	public static function member_gate(): true|WP_Error {
		$gate = self::member_or_trial_gate();
		if ( true === $gate && 'trial' === TIA_Elements_Entitlement::current()->level ) {
			return new WP_Error( 'tia_data_trial', __( 'This data is not part of the Trial.', 'tia-wordpress-elements' ), array( 'status' => 403 ) );
		}

		return $gate;
	}

	/**
	 * The Member gate for data a Trial includes: logged in, access checked, granted in full or as a Trial.
	 */
	public static function member_or_trial_gate(): true|WP_Error {
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
	 * Whether the curves, with the request's asset and Base Year, fit an enabled Predictive Cycles asset.
	 *
	 * @param mixed           $curves  The curves parameter.
	 * @param WP_REST_Request $request The request.
	 * @param string          $key     The parameter name.
	 *
	 * @phpstan-param WP_REST_Request<array<string, mixed>> $request
	 */
	public static function is_valid_predictive_cycles_request( mixed $curves, WP_REST_Request $request, string $key ): bool|WP_Error {
		$valid = rest_validate_request_arg( $curves, $request, $key );
		// WordPress validates before the permission callback, so a failed gate must answer before any upstream read.
		if ( true !== $valid || true !== self::member_or_trial_gate() ) {
			return $valid;
		}
		$assets = TIA_Elements_Predictive_Cycles_Service::assets();
		// The callback answers with the same memoized upstream error.
		if ( is_wp_error( $assets ) ) {
			return true;
		}

		return TIA_Elements_Predictive_Cycles::valid_request( $assets, $request->get_param( 'id' ), $request->get_param( 'base_year' ), $curves );
	}

	/**
	 * One Predictive Cycles asset for one Base Year, cut off at the user's Access Cut-off.
	 *
	 * @param WP_REST_Request $request The validated request.
	 *
	 * @phpstan-param WP_REST_Request<array<string, mixed>> $request
	 */
	public static function predictive_cycles_data( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$assets = TIA_Elements_Predictive_Cycles_Service::assets();
		if ( is_wp_error( $assets ) ) {
			return self::respond( $assets );
		}

		$curves = array();
		foreach ( (array) $request->get_param( 'curves' ) as $curve ) {
			$item = array( 'id' => (int) $curve['id'] );
			if ( isset( $curve['years'] ) ) {
				$item['years'] = array_values( array_map( 'intval', (array) $curve['years'] ) );
			}
			$curves[] = $item;
		}

		$access  = TIA_Elements_Entitlement::current();
		$seconds = $access->cutoff();
		$data    = TIA_Elements_Predictive_Cycles_Service::data(
			(string) $request->get_param( 'id' ),
			(int) $request->get_param( 'base_year' ),
			$curves,
			null === $seconds ? null : $seconds * 1000
		);
		if ( is_wp_error( $data ) ) {
			return self::respond( $data );
		}

		return self::respond(
			array(
				'data'   => $data,
				'cutoff' => null === $seconds ? null : array(
					'at'     => $seconds * 1000,
					'date'   => (string) wp_date( (string) get_option( 'date_format' ), $seconds, new DateTimeZone( 'UTC' ) ),
					'trial'  => 'trial' === $access->level,
					'source' => $access->source,
				),
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
