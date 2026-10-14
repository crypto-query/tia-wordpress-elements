<?php
/**
 * The Forward Returns transforms: the asset list and one asset's Years and months.
 *
 * @package tia-wordpress-elements
 */

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../includes/class-tia-elements-forward-returns.php';

/**
 * Exercises TIA_Elements_Forward_Returns with upstream rows, without WordPress.
 */
final class ForwardReturnsTest extends TestCase {

	/**
	 * One enabled asset.
	 *
	 * @param string $base  Asset base.
	 * @param string $quote Asset quote.
	 * @param string $group Crypto, Stocks, Metals or Indices.
	 * @return array{base: string, quote: string, group: string}
	 */
	private static function enabled( string $base, string $quote, string $group ): array {
		return array(
			'base'  => $base,
			'quote' => $quote,
			'group' => $group,
		);
	}

	/**
	 * One asset list row.
	 *
	 * @param string $title  Asset title.
	 * @param string $base   Asset base.
	 * @param string $quote  Asset quote.
	 * @param int    $period Holding Period in months.
	 * @return array<string, mixed>
	 */
	private static function row( string $title, string $base, string $quote, int $period ): array {
		return array(
			'title'  => $title,
			'base'   => $base,
			'quote'  => $quote,
			'period' => $period,
		);
	}

	/**
	 * A row is kept only when its base and quote pair is enabled, not its base alone.
	 */
	public function test_assets_keep_only_enabled_pairs(): void {
		$assets = TIA_Elements_Forward_Returns::assets(
			array(
				self::row( 'Bitcoin - BTC', 'btc', 'usd', 1 ),
				self::row( 'Bitcoin - BTC/EUR', 'btc', 'eur', 1 ),
				self::row( 'Dogecoin - DOGE', 'doge', 'usd', 1 ),
			),
			array( self::enabled( 'btc', 'usd', 'Crypto' ), self::enabled( 'sol', 'usd', 'Crypto' ) )
		);

		$this->assertSame(
			array(
				array(
					'title'   => 'Bitcoin - BTC',
					'base'    => 'btc',
					'quote'   => 'usd',
					'group'   => 'Crypto',
					'periods' => array( 1 ),
				),
			),
			$assets
		);
	}

	/**
	 * Rows group by pair, with the periods ascending as integers.
	 */
	public function test_assets_group_rows_and_sort_periods(): void {
		$assets = TIA_Elements_Forward_Returns::assets(
			array(
				self::row( 'Bitcoin - BTC', 'btc', 'usd', 12 ),
				self::row( 'Bitcoin - BTC', 'btc', 'usd', 1 ),
				self::row( 'Bitcoin - BTC', 'btc', 'usd', 6 ),
				array(
					'title'  => 'Bitcoin - BTC',
					'base'   => 'btc',
					'quote'  => 'usd',
					'period' => '3',
				),
			),
			array( self::enabled( 'btc', 'usd', 'Crypto' ) )
		);

		$this->assertSame( array( 1, 3, 6, 12 ), $assets[0]['periods'] );
		$this->assertCount( 1, $assets );
	}

	/**
	 * Groups run Crypto, Stocks, Metals, Indices; each group runs alphabetical by title.
	 */
	public function test_assets_order_by_group_then_title(): void {
		$assets = TIA_Elements_Forward_Returns::assets(
			array(
				self::row( 'S&P 500 - SPX', '^spx', 'usd', 1 ),
				self::row( 'Gold - XAUUSD', 'xauusd', 'usd', 1 ),
				self::row( 'Solana - SOL', 'sol', 'usd', 1 ),
				self::row( 'ASX 200 - XJO', 'xjo.indx', 'aud', 1 ),
				self::row( 'Apple - AAPL', 'aapl', 'usd', 1 ),
				self::row( 'Bitcoin - BTC', 'btc', 'usd', 1 ),
			),
			array(
				self::enabled( '^spx', 'usd', 'Indices' ),
				self::enabled( 'xjo.indx', 'aud', 'Indices' ),
				self::enabled( 'xauusd', 'usd', 'Metals' ),
				self::enabled( 'aapl', 'usd', 'Stocks' ),
				self::enabled( 'sol', 'usd', 'Crypto' ),
				self::enabled( 'btc', 'usd', 'Crypto' ),
			)
		);

		$this->assertSame(
			array( 'Bitcoin - BTC', 'Solana - SOL', 'Apple - AAPL', 'Gold - XAUUSD', 'ASX 200 - XJO', 'S&P 500 - SPX' ),
			array_column( $assets, 'title' )
		);
	}

	/**
	 * Without rows there are no assets.
	 */
	public function test_assets_empty_rows(): void {
		$this->assertSame( array(), TIA_Elements_Forward_Returns::assets( array(), array( self::enabled( 'btc', 'usd', 'Crypto' ) ) ) );
	}

	/**
	 * The title is the upper-case base; Years run newest first, months 1 to 12, as integers.
	 */
	public function test_data_sorts_years_and_months(): void {
		$data = TIA_Elements_Forward_Returns::data(
			'btc',
			'usd',
			array(
				'title'  => 'Bitcoin - BTC',
				'period' => 3,
				'data'   => array(
					'2023' => array(
						'2' => -2.1,
						'1' => 3.21,
					),
					'2025' => array( '1' => 1.5 ),
					'2024' => array(
						12 => 4,
						1  => 0.5,
					),
				),
			)
		);

		$this->assertSame(
			array(
				'title'   => 'BTC',
				'base'    => 'btc',
				'quote'   => 'usd',
				'periods' => array(
					array(
						'period'  => 3,
						'returns' => array(
							array(
								'year'   => 2025,
								'months' => array(
									array(
										'month' => 1,
										'value' => 1.5,
									),
								),
							),
							array(
								'year'   => 2024,
								'months' => array(
									array(
										'month' => 1,
										'value' => 0.5,
									),
									array(
										'month' => 12,
										'value' => 4,
									),
								),
							),
							array(
								'year'   => 2023,
								'months' => array(
									array(
										'month' => 1,
										'value' => 3.21,
									),
									array(
										'month' => 2,
										'value' => -2.1,
									),
								),
							),
						),
					),
				),
			),
			$data
		);
	}

	/**
	 * A real 0 stays 0, null stays null, and a Year with only null months still shows.
	 */
	public function test_data_keeps_zero_null_and_all_null_years(): void {
		$data = TIA_Elements_Forward_Returns::data(
			'^dji',
			'usd',
			array(
				'period' => 1,
				'data'   => array(
					2024 => array(
						1 => 0,
						2 => null,
					),
					2025 => array(
						1 => null,
						2 => null,
					),
				),
			)
		);

		$this->assertSame( '^DJI', $data['title'] );
		$this->assertSame(
			array(
				array(
					'year'   => 2025,
					'months' => array(
						array(
							'month' => 1,
							'value' => null,
						),
						array(
							'month' => 2,
							'value' => null,
						),
					),
				),
				array(
					'year'   => 2024,
					'months' => array(
						array(
							'month' => 1,
							'value' => 0,
						),
						array(
							'month' => 2,
							'value' => null,
						),
					),
				),
			),
			$data['periods'][0]['returns']
		);
	}
}
