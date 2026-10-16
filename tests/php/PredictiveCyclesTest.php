<?php
/**
 * The Predictive Cycles transforms.
 *
 * @package tia-wordpress-elements
 */

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../includes/class-tia-elements-predictive-cycles.php';

/**
 * Exercises TIA_Elements_Predictive_Cycles with upstream payloads, without WordPress.
 */
final class PredictiveCyclesTest extends TestCase {

	private const JAN_1 = 1_767_225_600_000;
	private const DAY   = 86_400_000;

	/**
	 * One upstream asset with an Actual, a year-curve and a static curve.
	 *
	 * @param string $id   Asset id.
	 * @param string $name Asset name.
	 * @return array<string, mixed>
	 */
	private static function upstream_asset( string $id, string $name ): array {
		return array(
			'id'         => $id,
			'base'       => '^' . $id,
			'quote'      => 'usd',
			'name'       => $name,
			'title'      => $name . ' Curves vs. Actual',
			'range'      => array(
				'begin' => 1897,
				'end'   => 2026,
			),
			'base_years' => array( 2024, 2026, 2025 ),
			'curves'     => array(
				array(
					'id'    => 0,
					'label' => 'Actual',
					'info'  => 'Actual returns for the year',
				),
				array(
					'id'    => 3,
					'label' => 'Y1 Post-election',
					'info'  => 'Average returns for post-election years',
					'years' => array( 2013, 2017, 2021 ),
				),
				array(
					'id'     => 2,
					'label'  => '20 & 60',
					'static' => array( 20, 60 ),
				),
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
	 * The asset list unwraps `assets`, renames `label` to `name`, adds the group and sorts Base Years newest first.
	 */
	public function test_assets_shape(): void {
		$assets = TIA_Elements_Predictive_Cycles::assets(
			array( 'assets' => array( self::upstream_asset( 'dji', 'Dow Jones Industrial - DJI' ) ) ),
			array( self::enabled( 'dji', 'Indices' ) )
		);

		$this->assertSame(
			array(
				array(
					'id'         => 'dji',
					'name'       => 'Dow Jones Industrial - DJI',
					'title'      => 'Dow Jones Industrial - DJI Curves vs. Actual',
					'range'      => array(
						'begin' => 1897,
						'end'   => 2026,
					),
					'base'       => '^dji',
					'quote'      => 'usd',
					'group'      => 'Indices',
					'base_years' => array( 2026, 2025, 2024 ),
					'curves'     => array(
						array(
							'id'   => 0,
							'name' => 'Actual',
							'info' => 'Actual returns for the year',
						),
						array(
							'id'    => 3,
							'name'  => 'Y1 Post-election',
							'info'  => 'Average returns for post-election years',
							'years' => array( 2013, 2017, 2021 ),
						),
						array(
							'id'     => 2,
							'name'   => '20 & 60',
							'static' => array( 20, 60 ),
						),
					),
				),
			),
			$assets
		);
	}

	/**
	 * Only enabled assets that upstream has; groups in order Crypto, Stocks, Metals, Indices, then by name.
	 */
	public function test_assets_filter_and_order(): void {
		$upstream = array(
			'assets' => array(
				self::upstream_asset( 'spx', 'S&P 500 - SPX' ),
				self::upstream_asset( 'xau', 'Gold - XAU' ),
				self::upstream_asset( 'foo', 'Not enabled' ),
				self::upstream_asset( 'eth', 'ethereum - ETH' ),
				self::upstream_asset( 'dji', 'Dow Jones Industrial - DJI' ),
				self::upstream_asset( 'btc', 'Bitcoin - BTC' ),
				self::upstream_asset( 'aapl', 'Apple' ),
			),
		);
		$enabled  = array(
			self::enabled( 'btc', 'Crypto' ),
			self::enabled( 'eth', 'Crypto' ),
			self::enabled( 'xau', 'Metals' ),
			self::enabled( 'dji', 'Indices' ),
			self::enabled( 'spx', 'Indices' ),
			self::enabled( 'aapl', 'Stocks' ),
			self::enabled( 'gone', 'Indices' ),
		);

		$assets = TIA_Elements_Predictive_Cycles::assets( $upstream, $enabled );

		$this->assertSame( array( 'btc', 'eth', 'aapl', 'xau', 'dji', 'spx' ), array_column( $assets, 'id' ) );
	}

	/**
	 * Malformed upstream items and curves are skipped; a payload without `assets` gives none.
	 */
	public function test_assets_skip_malformed(): void {
		$bad_curves             = self::upstream_asset( 'eth', 'Ethereum' );
		$bad_curves['curves'][] = array( 'label' => 'No id' );
		$bad_curves['curves'][] = 'Actual';
		$no_years               = self::upstream_asset( 'xau', 'Gold' );
		unset( $no_years['base_years'] );
		$no_name = self::upstream_asset( 'xag', 'Silver' );
		unset( $no_name['name'] );
		$enabled = array_map( static fn( $id ) => self::enabled( $id, 'Crypto' ), array( 'btc', 'eth', 'xau', 'xag' ) );

		$assets = TIA_Elements_Predictive_Cycles::assets( array( 'assets' => array( 'btc', array( 'id' => 'btc' ), $no_years, $no_name, $bad_curves ) ), $enabled );

		$this->assertSame( array( 'eth' ), array_column( $assets, 'id' ) );
		$this->assertSame( array( 0, 3, 2 ), array_column( $assets[0]['curves'], 'id' ) );
		$this->assertSame( array(), TIA_Elements_Predictive_Cycles::assets( array( 'error' => 'x' ), $enabled ) );
		$this->assertSame( array(), TIA_Elements_Predictive_Cycles::assets( array( 'assets' => 'x' ), $enabled ) );
	}

	/**
	 * The table becomes one point list per curve, columns in upstream order, ids kept.
	 */
	public function test_data_pivots_the_table(): void {
		$data = TIA_Elements_Predictive_Cycles::data(
			'btc',
			2026,
			array(
				'ids'     => array( 3, 0 ),
				'columns' => array( 'Y1 Post-election', 'Actual' ),
				'index'   => array( self::JAN_1, self::JAN_1 + self::DAY, self::JAN_1 + 2 * self::DAY ),
				'data'    => array( array( 0.5, -1.25 ), array( 1, 0 ), array( 2.75, null ) ),
			)
		);

		$this->assertSame(
			array(
				'id'        => 'btc',
				'base_year' => 2026,
				'curves'    => array(
					array(
						'id'     => 3,
						'name'   => 'Y1 Post-election',
						'points' => array( array( self::JAN_1, 0.5 ), array( self::JAN_1 + self::DAY, 1 ), array( self::JAN_1 + 2 * self::DAY, 2.75 ) ),
					),
					array(
						'id'     => 0,
						'name'   => 'Actual',
						'points' => array( array( self::JAN_1, -1.25 ), array( self::JAN_1 + self::DAY, 0 ), array( self::JAN_1 + 2 * self::DAY, null ) ),
					),
				),
			),
			$data
		);
	}

	/**
	 * A table of the wrong shape gives null.
	 *
	 * @param array<string, mixed> $table The upstream table.
	 */
	#[DataProvider( 'bad_tables' )]
	public function test_data_rejects_bad_shape( array $table ): void {
		$this->assertNull( TIA_Elements_Predictive_Cycles::data( 'btc', 2026, $table ) );
	}

	/**
	 * Tables of the wrong shape.
	 *
	 * @return array<string, array{array<string, mixed>}>
	 */
	public static function bad_tables(): array {
		$good = array(
			'ids'     => array( 0 ),
			'columns' => array( 'Actual' ),
			'index'   => array( self::JAN_1 ),
			'data'    => array( array( 1.5 ) ),
		);
		return array(
			'upstream error body'      => array( array( 'error' => 'Invalid asset ID' ) ),
			'ids longer than columns'  => array( array( 'ids' => array( 0, 1 ) ) + $good ),
			'fewer rows than index'    => array( array( 'index' => array( self::JAN_1, self::JAN_1 + self::DAY ) ) + $good ),
			'row too short'            => array( array( 'data' => array( array() ) ) + $good ),
			'a value is a string'      => array( array( 'data' => array( array( '1.5' ) ) ) + $good ),
			'an index is not a number' => array( array( 'index' => array( '2026-01-01' ) ) + $good ),
			'an id is not an integer'  => array( array( 'ids' => array( 'a' ) ) + $good ),
			'a column is not a string' => array( array( 'columns' => array( 0 ) ) + $good ),
		);
	}

	/**
	 * Values after the cut-off become null and stay in place; no cut-off changes nothing.
	 */
	public function test_cut(): void {
		$points = array( array( self::JAN_1, 1.5 ), array( self::JAN_1 + self::DAY, 2 ), array( self::JAN_1 + 2 * self::DAY, null ) );
		$data   = array(
			'id'        => 'btc',
			'base_year' => 2026,
			'curves'    => array(
				array(
					'id'     => 0,
					'name'   => 'Actual',
					'points' => $points,
				),
			),
		);

		$cut = TIA_Elements_Predictive_Cycles::cut( $data, self::JAN_1 );

		$this->assertSame( array( array( self::JAN_1, 1.5 ), array( self::JAN_1 + self::DAY, null ), array( self::JAN_1 + 2 * self::DAY, null ) ), $cut['curves'][0]['points'] );
		$this->assertSame( $data, TIA_Elements_Predictive_Cycles::cut( $data, null ) );
		$this->assertSame( $points, TIA_Elements_Predictive_Cycles::cut( $data, self::JAN_1 + 3 * self::DAY )['curves'][0]['points'] );
		$this->assertSame( array( null, null, null ), array_column( TIA_Elements_Predictive_Cycles::cut( $data, self::JAN_1 - 1 )['curves'][0]['points'], 1 ) );
	}

	/**
	 * A request body is checked against the enabled asset list.
	 *
	 * @param mixed $id        The asset id.
	 * @param mixed $base_year The Base Year.
	 * @param mixed $curves    The curves.
	 * @param bool  $valid     Whether the request is valid.
	 */
	#[DataProvider( 'requests' )]
	public function test_valid_request( mixed $id, mixed $base_year, mixed $curves, bool $valid ): void {
		$assets = TIA_Elements_Predictive_Cycles::assets(
			array( 'assets' => array( self::upstream_asset( 'dji', 'Dow Jones Industrial - DJI' ), self::upstream_asset( 'foo', 'Off' ) ) ),
			array( self::enabled( 'dji', 'Indices' ) )
		);

		$this->assertSame( $valid, TIA_Elements_Predictive_Cycles::valid_request( $assets, $id, $base_year, $curves ) );
	}

	/**
	 * Request bodies and whether each is valid.
	 *
	 * @return array<string, array{mixed, mixed, mixed, bool}>
	 */
	public static function requests(): array {
		$actual = array( 'id' => 0 );
		$static = array( 'id' => 2 );
		$y1     = static fn( array $years ) => array(
			'id'    => 3,
			'years' => $years,
		);
		return array(
			'every curve'                     => array( 'dji', 2026, array( $actual, $y1( array( 2013, 2017, 2021 ) ), $static ), true ),
			'a subset of curves and years'    => array( 'dji', 2024, array( $y1( array( 2017 ) ) ), true ),
			'id not enabled'                  => array( 'foo', 2026, array( $actual ), false ),
			'id unknown'                      => array( 'xyz', 2026, array( $actual ), false ),
			'id not a string'                 => array( 1, 2026, array( $actual ), false ),
			'Base Year not listed'            => array( 'dji', 2023, array( $actual ), false ),
			'Base Year not an integer'        => array( 'dji', '2026', array( $actual ), false ),
			'no curve'                        => array( 'dji', 2026, array(), false ),
			'curves not a list'               => array( 'dji', 2026, array( 'a' => $actual ), false ),
			'curve id unknown'                => array( 'dji', 2026, array( array( 'id' => 9 ) ), false ),
			'curve id not an integer'         => array( 'dji', 2026, array( array( 'id' => '0' ) ), false ),
			'curve not an object'             => array( 'dji', 2026, array( 0 ), false ),
			'duplicate curve id'              => array( 'dji', 2026, array( $actual, $actual ), false ),
			'more curves than the asset has'  => array( 'dji', 2026, array( $actual, $static, $y1( array( 2017 ) ), $actual ), false ),
			'year-curve without years'        => array( 'dji', 2026, array( array( 'id' => 3 ) ), false ),
			'year-curve with no year'         => array( 'dji', 2026, array( $y1( array() ) ), false ),
			'year-curve with an unknown year' => array( 'dji', 2026, array( $y1( array( 2017, 2019 ) ) ), false ),
			'year-curve with a repeated year' => array( 'dji', 2026, array( $y1( array( 2017, 2017 ) ) ), false ),
			'year as a string'                => array( 'dji', 2026, array( $y1( array( '2017' ) ) ), false ),
			'static curve with years'         => array(
				'dji',
				2026,
				array(
					array(
						'id'    => 2,
						'years' => array( 20 ),
					),
				),
				false,
			),
			'plain curve with empty years'    => array(
				'dji',
				2026,
				array(
					array(
						'id'    => 0,
						'years' => array(),
					),
				),
				false,
			),
		);
	}
}
