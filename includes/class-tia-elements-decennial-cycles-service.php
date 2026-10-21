<?php
/**
 * The Decennial Cycles data service: data-server reads, then the transforms.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * Reads Decennial Cycles from the data server. A Trial gets all of it, so there is no cut-off.
 *
 * @phpstan-import-type Asset from TIA_Elements_Decennial_Cycles
 * @phpstan-import-type Data from TIA_Elements_Decennial_Cycles
 */
final class TIA_Elements_Decennial_Cycles_Service {

	/**
	 * One asset's 10-Year Cycle.
	 *
	 * @param string $id Asset id.
	 * @return Data|WP_Error
	 */
	public static function data( string $id ): array|WP_Error {
		$table = TIA_Elements_Data_Server::post( '/decennial_data', array( 'id' => $id ) );
		if ( is_wp_error( $table ) ) {
			return $table;
		}
		$data = TIA_Elements_Decennial_Cycles::data( $id, $table );
		if ( null === $data ) {
			error_log( sprintf( 'TIA Elements: the decennial_data table for %s has the wrong shape.', $id ) ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Upstream detail belongs in the server log, never in the REST message.
			return new WP_Error( 'tia_data_upstream', __( 'This data is not available right now.', 'tia-wordpress-elements' ), array( 'status' => 502 ) );
		}
		if ( null === $data['curve'] ) {
			return new WP_Error( 'tia_data_not_found', __( 'This data is not available right now.', 'tia-wordpress-elements' ), array( 'status' => 404 ) );
		}

		return $data;
	}

	/**
	 * The enabled assets that upstream has.
	 *
	 * @return list<Asset>|WP_Error
	 */
	public static function assets(): array|WP_Error {
		$body = TIA_Elements_Data_Server::get( '/decennial_assets' );
		if ( is_wp_error( $body ) ) {
			return $body;
		}
		$assets = TIA_Elements_Decennial_Cycles::assets( $body, TIA_Elements_Settings::from_wordpress()->decennial_cycles_assets() );
		if ( array() === $assets ) {
			error_log( 'TIA Elements: no enabled Decennial Cycles asset in /decennial_assets; check the asset option.' ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Upstream detail belongs in the server log, never in the REST message.
			return new WP_Error( 'tia_data_upstream', __( 'This data is not available right now.', 'tia-wordpress-elements' ), array( 'status' => 502 ) );
		}

		return $assets;
	}
}
