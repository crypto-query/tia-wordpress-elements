<?php
/**
 * The Forward Returns data service: one Supabase read, then the transform.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * Reads Forward Returns from Supabase. It never reads the user; the REST gate does.
 *
 * @phpstan-import-type Asset from TIA_Elements_Forward_Returns
 * @phpstan-import-type Data from TIA_Elements_Forward_Returns
 */
final class TIA_Elements_Forward_Returns_Service {

	/**
	 * The enabled assets that upstream has.
	 *
	 * @return list<Asset>|WP_Error
	 */
	public static function assets(): array|WP_Error {
		$rows = TIA_Elements_Supabase::read(
			array(
				'select' => 'title,base,quote,period',
				'period' => 'in.(1,3,6,12)',
			)
		);
		if ( is_wp_error( $rows ) ) {
			return $rows;
		}
		$assets = TIA_Elements_Forward_Returns::assets( $rows, TIA_Elements_Settings::from_wordpress()->forward_returns_assets() );
		if ( array() === $assets ) {
			error_log( sprintf( 'TIA Elements: no enabled Forward Returns asset among %d month_returns rows; check the key, RLS and the asset option.', count( $rows ) ) ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Upstream detail belongs in the server log, never in the REST message.
			return new WP_Error( 'tia_data_upstream', __( 'This data is not available right now.', 'tia-wordpress-elements' ), array( 'status' => 502 ) );
		}

		return $assets;
	}

	/**
	 * One asset's data for one Holding Period.
	 *
	 * @param string $base   Asset base.
	 * @param string $quote  Asset quote.
	 * @param int    $period Holding Period in months.
	 * @return Data|WP_Error
	 */
	public static function data( string $base, string $quote, int $period ): array|WP_Error {
		$rows = TIA_Elements_Supabase::read(
			array(
				'select' => '*',
				'base'   => 'eq.' . $base,
				'quote'  => 'eq.' . $quote,
				'period' => 'eq.' . $period,
			)
		);
		if ( is_wp_error( $rows ) ) {
			return $rows;
		}
		if ( ! isset( $rows[0] ) ) {
			return new WP_Error( 'tia_data_not_found', __( 'This data is not available right now.', 'tia-wordpress-elements' ), array( 'status' => 404 ) );
		}

		return TIA_Elements_Forward_Returns::data( $base, $quote, $rows[0] );
	}
}
