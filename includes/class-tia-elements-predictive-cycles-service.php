<?php
/**
 * The Predictive Cycles data service: data-server reads, then the transforms.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * Reads Predictive Cycles from the data server. It never reads the user; the REST callback passes the cut-off in.
 *
 * @phpstan-import-type Asset from TIA_Elements_Predictive_Cycles
 * @phpstan-import-type Data from TIA_Elements_Predictive_Cycles
 */
final class TIA_Elements_Predictive_Cycles_Service {

	/**
	 * The asset list of this request, an error included, so validation and the callback share one read.
	 *
	 * @var list<Asset>|WP_Error|null
	 */
	private static array|WP_Error|null $assets = null;

	/**
	 * The enabled assets that upstream has.
	 *
	 * @return list<Asset>|WP_Error
	 */
	public static function assets(): array|WP_Error {
		if ( null === self::$assets ) {
			self::$assets = self::read_assets();
		}
		return self::$assets;
	}

	/**
	 * One asset's curves for one Base Year, cut off.
	 *
	 * @param string                                  $id        Asset id.
	 * @param int                                     $base_year The Base Year.
	 * @param list<array{id: int, years?: list<int>}> $curves    The curves to compute.
	 * @param int|null                                $cutoff_ms Epoch ms after which values become null; null for none.
	 * @return Data|WP_Error
	 */
	public static function data( string $id, int $base_year, array $curves, ?int $cutoff_ms ): array|WP_Error {
		$table = TIA_Elements_Data_Server::post(
			'/forecast_curves_data',
			array(
				'id'        => $id,
				'base_year' => $base_year,
				'curves'    => $curves,
			)
		);
		if ( is_wp_error( $table ) ) {
			return $table;
		}
		$data = TIA_Elements_Predictive_Cycles::data( $id, $base_year, $table );
		if ( null === $data ) {
			error_log( sprintf( 'TIA Elements: the forecast_curves_data table for %s %d has the wrong shape.', $id, $base_year ) ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Upstream detail belongs in the server log, never in the REST message.
			return new WP_Error( 'tia_data_upstream', __( 'This data is not available right now.', 'tia-wordpress-elements' ), array( 'status' => 502 ) );
		}

		return TIA_Elements_Predictive_Cycles::cut( $data, $cutoff_ms );
	}

	/**
	 * Reads and filters the asset list.
	 *
	 * @return list<Asset>|WP_Error
	 */
	private static function read_assets(): array|WP_Error {
		$body = TIA_Elements_Data_Server::get( '/forecast_curves_assets' );
		if ( is_wp_error( $body ) ) {
			return $body;
		}
		$assets = TIA_Elements_Predictive_Cycles::assets( $body, TIA_Elements_Settings::from_wordpress()->predictive_cycles_assets() );
		if ( array() === $assets ) {
			error_log( 'TIA Elements: no enabled Predictive Cycles asset in /forecast_curves_assets; check the asset option.' ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Upstream detail belongs in the server log, never in the REST message.
			return new WP_Error( 'tia_data_upstream', __( 'This data is not available right now.', 'tia-wordpress-elements' ), array( 'status' => 502 ) );
		}

		return $assets;
	}
}
