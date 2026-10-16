<?php
/**
 * The Predictive Cycles transforms: data-server payloads to the REST shapes.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * Pure functions from the data server's asset list and curve table, plus the request check and the cut-off.
 *
 * @phpstan-type Curve array{id: int, name?: string, info?: string, years?: list<int>, static?: list<int>}
 * @phpstan-type Asset array{id: string, name: string, title: string, range: array{begin: int, end: int}, base: string, quote: string, group: string, base_years: list<int>, curves: list<Curve>}
 * @phpstan-type Point array{int, int|float|null}
 * @phpstan-type Data array{id: string, base_year: int, curves: list<array{id: int, name: string, points: list<Point>}>}
 */
final class TIA_Elements_Predictive_Cycles {

	/** Group order in the asset list. */
	private const GROUPS = array( 'Crypto', 'Stocks', 'Metals', 'Indices' );

	/**
	 * The enabled assets that upstream has, ordered by group and then by name. Malformed items are skipped.
	 *
	 * @param array<mixed>                            $upstream The `/forecast_curves_assets` body.
	 * @param array<array{id: string, group: string}> $enabled  The enabled assets.
	 * @return list<Asset>
	 */
	public static function assets( array $upstream, array $enabled ): array {
		$groups = array_column( $enabled, 'group', 'id' );
		$assets = array();
		foreach ( is_array( $upstream['assets'] ?? null ) ? $upstream['assets'] : array() as $item ) {
			$asset = is_array( $item ) ? self::asset( $item ) : null;
			if ( null === $asset || ! isset( $groups[ $asset['id'] ] ) || isset( $assets[ $asset['id'] ] ) ) {
				continue;
			}
			$assets[ $asset['id'] ] = array(
				'id'         => $asset['id'],
				'name'       => $asset['name'],
				'title'      => $asset['title'],
				'range'      => $asset['range'],
				'base'       => $asset['base'],
				'quote'      => $asset['quote'],
				'group'      => $groups[ $asset['id'] ],
				'base_years' => $asset['base_years'],
				'curves'     => $asset['curves'],
			);
		}

		$rank = static function ( string $group ): int {
			$rank = array_search( $group, self::GROUPS, true );
			return false === $rank ? count( self::GROUPS ) : $rank;
		};
		usort(
			$assets,
			static fn( $a, $b ) => array( $rank( $a['group'] ), strtolower( $a['name'] ) ) <=> array( $rank( $b['group'] ), strtolower( $b['name'] ) )
		);

		return $assets;
	}

	/**
	 * One curve table as one point list per curve, columns in upstream order.
	 *
	 * @param string       $id        Asset id.
	 * @param int          $base_year The Base Year.
	 * @param array<mixed> $upstream  The `/forecast_curves_data` body: `ids`, `columns`, `index` (epoch ms) and `data` rows.
	 * @return Data|null Null when the table has the wrong shape.
	 */
	public static function data( string $id, int $base_year, array $upstream ): ?array {
		$ids     = $upstream['ids'] ?? null;
		$columns = $upstream['columns'] ?? null;
		$index   = $upstream['index'] ?? null;
		$rows    = $upstream['data'] ?? null;
		if ( ! self::is_list( $ids ) || ! self::is_list( $columns ) || ! self::is_list( $index ) || ! self::is_list( $rows ) || count( $ids ) !== count( $columns ) || count( $rows ) !== count( $index ) ) {
			return null;
		}

		$points = array_fill( 0, count( $ids ), array() );
		foreach ( $index as $row => $at ) {
			$values = $rows[ $row ];
			if ( ! is_int( $at ) || ! self::is_list( $values ) || count( $values ) !== count( $ids ) ) {
				return null;
			}
			foreach ( $values as $col => $value ) {
				if ( null !== $value && ! is_int( $value ) && ! is_float( $value ) ) {
					return null;
				}
				$points[ $col ][] = array( $at, $value );
			}
		}

		$curves = array();
		foreach ( $ids as $col => $curve_id ) {
			if ( ! is_int( $curve_id ) || ! is_string( $columns[ $col ] ) ) {
				return null;
			}
			$curves[] = array(
				'id'     => $curve_id,
				'name'   => $columns[ $col ],
				'points' => $points[ $col ],
			);
		}

		return array(
			'id'        => $id,
			'base_year' => $base_year,
			'curves'    => $curves,
		);
	}

	/**
	 * Sets every value after the cut-off to null and keeps the point, so the x axis keeps its range.
	 *
	 * @param array    $data      One curve table.
	 * @param int|null $cutoff_ms Epoch ms; null leaves the data whole.
	 * @return Data
	 *
	 * @phpstan-param Data $data
	 */
	public static function cut( array $data, ?int $cutoff_ms ): array {
		if ( null === $cutoff_ms ) {
			return $data;
		}
		foreach ( $data['curves'] as $c => $curve ) {
			foreach ( $curve['points'] as $p => $point ) {
				if ( $point[0] > $cutoff_ms ) {
					$data['curves'][ $c ]['points'][ $p ][1] = null;
				}
			}
		}

		return $data;
	}

	/**
	 * Whether a data request fits one of the assets: its Base Year, its curves once each, and each year-curve a
	 * non-empty subset of its years. A curve without `years` upstream takes none.
	 *
	 * @param array $assets    The enabled assets.
	 * @param mixed $id        The asset id.
	 * @param mixed $base_year The Base Year.
	 * @param mixed $curves    The requested curves, `{id, years?}` each.
	 *
	 * @phpstan-param list<Asset> $assets
	 */
	public static function valid_request( array $assets, mixed $id, mixed $base_year, mixed $curves ): bool {
		$asset = array_column( $assets, null, 'id' )[ is_string( $id ) ? $id : '' ] ?? null;
		if ( null === $asset || ! in_array( $base_year, $asset['base_years'], true ) || ! self::is_list( $curves ) || ! $curves || count( $curves ) > count( $asset['curves'] ) ) {
			return false;
		}

		$known = array_column( $asset['curves'], null, 'id' );
		$seen  = array();
		foreach ( $curves as $curve ) {
			$curve_id = is_array( $curve ) ? $curve['id'] ?? null : null;
			if ( ! is_array( $curve ) || ! is_int( $curve_id ) || ! isset( $known[ $curve_id ] ) || isset( $seen[ $curve_id ] ) ) {
				return false;
			}
			$seen[ $curve_id ] = true;

			$allowed = $known[ $curve_id ]['years'] ?? null;
			if ( null === $allowed ) {
				if ( array_key_exists( 'years', $curve ) ) {
					return false;
				}
				continue;
			}
			$years = $curve['years'] ?? null;
			if ( ! self::is_list( $years ) || ! $years ) {
				return false;
			}
			foreach ( $years as $year ) {
				if ( ! in_array( $year, $allowed, true ) ) {
					return false;
				}
			}
			if ( count( array_unique( $years ) ) !== count( $years ) ) {
				return false;
			}
		}

		return true;
	}

	/**
	 * One upstream asset in the REST shape without its group, or null when malformed.
	 *
	 * @param array<mixed> $item An upstream asset.
	 * @return array{id: string, name: string, title: string, range: array{begin: int, end: int}, base: string, quote: string, base_years: list<int>, curves: list<Curve>}|null
	 */
	private static function asset( array $item ): ?array {
		$id         = $item['id'] ?? null;
		$name       = $item['name'] ?? null;
		$base_years = $item['base_years'] ?? null;
		$curves     = $item['curves'] ?? null;
		if ( ! is_string( $id ) || ! is_string( $name ) || ! is_array( $base_years ) || ! is_array( $curves ) ) {
			return null;
		}
		$range = is_array( $item['range'] ?? null ) ? $item['range'] : array();
		$text  = static fn( mixed $value ): string => is_string( $value ) ? $value : '';

		$base_years = self::ints( $base_years );
		rsort( $base_years );

		$list = array();
		foreach ( $curves as $curve ) {
			if ( ! is_array( $curve ) || ! is_int( $curve['id'] ?? null ) ) {
				continue;
			}
			$out = array( 'id' => $curve['id'] );
			if ( is_string( $curve['label'] ?? null ) ) {
				$out['name'] = $curve['label'];
			}
			if ( is_string( $curve['info'] ?? null ) ) {
				$out['info'] = $curve['info'];
			}
			foreach ( array( 'years', 'static' ) as $key ) {
				if ( is_array( $curve[ $key ] ?? null ) ) {
					$out[ $key ] = self::ints( $curve[ $key ] );
				}
			}
			$list[] = $out;
		}

		return array(
			'id'         => $id,
			'name'       => $name,
			'title'      => $text( $item['title'] ?? null ),
			'range'      => array(
				'begin' => is_int( $range['begin'] ?? null ) ? $range['begin'] : 0,
				'end'   => is_int( $range['end'] ?? null ) ? $range['end'] : 0,
			),
			'base'       => $text( $item['base'] ?? null ),
			'quote'      => $text( $item['quote'] ?? null ),
			'base_years' => $base_years,
			'curves'     => $list,
		);
	}

	/**
	 * The integers of a list.
	 *
	 * @param array<mixed> $values Values.
	 * @return list<int>
	 */
	private static function ints( array $values ): array {
		return array_values( array_filter( $values, 'is_int' ) );
	}

	/**
	 * Whether a value is a list.
	 *
	 * @param mixed $value The value.
	 * @phpstan-assert-if-true list<mixed> $value
	 */
	private static function is_list( mixed $value ): bool {
		return is_array( $value ) && array_is_list( $value );
	}
}
