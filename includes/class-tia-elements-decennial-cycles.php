<?php
/**
 * The Decennial Cycles transforms: data-server payloads to the REST shapes.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * Pure functions from the data server's asset list and curve table.
 *
 * @phpstan-type Asset array{id: string, name: string, title: string, range: array{begin: int, end: int}, group: string}
 * @phpstan-type Curve array{name: string, datapoints: list<array{dec: int|float, value: int|float|null}>}
 * @phpstan-type Data array{id: string, curve: Curve}
 */
final class TIA_Elements_Decennial_Cycles {

	/**
	 * The enabled assets that upstream has, ordered by group and then by name. Malformed items are skipped.
	 *
	 * @param array<mixed>                            $upstream The `/decennial_assets` body.
	 * @param array<array{id: string, group: string}> $enabled  The enabled assets.
	 * @return list<Asset>
	 */
	public static function assets( array $upstream, array $enabled ): array {
		$groups = array_column( $enabled, 'group', 'id' );
		$assets = array();
		foreach ( is_array( $upstream['assets'] ?? null ) ? $upstream['assets'] : array() as $item ) {
			$id   = is_array( $item ) ? $item['id'] ?? null : null;
			$name = is_array( $item ) ? $item['name'] ?? null : null;
			if ( ! is_array( $item ) || ! is_string( $id ) || ! is_string( $name ) || ! isset( $groups[ $id ] ) || isset( $assets[ $id ] ) ) {
				continue;
			}
			$range         = is_array( $item['range'] ?? null ) ? $item['range'] : array();
			$assets[ $id ] = array(
				'id'    => $id,
				'name'  => $name,
				'title' => is_string( $item['title'] ?? null ) ? $item['title'] : '',
				'range' => array(
					'begin' => is_int( $range['begin'] ?? null ) ? $range['begin'] : 0,
					'end'   => is_int( $range['end'] ?? null ) ? $range['end'] : 0,
				),
				'group' => $groups[ $id ],
			);
		}

		return TIA_Elements_Predictive_Cycles::sort( $assets );
	}

	/**
	 * The table's first curve, one datapoint per row; later columns are dropped.
	 *
	 * @param string       $id       Asset id.
	 * @param array<mixed> $upstream The `/decennial_data` body: `columns`, `index` (decade position) and `data` rows.
	 * @return array{id: string, curve: Curve|null}|null Curve null when the table has no column; null when it has the wrong shape.
	 */
	public static function data( string $id, array $upstream ): ?array {
		$columns = $upstream['columns'] ?? null;
		$index   = $upstream['index'] ?? null;
		$rows    = $upstream['data'] ?? null;
		if ( ! self::is_list( $columns ) || ! self::is_list( $index ) || ! self::is_list( $rows ) || count( $rows ) !== count( $index ) ) {
			return null;
		}
		if ( array() === $columns ) {
			return array(
				'id'    => $id,
				'curve' => null,
			);
		}
		if ( ! is_string( $columns[0] ) ) {
			return null;
		}

		$datapoints = array();
		foreach ( $index as $row => $dec ) {
			$values = $rows[ $row ];
			$value  = self::is_list( $values ) && count( $values ) === count( $columns ) ? $values[0] : false;
			if ( ( ! is_int( $dec ) && ! is_float( $dec ) ) || ( null !== $value && ! is_int( $value ) && ! is_float( $value ) ) ) {
				return null;
			}
			$datapoints[] = array(
				'dec'   => $dec,
				'value' => $value,
			);
		}

		return array(
			'id'    => $id,
			'curve' => array(
				'name'       => $columns[0],
				'datapoints' => $datapoints,
			),
		);
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
