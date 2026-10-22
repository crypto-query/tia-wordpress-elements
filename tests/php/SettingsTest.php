<?php
/**
 * The settings reader: where each value comes from, and what a form submit keeps.
 *
 * @package tia-wordpress-elements
 */

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../includes/class-tia-elements-settings.php';

/**
 * Exercises TIA_Elements_Settings through its public interface, without WordPress.
 */
final class SettingsTest extends TestCase {

	/**
	 * A non-empty constant wins over a saved option.
	 */
	public function test_constant_beats_option(): void {
		$settings = new TIA_Elements_Settings(
			array( 'tia_stripe_key' => 'rk_option' ),
			array( 'TIA_STRIPE_KEY' => ' rk_constant ' )
		);

		$this->assertSame(
			array(
				'value'  => 'rk_constant',
				'source' => 'constant',
			),
			$settings->get( 'stripe_key' )
		);
	}

	/**
	 * An empty or whitespace constant does not hide the saved option.
	 */
	public function test_blank_constant_is_ignored(): void {
		foreach ( array( '', '   ' ) as $blank ) {
			$settings = new TIA_Elements_Settings(
				array( 'tia_supabase_url' => 'https://option.example' ),
				array( 'TIA_SUPABASE_URL' => $blank )
			);

			$this->assertSame(
				array(
					'value'  => 'https://option.example',
					'source' => 'option',
				),
				$settings->get( 'supabase_url' )
			);
		}
	}

	/**
	 * A saved option wins over the default.
	 */
	public function test_option_beats_default(): void {
		$settings = new TIA_Elements_Settings( array( 'tia_data_server_url' => 'https://other.example' ), array() );

		$this->assertSame(
			array(
				'value'  => 'https://other.example',
				'source' => 'option',
			),
			$settings->get( 'data_server_url' )
		);
	}

	/**
	 * Without constant or option, the data server URL and suite product fall back to their defaults.
	 */
	public function test_defaults_apply_when_nothing_is_set(): void {
		$settings = new TIA_Elements_Settings( array(), array() );

		$this->assertSame(
			array(
				'value'  => 'https://tia-data-server.cryptoquery.eu',
				'source' => 'default',
			),
			$settings->get( 'data_server_url' )
		);
		$this->assertSame(
			array(
				'value'  => 'prod_QhxKPj5ay8NjPH',
				'source' => 'default',
			),
			$settings->get( 'stripe_suite_product' )
		);
	}

	/**
	 * An empty saved option falls through to the default.
	 */
	public function test_empty_option_falls_to_default(): void {
		$settings = new TIA_Elements_Settings( array( 'tia_stripe_suite_product' => '' ), array() );

		$this->assertSame(
			array(
				'value'  => 'prod_QhxKPj5ay8NjPH',
				'source' => 'default',
			),
			$settings->get( 'stripe_suite_product' )
		);
	}

	/**
	 * A field with no constant, no option and no default is unset.
	 */
	public function test_unset_without_default(): void {
		$settings = new TIA_Elements_Settings( array(), array() );

		foreach ( array( 'supabase_url', 'supabase_key', 'stripe_key' ) as $key ) {
			$this->assertSame(
				array(
					'value'  => '',
					'source' => 'unset',
				),
				$settings->get( $key )
			);
		}
	}

	/**
	 * An unknown key is a programming error.
	 */
	public function test_unknown_key_throws(): void {
		$this->expectException( InvalidArgumentException::class );

		( new TIA_Elements_Settings( array(), array() ) )->get( 'nope' );
	}

	/**
	 * The default member role applies only while the option was never saved.
	 */
	public function test_member_roles_default_only_when_never_saved(): void {
		$this->assertSame(
			array(
				'value'  => array( 'tia_pro_-_annual' ),
				'source' => 'default',
			),
			( new TIA_Elements_Settings( array(), array() ) )->stored_member_roles()
		);
		$this->assertSame(
			array(
				'value'  => array( 'subscriber', 'editor' ),
				'source' => 'option',
			),
			( new TIA_Elements_Settings( array( 'tia_member_roles' => array( 'subscriber', 'editor' ) ), array() ) )->stored_member_roles()
		);
	}

	/**
	 * A saved empty list grants no role.
	 */
	public function test_saved_empty_member_roles_stay_empty(): void {
		$this->assertSame(
			array(
				'value'  => array(),
				'source' => 'option',
			),
			( new TIA_Elements_Settings( array( 'tia_member_roles' => array() ), array() ) )->stored_member_roles()
		);
	}

	/**
	 * Without a saved list, the Forward Returns assets are the ten reference assets with their groups.
	 */
	public function test_forward_returns_assets_default(): void {
		$expected = array(
			array( 'btc', 'usd', 'Crypto' ),
			array( 'eth', 'usd', 'Crypto' ),
			array( 'sol', 'usd', 'Crypto' ),
			array( 'xauusd', 'usd', 'Metals' ),
			array( 'xagusd', 'usd', 'Metals' ),
			array( '^dji', 'usd', 'Indices' ),
			array( '^ndx', 'usd', 'Indices' ),
			array( '^spx', 'usd', 'Indices' ),
			array( 'xjo.indx', 'aud', 'Indices' ),
			array( 'xao.indx', 'aud', 'Indices' ),
		);

		foreach ( array( array(), array( 'tia_forward_returns_assets' => '' ) ) as $options ) {
			$assets = ( new TIA_Elements_Settings( $options, array() ) )->forward_returns_assets();

			$this->assertSame( $expected, array_map( static fn( $asset ) => array( $asset['base'], $asset['quote'], $asset['group'] ), $assets ) );
		}
	}

	/**
	 * A saved list replaces the default, even when empty.
	 */
	public function test_forward_returns_assets_saved(): void {
		$saved = array(
			array(
				'base'  => 'aapl',
				'quote' => 'usd',
				'group' => 'Stocks',
			),
		);

		$this->assertSame( $saved, ( new TIA_Elements_Settings( array( 'tia_forward_returns_assets' => $saved ), array() ) )->forward_returns_assets() );
		$this->assertSame( array(), ( new TIA_Elements_Settings( array( 'tia_forward_returns_assets' => array() ), array() ) )->forward_returns_assets() );
	}

	/**
	 * Without a saved list, the Predictive Cycles assets are all nine with their groups.
	 */
	public function test_predictive_cycles_assets_default(): void {
		$expected = array(
			array( 'btc', 'Crypto' ),
			array( 'eth', 'Crypto' ),
			array( 'xau', 'Metals' ),
			array( 'xag', 'Metals' ),
			array( 'dji', 'Indices' ),
			array( 'spx', 'Indices' ),
			array( 'ndx', 'Indices' ),
			array( 'xjo', 'Indices' ),
			array( 'xao', 'Indices' ),
		);

		foreach ( array( array(), array( 'tia_predictive_cycles_assets' => '' ) ) as $options ) {
			$assets = ( new TIA_Elements_Settings( $options, array() ) )->predictive_cycles_assets();

			$this->assertSame( $expected, array_map( static fn( $asset ) => array( $asset['id'], $asset['group'] ), $assets ) );
		}
	}

	/**
	 * A saved list replaces the default, even when empty; malformed entries are dropped.
	 */
	public function test_predictive_cycles_assets_saved(): void {
		$saved = array(
			array(
				'id'    => 'aapl',
				'group' => 'Stocks',
			),
		);

		$this->assertSame( $saved, ( new TIA_Elements_Settings( array( 'tia_predictive_cycles_assets' => array( ...$saved, array( 'id' => 'eth' ), 'btc' ) ), array() ) )->predictive_cycles_assets() );
		$this->assertSame( array(), ( new TIA_Elements_Settings( array( 'tia_predictive_cycles_assets' => array() ), array() ) )->predictive_cycles_assets() );
	}

	/**
	 * Without a saved list, the Decennial Cycles assets are the five indices.
	 */
	public function test_decennial_cycles_assets_default(): void {
		$expected = array(
			array( 'dji', 'Indices' ),
			array( 'spx', 'Indices' ),
			array( 'ndx', 'Indices' ),
			array( 'xjo', 'Indices' ),
			array( 'xao', 'Indices' ),
		);

		foreach ( array( array(), array( 'tia_decennial_cycles_assets' => '' ) ) as $options ) {
			$assets = ( new TIA_Elements_Settings( $options, array() ) )->decennial_cycles_assets();

			$this->assertSame( $expected, array_map( static fn( $asset ) => array( $asset['id'], $asset['group'] ), $assets ) );
		}
	}

	/**
	 * A saved Decennial Cycles list replaces the default, even when empty; malformed entries are dropped.
	 */
	public function test_decennial_cycles_assets_saved(): void {
		$saved = array(
			array(
				'id'    => 'dji',
				'group' => 'Indices',
			),
		);

		$this->assertSame( $saved, ( new TIA_Elements_Settings( array( 'tia_decennial_cycles_assets' => array( ...$saved, array( 'id' => 'spx' ), 'ndx' ) ), array() ) )->decennial_cycles_assets() );
		$this->assertSame( array(), ( new TIA_Elements_Settings( array( 'tia_decennial_cycles_assets' => array() ), array() ) )->decennial_cycles_assets() );
	}

	/**
	 * A field absent from the form keeps the stored value, secret or not.
	 */
	public function test_absent_input_keeps_stored(): void {
		$this->assertSame( 'rk_stored', TIA_Elements_Settings::submitted_text( null, 'rk_stored', true ) );
		$this->assertSame( 'https://stored.example', TIA_Elements_Settings::submitted_text( null, 'https://stored.example', false ) );
	}

	/**
	 * A blank secret keeps the stored secret; a blank plain field clears it.
	 */
	public function test_blank_input(): void {
		$this->assertSame( 'rk_stored', TIA_Elements_Settings::submitted_text( '  ', 'rk_stored', true ) );
		$this->assertSame( '', TIA_Elements_Settings::submitted_text( '', 'https://stored.example', false ) );
	}

	/**
	 * A submitted value is trimmed and replaces the stored one.
	 */
	public function test_submitted_value_is_trimmed(): void {
		$this->assertSame( 'rk_new', TIA_Elements_Settings::submitted_text( ' rk_new ', 'rk_stored', true ) );
		$this->assertSame( 'prod_new', TIA_Elements_Settings::submitted_text( "prod_new\n", 'prod_old', false ) );
	}

	/**
	 * Submitted roles keep only existing role slugs, once each.
	 */
	public function test_submitted_roles_keep_only_existing_roles(): void {
		$this->assertSame(
			array( 'editor', 'tia_pro_-_annual' ),
			TIA_Elements_Settings::submitted_roles(
				array( 'ghost', 'editor', 42, 'tia_pro_-_annual', 'editor', array( 'x' ) ),
				array( 'administrator', 'editor', 'tia_pro_-_annual' )
			)
		);
	}

	/**
	 * No roles in the form (all boxes unchecked) saves an empty list.
	 */
	public function test_submitted_roles_non_array_is_empty(): void {
		$this->assertSame( array(), TIA_Elements_Settings::submitted_roles( null, array( 'editor' ) ) );
		$this->assertSame( array(), TIA_Elements_Settings::submitted_roles( 'editor', array( 'editor' ) ) );
	}

	/**
	 * Submitted roles match the default when they equal the default roles that exist, in any order.
	 */
	public function test_matches_default_roles(): void {
		$this->assertTrue( TIA_Elements_Settings::matches_default_roles( array( 'tia_pro_-_annual' ), array( 'editor', 'tia_pro_-_annual' ) ) );
		$this->assertTrue( TIA_Elements_Settings::matches_default_roles( array(), array( 'editor' ) ) );
		$this->assertFalse( TIA_Elements_Settings::matches_default_roles( array(), array( 'editor', 'tia_pro_-_annual' ) ) );
		$this->assertFalse( TIA_Elements_Settings::matches_default_roles( array( 'tia_pro_-_annual', 'editor' ), array( 'editor', 'tia_pro_-_annual' ) ) );
		$this->assertFalse( TIA_Elements_Settings::matches_default_roles( array( 'editor' ), array( 'editor' ) ) );
	}

	/**
	 * Every upstream asset once, then each enabled asset upstream lacks, by group and then label; no group comes last.
	 */
	public function test_asset_rows(): void {
		$rows     = array(
			array(
				'title'  => 'Ethereum - ETH',
				'base'   => 'eth',
				'quote'  => 'usd',
				'period' => 1,
			),
			array(
				'title'  => 'bitcoin - BTC',
				'base'   => 'btc',
				'quote'  => 'usd',
				'period' => 1,
			),
			array(
				'title'  => 'bitcoin - BTC',
				'base'   => 'btc',
				'quote'  => 'usd',
				'period' => 3,
			),
			array(
				'title' => 'Apple - AAPL',
				'base'  => 'aapl',
				'quote' => 'usd',
			),
			array(
				'title' => 'Dow - DJI',
				'base'  => '^dji',
				'quote' => 'usd',
			),
			array(
				'title' => 'New - NEW',
				'base'  => 'new',
				'quote' => 'usd',
			),
			array(
				'title' => 'No quote',
				'base'  => 'x',
			),
			'junk',
		);
		$enabled  = array(
			array(
				'base'  => 'aapl',
				'quote' => 'usd',
				'group' => 'Stocks',
			),
			array(
				'base'  => 'btc',
				'quote' => 'usd',
				'group' => 'Crypto',
			),
			array(
				'base'  => 'gone',
				'quote' => 'usd',
				'group' => 'Metals',
			),
		);
		$defaults = ( new TIA_Elements_Settings( array(), array() ) )->forward_returns_assets();

		$this->assertSame(
			array(
				array( 'btc/usd', 'bitcoin - BTC', 'Crypto', true, true ),
				array( 'eth/usd', 'Ethereum - ETH', 'Crypto', false, true ),
				array( 'aapl/usd', 'Apple - AAPL', 'Stocks', true, true ),
				array( 'gone/usd', 'gone/usd', 'Metals', true, false ),
				array( '^dji/usd', 'Dow - DJI', 'Indices', false, true ),
				array( 'new/usd', 'New - NEW', '', false, true ),
			),
			array_map(
				static fn( $row ) => array( implode( '/', $row['asset'] ), $row['label'], $row['group'], $row['enabled'], $row['upstream'] ),
				TIA_Elements_Settings::asset_rows( $rows, array( 'base', 'quote' ), 'title', $enabled, $defaults )
			)
		);
	}

	/**
	 * An id-keyed field reads the id and labels by name.
	 */
	public function test_asset_rows_by_id(): void {
		$items = array(
			array(
				'id'   => 'spx',
				'name' => 'S&P 500 - SPX',
			),
			array( 'id' => 'nameless' ),
		);

		$this->assertSame(
			array(
				array(
					'asset'    => array( 'id' => 'spx' ),
					'label'    => 'S&P 500 - SPX',
					'group'    => 'Indices',
					'enabled'  => true,
					'upstream' => true,
				),
			),
			TIA_Elements_Settings::asset_rows( $items, array( 'id' ), 'name', array_slice( ( new TIA_Elements_Settings( array(), array() ) )->decennial_cycles_assets(), 1, 1 ), array() )
		);
	}

	/**
	 * An asset field absent from the form, read-only or never rendered, keeps the stored value.
	 */
	public function test_absent_asset_field_keeps_stored(): void {
		$stored = array(
			array(
				'id'    => 'btc',
				'group' => 'Crypto',
			),
		);

		$this->assertSame( $stored, TIA_Elements_Settings::submitted_assets( null, array( 'id' ), $stored, array() ) );
		$this->assertFalse( TIA_Elements_Settings::submitted_assets( null, array( 'id' ), false, array() ) );
	}

	/**
	 * Only enabled rows with a valid group and the field's own keys are saved, once each.
	 */
	public function test_submitted_assets_keep_valid_rows(): void {
		$input = array(
			array(
				'base'    => 'btc',
				'quote'   => 'usd',
				'group'   => 'Crypto',
				'enabled' => '1',
				'title'   => 'dropped',
			),
			array(
				'base'    => 'btc',
				'quote'   => 'usd',
				'group'   => 'Stocks',
				'enabled' => '1',
			),
			array(
				'base'    => 'eth',
				'quote'   => 'usd',
				'group'   => 'Bonds',
				'enabled' => '1',
			),
			array(
				'base'    => 'sol',
				'group'   => 'Crypto',
				'enabled' => '1',
			),
			array(
				'base'  => 'xag',
				'quote' => 'usd',
				'group' => 'Metals',
			),
			'junk',
		);

		$this->assertSame(
			array(
				array(
					'base'  => 'btc',
					'quote' => 'usd',
					'group' => 'Stocks',
				),
			),
			TIA_Elements_Settings::submitted_assets( array( 'rows' => $input ), array( 'base', 'quote' ), array(), array() )
		);
	}

	/**
	 * An unchecked row leaves the list, an asset upstream dropped included; an enabled row without a group is reported.
	 */
	public function test_submitted_assets_save_only_checked_rows(): void {
		$stored = array(
			array(
				'id'    => 'gone',
				'group' => 'Metals',
			),
		);
		$input  = array(
			array(
				'id'    => 'gone',
				'group' => 'Metals',
			),
			array(
				'id'      => 'btc',
				'group'   => 'Crypto',
				'enabled' => '1',
			),
			array(
				'id'      => 'new',
				'group'   => '',
				'enabled' => '1',
			),
		);

		$ungrouped = array();
		$this->assertSame( array( $input[1] ), array_map( static fn( $asset ) => $asset + array( 'enabled' => '1' ), TIA_Elements_Settings::submitted_assets( array( 'rows' => $input ), array( 'id' ), $stored, array(), $ungrouped ) ) );
		$this->assertSame( array( 'new' ), $ungrouped );
	}

	/**
	 * An asset list, as add_option() passes the sanitized value back in, keeps its valid assets.
	 */
	public function test_submitted_asset_list_is_sanitized_again(): void {
		$list = array(
			array(
				'id'    => 'btc',
				'group' => 'Crypto',
			),
			array(
				'id'    => 'eth',
				'group' => 'Bonds',
			),
		);

		$this->assertSame( array( $list[0] ), TIA_Elements_Settings::submitted_assets( $list, array( 'id' ), false, array() ) );
	}

	/**
	 * A never-saved field stays unsaved while the submit equals the default; a change saves it.
	 */
	public function test_submitted_assets_keep_default_unsaved(): void {
		$defaults = ( new TIA_Elements_Settings( array(), array() ) )->decennial_cycles_assets();
		$shown    = array_map( static fn( $asset ) => $asset + array( 'enabled' => '1' ), $defaults );

		$this->assertFalse( TIA_Elements_Settings::submitted_assets( array( 'rows' => array_reverse( $shown ) ), array( 'id' ), false, $defaults ) );

		unset( $shown[0]['enabled'] );
		$this->assertSame( array_slice( $defaults, 1 ), TIA_Elements_Settings::submitted_assets( array( 'rows' => $shown ), array( 'id' ), false, $defaults ) );
	}

	/**
	 * Uninstall deletes exactly these nine options, the asset lists included.
	 */
	public function test_options_lists_all_nine(): void {
		$expected = array(
			'tia_supabase_url',
			'tia_supabase_key',
			'tia_data_server_url',
			'tia_stripe_key',
			'tia_stripe_suite_product',
			'tia_member_roles',
			'tia_forward_returns_assets',
			'tia_predictive_cycles_assets',
			'tia_decennial_cycles_assets',
		);
		$actual   = TIA_Elements_Settings::OPTIONS;
		sort( $expected );
		sort( $actual );

		$this->assertSame( $expected, $actual );
	}

	/**
	 * Request timeouts in seconds.
	 */
	public function test_timeouts(): void {
		$this->assertSame( 10, TIA_Elements_Settings::SUPABASE_TIMEOUT );
		$this->assertSame( 10, TIA_Elements_Settings::DATA_SERVER_TIMEOUT );
		$this->assertSame( 5, TIA_Elements_Settings::STRIPE_TIMEOUT );
	}
}
