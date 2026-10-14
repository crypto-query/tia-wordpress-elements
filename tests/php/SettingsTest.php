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
