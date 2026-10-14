<?php
/**
 * The Forward Returns transforms: upstream month_returns rows to the REST shapes.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * Pure functions from month_returns rows to the asset list and one asset's data.
 *
 * @phpstan-type Asset array{title: string, base: string, quote: string, group: string, periods: list<int>}
 * @phpstan-type Month array{month: int, value: int|float|null}
 * @phpstan-type Data array{title: string, base: string, quote: string, periods: list<array{period: int, returns: list<array{year: int, months: list<Month>}>}>}
 */
final class TIA_Elements_Forward_Returns {

	/** Group order in the asset list. */
	private const GROUPS = array( 'Crypto', 'Stocks', 'Metals', 'Indices' );

	/**
	 * Groups the enabled rows by pair, ordered by group and then by title.
	 *
	 * @param array<mixed>                                             $rows    Rows of title, base, quote and period.
	 * @param array<array{base: string, quote: string, group: string}> $enabled The enabled assets.
	 * @return list<Asset>
	 */
	public static function assets( array $rows, array $enabled ): array {
		$ranks  = array();
		$groups = array();
		foreach ( $enabled as $asset ) {
			$key            = $asset['base'] . "\0" . $asset['quote'];
			$rank           = array_search( $asset['group'], self::GROUPS, true );
			$ranks[ $key ]  = false === $rank ? count( self::GROUPS ) : $rank;
			$groups[ $key ] = $asset['group'];
		}

		$assets = array();
		foreach ( $rows as $row ) {
			$base  = is_array( $row ) ? $row['base'] ?? null : null;
			$quote = is_array( $row ) ? $row['quote'] ?? null : null;
			if ( ! is_array( $row ) || ! is_string( $base ) || ! is_string( $quote ) || ! isset( $ranks[ $base . "\0" . $quote ] ) ) {
				continue;
			}
			$key            = $base . "\0" . $quote;
			$title          = $row['title'] ?? null;
			$assets[ $key ] = $assets[ $key ] ?? array(
				'title'   => is_string( $title ) ? $title : '',
				'base'    => $base,
				'quote'   => $quote,
				'group'   => $groups[ $key ],
				'periods' => array(),
			);

			$assets[ $key ]['periods'][] = (int) ( $row['period'] ?? 0 );
		}

		foreach ( $assets as &$asset ) {
			sort( $asset['periods'] );
		}
		unset( $asset );

		uksort(
			$assets,
			static fn( $a, $b ) => array( $ranks[ $a ], strtolower( $assets[ $a ]['title'] ) ) <=> array( $ranks[ $b ], strtolower( $assets[ $b ]['title'] ) )
		);

		return array_values( $assets );
	}

	/**
	 * One asset's data: Years newest first, months 1 to 12.
	 *
	 * @param string       $base  Asset base.
	 * @param string       $quote Asset quote.
	 * @param array<mixed> $row   The row; `data` maps year => month => value.
	 * @return Data
	 */
	public static function data( string $base, string $quote, array $row ): array {
		$years = $row['data'] ?? null;
		$years = is_array( $years ) ? $years : array();
		krsort( $years, SORT_NUMERIC );

		$returns = array();
		foreach ( $years as $year => $months ) {
			$months = is_array( $months ) ? $months : array();
			ksort( $months, SORT_NUMERIC );

			$values = array();
			foreach ( $months as $month => $value ) {
				$values[] = array(
					'month' => (int) $month,
					'value' => is_int( $value ) || is_float( $value ) ? $value : null,
				);
			}
			$returns[] = array(
				'year'   => (int) $year,
				'months' => $values,
			);
		}

		return array(
			'title'   => strtoupper( $base ),
			'base'    => $base,
			'quote'   => $quote,
			'periods' => array(
				array(
					'period'  => (int) ( $row['period'] ?? 0 ),
					'returns' => $returns,
				),
			),
		);
	}
}
