<?php
/**
 * The Decennial Cycles transforms.
 *
 * @package tia-wordpress-elements
 */

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../includes/class-tia-elements-predictive-cycles.php';
require_once __DIR__ . '/../../includes/class-tia-elements-decennial-cycles.php';

/**
 * Exercises TIA_Elements_Decennial_Cycles with upstream payloads, without WordPress.
 */
final class DecennialCyclesTest extends TestCase {

	/**
	 * One upstream asset.
	 *
	 * @param string $id   Asset id.
	 * @param string $name Asset name.
	 * @return array<string, mixed>
	 */
	private static function upstream_asset( string $id, string $name ): array {
		return array(
			'id'    => $id,
			'name'  => $name,
			'title' => $name . ' 10-Year Cycle',
			'range' => array(
				'begin' => 1897,
				'end'   => 2025,
			),
		);
	}

	/**
	 * An enabled asset.
	 *
	 * @param string $id    Asset id.
	 * @param string $group Its group.
	 * @return array{id: string, group: string}
	 */
	private static function enabled( string $id, string $group ): array {
		return array(
			'id'    => $id,
			'group' => $group,
		);
	}

	/**
	 * The asset list unwraps `assets` and adds the group.
	 */
	public function test_assets_shape(): void {
		$assets = TIA_Elements_Decennial_Cycles::assets(
			array( 'assets' => array( self::upstream_asset( 'dji', 'Dow Jones Industrial - DJI' ) ) ),
			array( self::enabled( 'dji', 'Indices' ) )
		);

		$this->assertSame(
			array(
				array(
					'id'    => 'dji',
					'name'  => 'Dow Jones Industrial - DJI',
					'title' => 'Dow Jones Industrial - DJI 10-Year Cycle',
					'range' => array(
						'begin' => 1897,
						'end'   => 2025,
					),
					'group' => 'Indices',
				),
			),
			$assets
		);
	}

	/**
	 * Only enabled assets that upstream has, once each; groups in order Crypto, Stocks, Metals, Indices, then by name.
	 */
	public function test_assets_filter_and_order(): void {
		$upstream = array(
			'assets' => array(
				self::upstream_asset( 'xjo', 'S&P/ASX 200 - XJO' ),
				self::upstream_asset( 'spx', 's&p 500 - SPX' ),
				self::upstream_asset( 'foo', 'Not enabled' ),
				self::upstream_asset( 'dji', 'Dow Jones Industrial - DJI' ),
				self::upstream_asset( 'dji', 'A duplicate' ),
				self::upstream_asset( 'btc', 'Bitcoin - BTC' ),
			),
		);
		$enabled  = array(
			self::enabled( 'dji', 'Indices' ),
			self::enabled( 'spx', 'Indices' ),
			self::enabled( 'xjo', 'Indices' ),
			self::enabled( 'btc', 'Crypto' ),
			self::enabled( 'gone', 'Indices' ),
		);

		$assets = TIA_Elements_Decennial_Cycles::assets( $upstream, $enabled );

		$this->assertSame( array( 'btc', 'dji', 'spx', 'xjo' ), array_column( $assets, 'id' ) );
		$this->assertSame( 'Dow Jones Industrial - DJI', $assets[1]['name'] );
	}

	/**
	 * Malformed upstream items are skipped; a missing title or range falls back to empty; no `assets` gives none.
	 */
	public function test_assets_skip_malformed(): void {
		$no_name = self::upstream_asset( 'spx', 'S&P 500' );
		unset( $no_name['name'] );
		$bare    = array(
			'id'   => 'ndx',
			'name' => 'Nasdaq 100 - NDX',
		);
		$enabled = array_map( static fn( $id ) => self::enabled( $id, 'Indices' ), array( 'dji', 'spx', 'ndx' ) );

		$assets = TIA_Elements_Decennial_Cycles::assets( array( 'assets' => array( 'dji', array( 'id' => 'dji' ), $no_name, $bare ) ), $enabled );

		$this->assertSame(
			array(
				array(
					'id'    => 'ndx',
					'name'  => 'Nasdaq 100 - NDX',
					'title' => '',
					'range' => array(
						'begin' => 0,
						'end'   => 0,
					),
					'group' => 'Indices',
				),
			),
			$assets
		);
		$this->assertSame( array(), TIA_Elements_Decennial_Cycles::assets( array( 'error' => 'x' ), $enabled ) );
		$this->assertSame( array(), TIA_Elements_Decennial_Cycles::assets( array( 'assets' => 'x' ), $enabled ) );
	}

	/**
	 * The table becomes the first curve's datapoints, every row kept.
	 */
	public function test_data_keeps_the_first_curve(): void {
		$data = TIA_Elements_Decennial_Cycles::data(
			'dji',
			array(
				'columns' => array( 'Gain', 'Other' ),
				'index'   => array( 0, 1 / 366, 9.5 ),
				'data'    => array( array( 0.0, 7 ), array( 1, 8 ), array( null, 9 ) ),
			)
		);

		$this->assertSame(
			array(
				'id'    => 'dji',
				'curve' => array(
					'name'       => 'Gain',
					'datapoints' => array(
						array(
							'dec'   => 0,
							'value' => 0.0,
						),
						array(
							'dec'   => 1 / 366,
							'value' => 1,
						),
						array(
							'dec'   => 9.5,
							'value' => null,
						),
					),
				),
			),
			$data
		);
	}

	/**
	 * A table without a column has no curve.
	 */
	public function test_data_without_a_column_has_no_curve(): void {
		$this->assertSame(
			array(
				'id'    => 'dji',
				'curve' => null,
			),
			TIA_Elements_Decennial_Cycles::data(
				'dji',
				array(
					'columns' => array(),
					'index'   => array(),
					'data'    => array(),
				)
			)
		);
	}

	/**
	 * A table of the wrong shape gives null.
	 *
	 * @param array<string, mixed> $table The upstream table.
	 */
	#[DataProvider( 'bad_tables' )]
	public function test_data_rejects_bad_shape( array $table ): void {
		$this->assertNull( TIA_Elements_Decennial_Cycles::data( 'dji', $table ) );
	}

	/**
	 * Tables of the wrong shape.
	 *
	 * @return array<string, array{array<string, mixed>}>
	 */
	public static function bad_tables(): array {
		$good = array(
			'columns' => array( 'Gain' ),
			'index'   => array( 0.0 ),
			'data'    => array( array( 0.5 ) ),
		);
		return array(
			'upstream error body'        => array( array( 'error' => 'Invalid asset ID' ) ),
			'no index'                   => array( array( 'index' => null ) + $good ),
			'fewer rows than index'      => array( array( 'index' => array( 0.0, 0.5 ) ) + $good ),
			'row too short'              => array( array( 'data' => array( array() ) ) + $good ),
			'row not a list'             => array( array( 'data' => array( 0.5 ) ) + $good ),
			'a value is a string'        => array( array( 'data' => array( array( '0.5' ) ) ) + $good ),
			'an index is not a number'   => array( array( 'index' => array( '0' ) ) + $good ),
			'the column is not a string' => array( array( 'columns' => array( 0 ) ) + $good ),
			'columns not a list'         => array( array( 'columns' => array( 'a' => 'Gain' ) ) + $good ),
		);
	}
}
