<?php
/**
 * The one settings reader: every connection value with its source.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * Resolves each setting from a wp-config constant, a saved option or a default.
 */
final class TIA_Elements_Settings {

	/** Request timeout in seconds for Supabase. */
	public const SUPABASE_TIMEOUT = 10;

	/** Request timeout in seconds for the data server. */
	public const DATA_SERVER_TIMEOUT = 10;

	/** Request timeout in seconds per Stripe call. */
	public const STRIPE_TIMEOUT = 5;

	/**
	 * Text fields keyed by short key.
	 *
	 * @var array<string, array{option: string, constant: string, secret: bool, default: string}>
	 */
	public const TEXT_FIELDS = array(
		'supabase_url'         => array(
			'option'   => 'tia_supabase_url',
			'constant' => 'TIA_SUPABASE_URL',
			'secret'   => false,
			'default'  => '',
		),
		'supabase_key'         => array(
			'option'   => 'tia_supabase_key',
			'constant' => 'TIA_SUPABASE_KEY',
			'secret'   => true,
			'default'  => '',
		),
		'data_server_url'      => array(
			'option'   => 'tia_data_server_url',
			'constant' => 'TIA_DATA_SERVER_URL',
			'secret'   => false,
			'default'  => 'https://tia-data-server.cryptoquery.eu',
		),
		'stripe_key'           => array(
			'option'   => 'tia_stripe_key',
			'constant' => 'TIA_STRIPE_KEY',
			'secret'   => true,
			'default'  => '',
		),
		'stripe_suite_product' => array(
			'option'   => 'tia_stripe_suite_product',
			'constant' => 'TIA_STRIPE_SUITE_PRODUCT',
			'secret'   => false,
			'default'  => 'prod_QhxKPj5ay8NjPH',
		),
	);

	public const MEMBER_ROLES_OPTION = 'tia_member_roles';

	public const MEMBER_ROLES_DEFAULT = array( 'tia_pro_-_annual' );

	/** The asset groups, in display order. */
	public const ASSET_GROUPS = array( 'Crypto', 'Stocks', 'Metals', 'Indices' );

	public const FORWARD_RETURNS_ASSETS_OPTION = 'tia_forward_returns_assets';

	/** Base, quote and group of each default Forward Returns asset. */
	private const FORWARD_RETURNS_ASSETS_DEFAULT = array(
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

	public const PREDICTIVE_CYCLES_ASSETS_OPTION = 'tia_predictive_cycles_assets';

	/** Id and group of each default Predictive Cycles asset. */
	private const PREDICTIVE_CYCLES_ASSETS_DEFAULT = array(
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

	public const DECENNIAL_CYCLES_ASSETS_OPTION = 'tia_decennial_cycles_assets';

	/** Ids of the default Decennial Cycles assets, all Indices. */
	private const DECENNIAL_CYCLES_ASSETS_DEFAULT = array( 'dji', 'spx', 'ndx', 'xjo', 'xao' );

	/** Every option the plugin stores; uninstall deletes them all. */
	public const OPTIONS = array(
		'tia_supabase_url',
		'tia_supabase_key',
		'tia_data_server_url',
		'tia_stripe_key',
		'tia_stripe_suite_product',
		self::MEMBER_ROLES_OPTION,
		self::FORWARD_RETURNS_ASSETS_OPTION,
		self::PREDICTIVE_CYCLES_ASSETS_OPTION,
		self::DECENNIAL_CYCLES_ASSETS_OPTION,
	);

	/**
	 * Saved options, option name => stored value.
	 *
	 * @var array<string, mixed>
	 */
	private array $options;

	/**
	 * Defined constants, constant name => value.
	 *
	 * @var array<string, mixed>
	 */
	private array $constants;

	/**
	 * Takes the saved options and the defined constants.
	 *
	 * @param array<string, mixed> $options   Option name => stored value; a missing name was never saved.
	 * @param array<string, mixed> $constants Constant name => value; a missing name is not defined.
	 */
	public function __construct( array $options, array $constants ) {
		$this->options   = $options;
		$this->constants = $constants;
	}

	/**
	 * Reads the saved options and the defined constants from WordPress.
	 */
	public static function from_wordpress(): self {
		$options   = array();
		$constants = array();
		foreach ( self::TEXT_FIELDS as $field ) {
			$options[ $field['option'] ] = get_option( $field['option'], null );
			if ( defined( $field['constant'] ) ) {
				$constants[ $field['constant'] ] = constant( $field['constant'] );
			}
		}
		$options[ self::MEMBER_ROLES_OPTION ]             = get_option( self::MEMBER_ROLES_OPTION, null );
		$options[ self::FORWARD_RETURNS_ASSETS_OPTION ]   = get_option( self::FORWARD_RETURNS_ASSETS_OPTION, null );
		$options[ self::PREDICTIVE_CYCLES_ASSETS_OPTION ] = get_option( self::PREDICTIVE_CYCLES_ASSETS_OPTION, null );
		$options[ self::DECENNIAL_CYCLES_ASSETS_OPTION ]  = get_option( self::DECENNIAL_CYCLES_ASSETS_OPTION, null );

		return new self( array_filter( $options, static fn( $value ) => null !== $value ), $constants );
	}

	/**
	 * Resolves one text field.
	 *
	 * @param string $key A TEXT_FIELDS key.
	 * @return array{value: string, source: 'constant'|'option'|'default'|'unset'}
	 * @throws InvalidArgumentException When the key is not a TEXT_FIELDS key.
	 */
	public function get( string $key ): array {
		if ( ! isset( self::TEXT_FIELDS[ $key ] ) ) {
			throw new InvalidArgumentException( 'Unknown setting key.' );
		}
		$field = self::TEXT_FIELDS[ $key ];

		$constant = $this->constants[ $field['constant'] ] ?? null;
		if ( is_scalar( $constant ) && '' !== trim( (string) $constant ) ) {
			return array(
				'value'  => trim( (string) $constant ),
				'source' => 'constant',
			);
		}

		$option = $this->options[ $field['option'] ] ?? null;
		if ( is_string( $option ) && '' !== $option ) {
			return array(
				'value'  => $option,
				'source' => 'option',
			);
		}

		if ( '' !== $field['default'] ) {
			return array(
				'value'  => $field['default'],
				'source' => 'default',
			);
		}

		return array(
			'value'  => '',
			'source' => 'unset',
		);
	}

	/**
	 * The member roles as saved, before the filter; the default only while never saved.
	 *
	 * @return array{value: list<string>, source: 'option'|'default'}
	 */
	public function stored_member_roles(): array {
		$saved = $this->options[ self::MEMBER_ROLES_OPTION ] ?? null;
		if ( ! is_array( $saved ) ) {
			return array(
				'value'  => self::MEMBER_ROLES_DEFAULT,
				'source' => 'default',
			);
		}

		return array(
			'value'  => array_values( array_filter( $saved, 'is_string' ) ),
			'source' => 'option',
		);
	}

	/**
	 * The enabled Forward Returns assets: the saved list, or the default while none is saved.
	 *
	 * @return list<array{base: string, quote: string, group: string}>
	 */
	public function forward_returns_assets(): array {
		$saved = $this->options[ self::FORWARD_RETURNS_ASSETS_OPTION ] ?? null;
		if ( is_array( $saved ) ) {
			return array_values(
				array_filter(
					$saved,
					static fn( $asset ) => is_array( $asset ) && is_string( $asset['base'] ?? null ) && is_string( $asset['quote'] ?? null ) && is_string( $asset['group'] ?? null )
				)
			);
		}

		return array_map(
			static fn( array $asset ) => array(
				'base'  => $asset[0],
				'quote' => $asset[1],
				'group' => $asset[2],
			),
			self::FORWARD_RETURNS_ASSETS_DEFAULT
		);
	}

	/**
	 * The enabled Predictive Cycles assets: the saved list, or the default while none is saved.
	 *
	 * @return list<array{id: string, group: string}>
	 */
	public function predictive_cycles_assets(): array {
		$saved = $this->options[ self::PREDICTIVE_CYCLES_ASSETS_OPTION ] ?? null;
		if ( is_array( $saved ) ) {
			return array_values(
				array_filter(
					$saved,
					static fn( $asset ) => is_array( $asset ) && is_string( $asset['id'] ?? null ) && is_string( $asset['group'] ?? null )
				)
			);
		}

		return array_map(
			static fn( array $asset ) => array(
				'id'    => $asset[0],
				'group' => $asset[1],
			),
			self::PREDICTIVE_CYCLES_ASSETS_DEFAULT
		);
	}

	/**
	 * The enabled Decennial Cycles assets: the saved list, or the default while none is saved.
	 *
	 * @return list<array{id: string, group: string}>
	 */
	public function decennial_cycles_assets(): array {
		$saved = $this->options[ self::DECENNIAL_CYCLES_ASSETS_OPTION ] ?? null;
		if ( is_array( $saved ) ) {
			return array_values(
				array_filter(
					$saved,
					static fn( $asset ) => is_array( $asset ) && is_string( $asset['id'] ?? null ) && is_string( $asset['group'] ?? null )
				)
			);
		}

		return array_map(
			static fn( string $id ) => array(
				'id'    => $id,
				'group' => 'Indices',
			),
			self::DECENNIAL_CYCLES_ASSETS_DEFAULT
		);
	}

	/**
	 * The roles that make a user a member, after the filter.
	 *
	 * @return list<string>
	 */
	public function member_roles(): array {
		/**
		 * Filters the roles that make a user a member.
		 *
		 * @param list<string> $roles Role slugs from the settings page.
		 */
		$roles = apply_filters( 'tia_member_roles', $this->stored_member_roles()['value'] );

		// A misbehaving filter may return a non-array or non-string entries.
		return array_values( array_filter( (array) $roles, 'is_string' ) );
	}

	/**
	 * The value to save for a submitted text field.
	 *
	 * @param mixed  $input  The submitted value; not a string when the field was absent from the form.
	 * @param string $stored The value stored now.
	 * @param bool   $secret Whether the field is write-only.
	 */
	public static function submitted_text( mixed $input, string $stored, bool $secret ): string {
		if ( ! is_string( $input ) ) {
			return $stored;
		}
		$input = trim( $input );

		return ( '' === $input && $secret ) ? $stored : $input;
	}

	/**
	 * The member roles to save: submitted slugs that exist, once each.
	 *
	 * @param mixed         $input    The submitted value.
	 * @param array<string> $existing The role slugs that exist.
	 * @return list<string>
	 */
	public static function submitted_roles( mixed $input, array $existing ): array {
		if ( ! is_array( $input ) ) {
			return array();
		}
		$roles = array_filter( $input, static fn( $role ) => is_string( $role ) && in_array( $role, $existing, true ) );

		return array_values( array_unique( $roles ) );
	}

	/**
	 * One asset field's rows: every upstream asset once, ordered by group and then by label.
	 *
	 * @param array<mixed>                $items    Upstream rows or assets; malformed items are skipped.
	 * @param array<string>               $keys     The field's key fields, such as base and quote.
	 * @param string                      $label    The upstream field that holds the label.
	 * @param array<array<string, mixed>> $enabled  The enabled assets.
	 * @param array<array<string, mixed>> $defaults The default assets; they give a group to an asset the list lacks.
	 * @return list<array{asset: array<string, string>, label: string, group: string, enabled: bool}>
	 */
	public static function asset_rows( array $items, array $keys, string $label, array $enabled, array $defaults ): array {
		$groups = array();
		foreach ( array( $defaults, $enabled ) as $list ) {
			foreach ( self::valid_assets( $list, $keys ) as $key => $asset ) {
				$groups[ $key ] = $asset['group'];
			}
		}
		$enabled = self::valid_assets( $enabled, $keys );

		$rows = array();
		foreach ( $items as $item ) {
			$asset = is_array( $item ) && is_string( $item[ $label ] ?? null ) ? self::asset_of( $item, $keys ) : null;
			if ( null === $asset ) {
				continue;
			}
			$key            = implode( "\0", $asset );
			$rows[ $key ] ??= array(
				'asset'   => $asset,
				'label'   => $item[ $label ],
				'group'   => $groups[ $key ] ?? self::ASSET_GROUPS[0],
				'enabled' => isset( $enabled[ $key ] ),
			);
		}
		usort(
			$rows,
			static fn( $a, $b ) => array( array_search( $a['group'], self::ASSET_GROUPS, true ), strtolower( $a['label'] ) ) <=> array( array_search( $b['group'], self::ASSET_GROUPS, true ), strtolower( $b['label'] ) )
		);

		return $rows;
	}

	/**
	 * The value to save for a submitted asset field.
	 *
	 * The form lists only upstream assets, so a stored asset the form lacks stays enabled.
	 *
	 * @param mixed                       $input    The form's `rows`, or an asset list; not an array when the field was absent from the form.
	 * @param array<string>               $keys     The field's key fields, such as base and quote.
	 * @param mixed                       $stored   The stored value; false when never saved.
	 * @param array<array<string, mixed>> $defaults The default assets.
	 * @return mixed The stored value when the field was absent or a never-saved field equals the default, else the enabled assets.
	 */
	public static function submitted_assets( mixed $input, array $keys, mixed $stored, array $defaults ): mixed {
		// WordPress passes null for a registered option absent from $_POST; saving it would wipe the list.
		if ( ! is_array( $input ) ) {
			return $stored;
		}
		// add_option() sanitizes the sanitized list a second time.
		if ( ! is_array( $input['rows'] ?? null ) ) {
			return array_values( self::valid_assets( $input, $keys ) );
		}

		$shown  = array();
		$assets = array();
		foreach ( $input['rows'] as $row ) {
			$asset = is_array( $row ) ? self::asset_of( $row, $keys ) : null;
			if ( null === $asset ) {
				continue;
			}
			$key           = implode( "\0", $asset );
			$shown[ $key ] = true;
			if ( ! empty( $row['enabled'] ) && in_array( $row['group'] ?? null, self::ASSET_GROUPS, true ) ) {
				$assets[ $key ] = $asset + array( 'group' => $row['group'] );
			}
		}

		$current = self::valid_assets( is_array( $stored ) ? $stored : $defaults, $keys );
		$assets += array_diff_key( $current, $shown );

		if ( false === $stored && self::same_assets( $assets, self::valid_assets( $defaults, $keys ) ) ) {
			return false;
		}

		return array_values( $assets );
	}

	/**
	 * Whether two keyed asset lists hold the same assets in the same groups, in any order.
	 *
	 * @param array<string, array<string, string>> $a One list.
	 * @param array<string, array<string, string>> $b The other list.
	 */
	private static function same_assets( array $a, array $b ): bool {
		ksort( $a );
		ksort( $b );

		return $a === $b;
	}

	/**
	 * The assets with the given key fields and a valid group, keyed by their key fields.
	 *
	 * @param array<mixed>  $items Assets.
	 * @param array<string> $keys The key fields.
	 * @return array<string, array<string, string>>
	 */
	private static function valid_assets( array $items, array $keys ): array {
		$assets = array();
		foreach ( $items as $item ) {
			$asset = is_array( $item ) ? self::asset_of( $item, $keys ) : null;
			if ( null !== $asset && in_array( $item['group'] ?? null, self::ASSET_GROUPS, true ) ) {
				$assets[ implode( "\0", $asset ) ] = $asset + array( 'group' => $item['group'] );
			}
		}

		return $assets;
	}

	/**
	 * The item's key fields in key order, or null when one is not a non-empty string.
	 *
	 * @param array<mixed>  $item An asset, row or submitted row.
	 * @param array<string> $keys The key fields.
	 * @return array<string, string>|null
	 */
	private static function asset_of( array $item, array $keys ): ?array {
		$asset = array();
		foreach ( $keys as $key ) {
			if ( ! is_string( $item[ $key ] ?? null ) || '' === $item[ $key ] ) {
				return null;
			}
			$asset[ $key ] = $item[ $key ];
		}

		return $asset;
	}

	/**
	 * Whether the roles equal, as a set, the default roles that exist.
	 *
	 * @param array<string> $roles    The role slugs to compare.
	 * @param array<string> $existing The role slugs that exist.
	 */
	public static function matches_default_roles( array $roles, array $existing ): bool {
		$default = array_values( array_intersect( self::MEMBER_ROLES_DEFAULT, $existing ) );
		$roles   = array_values( array_unique( $roles ) );
		sort( $default );
		sort( $roles );

		return $roles === $default;
	}
}
