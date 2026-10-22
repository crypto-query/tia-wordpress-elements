<?php
/**
 * Settings → TIA Elements: the admin page for every connection value.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers and renders the settings page through the Settings API.
 */
final class TIA_Elements_Settings_Page {

	private const SLUG = 'tia-elements-settings';

	private const GROUP = 'tia_elements_settings';

	private const SECTION = 'tia_elements_settings_main';

	private const TEST_ACTION = 'tia_elements_test_connection';

	/**
	 * Asset fields: the option, the key fields of one asset, and the upstream field that holds its label.
	 *
	 * @var array<string, array{option: string, keys: list<string>, label_field: string}>
	 */
	private const ASSET_FIELDS = array(
		'forward_returns_assets'   => array(
			'option'      => TIA_Elements_Settings::FORWARD_RETURNS_ASSETS_OPTION,
			'keys'        => array( 'base', 'quote' ),
			'label_field' => 'title',
		),
		'predictive_cycles_assets' => array(
			'option'      => TIA_Elements_Settings::PREDICTIVE_CYCLES_ASSETS_OPTION,
			'keys'        => array( 'id' ),
			'label_field' => 'name',
		),
		'decennial_cycles_assets'  => array(
			'option'      => TIA_Elements_Settings::DECENNIAL_CYCLES_ASSETS_OPTION,
			'keys'        => array( 'id' ),
			'label_field' => 'name',
		),
	);

	/**
	 * Hooks the page into the admin.
	 */
	public static function register(): void {
		add_action( 'admin_menu', array( self::class, 'add_page' ) );
		add_action( 'admin_init', array( self::class, 'register_settings' ) );
	}

	/**
	 * Adds the page under Settings.
	 */
	public static function add_page(): void {
		add_options_page( 'TIA Elements', 'TIA Elements', 'manage_options', self::SLUG, array( self::class, 'render' ) );
	}

	/**
	 * Registers the options, the section and one field per setting, in display order.
	 */
	public static function register_settings(): void {
		add_settings_section( self::SECTION, '', '__return_false', self::SLUG );
		add_filter( 'pre_update_option_' . TIA_Elements_Settings::MEMBER_ROLES_OPTION, array( self::class, 'keep_roles_default' ), 10, 2 );

		$labels = array(
			'supabase_url'         => __( 'Supabase URL', 'tia-wordpress-elements' ),
			'supabase_key'         => __( 'Supabase API key', 'tia-wordpress-elements' ),
			'data_server_url'      => __( 'Data server URL', 'tia-wordpress-elements' ),
			'member_roles'         => __( 'Member roles', 'tia-wordpress-elements' ),
			'stripe_key'           => __( 'Stripe restricted key', 'tia-wordpress-elements' ),
			'stripe_suite_product' => __( 'Suite product ID', 'tia-wordpress-elements' ),
		);

		foreach ( $labels as $key => $label ) {
			if ( 'member_roles' === $key ) {
				register_setting(
					self::GROUP,
					TIA_Elements_Settings::MEMBER_ROLES_OPTION,
					array(
						'type'              => 'array',
						'sanitize_callback' => array( self::class, 'sanitize_roles' ),
					)
				);
				add_settings_field( TIA_Elements_Settings::MEMBER_ROLES_OPTION, $label, array( self::class, 'render_roles_field' ), self::SLUG, self::SECTION );
				self::register_asset_fields();
				continue;
			}

			$option = TIA_Elements_Settings::TEXT_FIELDS[ $key ]['option'];
			register_setting(
				self::GROUP,
				$option,
				array(
					'type'              => 'string',
					'sanitize_callback' => static fn( $input ) => self::sanitize_text( $key, $input ),
				)
			);
			add_settings_field(
				$option,
				$label,
				array( self::class, 'render_text_field' ),
				self::SLUG,
				self::SECTION,
				array(
					'label_for' => $option,
					'key'       => $key,
				)
			);
		}
	}

	/**
	 * Registers one asset field per Block.
	 */
	private static function register_asset_fields(): void {
		$labels = array(
			'forward_returns_assets'   => __( 'Forward Returns assets', 'tia-wordpress-elements' ),
			'predictive_cycles_assets' => __( 'Predictive Cycles assets', 'tia-wordpress-elements' ),
			'decennial_cycles_assets'  => __( 'Decennial Cycles assets', 'tia-wordpress-elements' ),
		);
		foreach ( $labels as $key => $label ) {
			$option = self::ASSET_FIELDS[ $key ]['option'];
			register_setting(
				self::GROUP,
				$option,
				array(
					'type'              => 'array',
					'sanitize_callback' => static fn( $input ) => self::sanitize_assets( $key, $input ),
				)
			);
			add_settings_field(
				$option,
				$label,
				array( self::class, 'render_assets_field' ),
				self::SLUG,
				self::SECTION,
				array(
					'key'   => $key,
					'label' => $label,
				)
			);
		}
	}

	/**
	 * Sanitizes a submitted text field; an absent field or a blank secret keeps the stored value.
	 *
	 * @param string $key   A TEXT_FIELDS key.
	 * @param mixed  $input The submitted value.
	 */
	public static function sanitize_text( string $key, mixed $input ): string {
		$field  = TIA_Elements_Settings::TEXT_FIELDS[ $key ];
		$stored = get_option( $field['option'], '' );
		$value  = TIA_Elements_Settings::submitted_text( $input, is_string( $stored ) ? $stored : '', $field['secret'] );

		return in_array( $key, array( 'supabase_url', 'data_server_url' ), true ) ? esc_url_raw( $value ) : sanitize_text_field( $value );
	}

	/**
	 * Sanitizes the submitted member roles to roles that exist.
	 *
	 * @param mixed $input The submitted value.
	 * @return list<string>
	 */
	public static function sanitize_roles( mixed $input ): array {
		// wp_roles() rather than get_editable_roles(): the sanitizer can run outside wp-admin.
		return TIA_Elements_Settings::submitted_roles( $input, array_keys( wp_roles()->get_names() ) );
	}

	/**
	 * Keeps a never-saved member roles option unsaved when the submit equals the default.
	 *
	 * @param mixed $value     The sanitized new value.
	 * @param mixed $old_value The stored value; false when never saved.
	 */
	public static function keep_roles_default( mixed $value, mixed $old_value ): mixed {
		// The form shows the default as checked; saving it unchanged must not freeze it into the option.
		if ( false === $old_value && is_array( $value ) && TIA_Elements_Settings::matches_default_roles( $value, array_keys( wp_roles()->get_names() ) ) ) {
			return $old_value;
		}

		return $value;
	}

	/**
	 * Renders one text field with its source.
	 *
	 * @param array{label_for: string, key: string} $args The field arguments.
	 */
	public static function render_text_field( array $args ): void {
		$field         = TIA_Elements_Settings::TEXT_FIELDS[ $args['key'] ];
		$resolved      = TIA_Elements_Settings::from_wordpress()->get( $args['key'] );
		$from_constant = 'constant' === $resolved['source'];
		$stored        = get_option( $field['option'], '' );

		$value = '';
		if ( ! $field['secret'] ) {
			$value = $from_constant ? $resolved['value'] : ( is_string( $stored ) ? $stored : '' );
		}

		printf(
			'<input type="%1$s" id="%2$s" name="%2$s" value="%3$s" placeholder="%4$s" class="regular-text"%5$s%6$s />',
			esc_attr( $field['secret'] ? 'password' : 'text' ),
			esc_attr( $field['option'] ),
			esc_attr( $value ),
			esc_attr( $field['default'] ),
			$field['secret'] ? ' autocomplete="new-password"' : '',
			disabled( $from_constant, true, false )
		);

		if ( $from_constant ) {
			echo ' <span class="description">' . esc_html__( '(set via constant)', 'tia-wordpress-elements' ) . '</span>';
		}

		if ( 'supabase_key' === $args['key'] ) {
			echo '<p class="description">' . esc_html__( 'v1 uses the Supabase service role key. On production, set it with TIA_SUPABASE_KEY in wp-config.php. The anon key reads no rows, because RLS is on with no policies.', 'tia-wordpress-elements' ) . '</p>';
		}

		if ( $field['secret'] && 'option' === $resolved['source'] ) {
			echo '<p class="description">' . esc_html__( 'A value is stored. Leave blank to keep it.', 'tia-wordpress-elements' ) . '</p>';
		}

		self::render_source( $resolved['source'] );
	}

	/**
	 * Renders one checkbox per editable role.
	 */
	public static function render_roles_field(): void {
		$stored = TIA_Elements_Settings::from_wordpress()->stored_member_roles();

		echo '<fieldset><legend class="screen-reader-text">' . esc_html__( 'Member roles', 'tia-wordpress-elements' ) . '</legend>';
		foreach ( get_editable_roles() as $slug => $role ) {
			printf(
				'<label><input type="checkbox" name="%1$s[]" value="%2$s"%3$s /> %4$s</label><br />',
				esc_attr( TIA_Elements_Settings::MEMBER_ROLES_OPTION ),
				esc_attr( $slug ),
				checked( in_array( $slug, $stored['value'], true ), true, false ),
				esc_html( translate_user_role( $role['name'] ) )
			);
		}
		echo '</fieldset>';

		self::render_source( $stored['source'] );
	}

	/**
	 * Sanitizes a submitted asset field; an absent field keeps the stored value.
	 *
	 * @param string $key   An ASSET_FIELDS key.
	 * @param mixed  $input The submitted rows.
	 */
	public static function sanitize_assets( string $key, mixed $input ): mixed {
		$field = self::ASSET_FIELDS[ $key ];

		return TIA_Elements_Settings::submitted_assets( is_array( $input ) ? map_deep( $input, 'sanitize_text_field' ) : $input, $field['keys'], get_option( $field['option'] ), self::assets( $key, new TIA_Elements_Settings( array(), array() ) ) );
	}

	/**
	 * Renders every upstream asset with Enabled and Group, or the saved list read-only when upstream is down.
	 *
	 * @param array{key: string, label: string} $args The field arguments.
	 */
	public static function render_assets_field( array $args ): void {
		$field   = self::ASSET_FIELDS[ $args['key'] ];
		$enabled = self::assets( $args['key'], TIA_Elements_Settings::from_wordpress() );
		$items   = self::upstream_assets( $args['key'] );
		$rows    = is_wp_error( $items ) ? array() : TIA_Elements_Settings::asset_rows( $items, $field['keys'], $field['label_field'], $enabled, self::assets( $args['key'], new TIA_Elements_Settings( array(), array() ) ) );

		echo '<fieldset><legend class="screen-reader-text">' . esc_html( $args['label'] ) . '</legend>';
		if ( array() === $rows ) {
			echo '<div class="notice notice-warning inline"><p>' . esc_html__( 'The upstream asset list is not available now. The saved list shows read-only. Saving the page keeps it.', 'tia-wordpress-elements' ) . '</p></div>';
			echo '<table class="widefat striped"><thead><tr><th>' . esc_html__( 'Asset', 'tia-wordpress-elements' ) . '</th><th>' . esc_html__( 'Group', 'tia-wordpress-elements' ) . '</th></tr></thead><tbody>';
			foreach ( $enabled as $asset ) {
				$group = $asset['group'];
				unset( $asset['group'] );
				echo '<tr><td><code>' . esc_html( implode( '/', $asset ) ) . '</code></td><td>' . esc_html( $group ) . '</td></tr>';
			}
			echo '</tbody></table>';
		} else {
			echo '<table class="widefat striped"><thead><tr><th>' . esc_html__( 'Enabled', 'tia-wordpress-elements' ) . '</th><th>' . esc_html__( 'Group', 'tia-wordpress-elements' ) . '</th></tr></thead><tbody>';
			foreach ( $rows as $index => $row ) {
				$name = $field['option'] . '[rows][' . $index . ']';
				echo '<tr><td>';
				foreach ( $row['asset'] as $part => $value ) {
					printf( '<input type="hidden" name="%1$s" value="%2$s" />', esc_attr( $name . '[' . $part . ']' ), esc_attr( $value ) );
				}
				printf(
					'<label><input type="checkbox" name="%1$s" value="1"%2$s /> %3$s</label> <code>%4$s</code></td><td><select name="%5$s" aria-label="%6$s">',
					esc_attr( $name . '[enabled]' ),
					checked( $row['enabled'], true, false ),
					esc_html( $row['label'] ),
					esc_html( implode( '/', $row['asset'] ) ),
					esc_attr( $name . '[group]' ),
					/* translators: %s: the asset label. */
					esc_attr( sprintf( __( 'Group of %s', 'tia-wordpress-elements' ), $row['label'] ) )
				);
				foreach ( TIA_Elements_Settings::ASSET_GROUPS as $group ) {
					printf( '<option value="%1$s"%2$s>%1$s</option>', esc_attr( $group ), selected( $row['group'], $group, false ) );
				}
				echo '</select></td></tr>';
			}
			echo '</tbody></table>';
		}
		echo '</fieldset>';

		self::render_source( is_array( get_option( $field['option'] ) ) ? 'option' : 'default' );
	}

	/**
	 * One asset field's list from the settings.
	 *
	 * @param string                $key      An ASSET_FIELDS key.
	 * @param TIA_Elements_Settings $settings The settings; empty ones give the default list.
	 * @return list<array<string, string>>
	 */
	private static function assets( string $key, TIA_Elements_Settings $settings ): array {
		return match ( $key ) {
			'forward_returns_assets'   => $settings->forward_returns_assets(),
			'predictive_cycles_assets' => $settings->predictive_cycles_assets(),
			default                    => $settings->decennial_cycles_assets(),
		};
	}

	/**
	 * One live read of a Block's upstream asset list.
	 *
	 * @param string $key An ASSET_FIELDS key.
	 * @return array<mixed>|WP_Error
	 */
	private static function upstream_assets( string $key ): array|WP_Error {
		if ( 'forward_returns_assets' === $key ) {
			return TIA_Elements_Supabase::read(
				array(
					'select' => 'title,base,quote',
					'period' => 'in.(1,3,6,12)',
				)
			);
		}
		$body = TIA_Elements_Data_Server::get( 'predictive_cycles_assets' === $key ? '/forecast_curves_assets' : '/decennial_assets' );
		if ( is_wp_error( $body ) ) {
			return $body;
		}

		return is_array( $body['assets'] ?? null ) ? $body['assets'] : array();
	}

	/**
	 * Renders the page.
	 */
	public static function render(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
			<form action="options.php" method="post">
				<?php
				settings_fields( self::GROUP );
				do_settings_sections( self::SLUG );
				submit_button();
				?>
			</form>
			<h2><?php esc_html_e( 'Test connection', 'tia-wordpress-elements' ); ?></h2>
			<?php self::render_connection_checks(); ?>
			<form method="post">
				<?php
				wp_nonce_field( self::TEST_ACTION, self::TEST_ACTION . '_nonce' );
				submit_button( __( 'Test connection', 'tia-wordpress-elements' ), 'secondary', self::TEST_ACTION );
				?>
			</form>
		</div>
		<?php
	}

	/**
	 * Runs the connection checks after a Test connection submit and renders one line per check.
	 */
	private static function render_connection_checks(): void {
		if ( ! isset( $_POST[ self::TEST_ACTION ] ) ) {
			return;
		}
		check_admin_referer( self::TEST_ACTION, self::TEST_ACTION . '_nonce' );

		foreach ( array( self::supabase_check(), self::data_server_check(), ...self::stripe_checks() ) as $check ) {
			printf(
				'<div class="notice notice-%1$s inline"><p>%2$s</p></div>',
				esc_attr( $check['ok'] ? 'success' : 'error' ),
				esc_html( $check['message'] )
			);
		}
	}

	/**
	 * Reads one month_returns row; no row is a failure, because a wrong key or RLS reads none.
	 *
	 * @return array{ok: bool, message: string}
	 */
	private static function supabase_check(): array {
		$status = 0;
		$rows   = TIA_Elements_Supabase::read(
			array(
				'select' => 'base',
				'limit'  => 1,
			),
			$status
		);

		if ( is_wp_error( $rows ) ) {
			$data = $rows->get_error_data();

			return array(
				'ok'      => false,
				/* translators: %s: what went wrong, e.g. "HTTP 401" or the transport error. */
				'message' => sprintf( __( 'Supabase: %s.', 'tia-wordpress-elements' ), is_array( $data ) && is_string( $data['detail'] ?? null ) ? $data['detail'] : $rows->get_error_message() ),
			);
		}

		if ( array() === $rows ) {
			return array(
				'ok'      => false,
				'message' => __( 'Supabase: connected, but no rows: check the key and RLS.', 'tia-wordpress-elements' ),
			);
		}

		return array(
			'ok'      => true,
			/* translators: %d: the HTTP status. */
			'message' => sprintf( __( 'Supabase: connected (HTTP %d).', 'tia-wordpress-elements' ), $status ),
		);
	}

	/**
	 * Reads the Predictive Cycles asset list; a 403 means the allowlist lacks this server's egress IP.
	 *
	 * @return array{ok: bool, message: string}
	 */
	private static function data_server_check(): array {
		$status = 0;
		$body   = TIA_Elements_Data_Server::get( '/forecast_curves_assets', $status );

		if ( is_wp_error( $body ) ) {
			$data = $body->get_error_data();

			return array(
				'ok'      => false,
				/* translators: %s: what went wrong, e.g. "HTTP 500" or the transport error. */
				'message' => sprintf( __( 'Data server: %s.', 'tia-wordpress-elements' ), is_array( $data ) && is_string( $data['detail'] ?? null ) ? $data['detail'] : $body->get_error_message() ),
			);
		}

		return array(
			'ok'      => true,
			/* translators: %d: the HTTP status. */
			'message' => sprintf( __( 'Data server: connected (HTTP %d).', 'tia-wordpress-elements' ), $status ),
		);
	}

	/**
	 * Reads the suite product, one subscription and a Customer Search for a dummy email.
	 *
	 * @return list<array{ok: bool, message: string}>
	 */
	private static function stripe_checks(): array {
		$settings = TIA_Elements_Settings::from_wordpress();
		if ( '' === $settings->get( 'stripe_key' )['value'] ) {
			return array(
				array(
					'ok'      => false,
					'message' => __( 'Stripe: not configured: set the restricted key.', 'tia-wordpress-elements' ),
				),
			);
		}

		$checks = array(
			__( 'Stripe suite product', 'tia-wordpress-elements' ) => array( '/v1/products/' . rawurlencode( $settings->get( 'stripe_suite_product' )['value'] ), array() ),
			__( 'Stripe subscriptions', 'tia-wordpress-elements' ) => array( '/v1/subscriptions', array( 'limit' => 1 ) ),
			__( 'Stripe customer search', 'tia-wordpress-elements' ) => array( '/v1/customers/search', array( 'query' => 'email:"test-connection@example.invalid"' ) ),
		);
		$lines  = array();
		foreach ( $checks as $label => list( $path, $query ) ) {
			$status = 0;
			$body   = TIA_Elements_Stripe_Client::get( $path, $query, $status );
			if ( is_wp_error( $body ) ) {
				$lines[] = array(
					'ok'      => false,
					/* translators: 1: the check, 2: what went wrong, e.g. "HTTP 401 invalid_request_error". */
					'message' => sprintf( __( '%1$s: %2$s.', 'tia-wordpress-elements' ), $label, $body->get_error_message() ),
				);
				continue;
			}
			$detail = '';
			if ( isset( $body['name'] ) && is_string( $body['name'] ) ) {
				/* translators: 1: the product name, 2: live mode or test mode. */
				$detail = sprintf( __( '%1$s, %2$s, ', 'tia-wordpress-elements' ), $body['name'], empty( $body['livemode'] ) ? __( 'test mode', 'tia-wordpress-elements' ) : __( 'live mode', 'tia-wordpress-elements' ) );
			}
			$lines[] = array(
				'ok'      => true,
				/* translators: 1: the check, 2: product details or nothing, 3: the HTTP status. */
				'message' => sprintf( __( '%1$s: %2$sHTTP %3$d.', 'tia-wordpress-elements' ), $label, $detail, $status ),
			);
		}
		return $lines;
	}

	/**
	 * Renders where a value comes from.
	 *
	 * @param string $source One of constant, option, default, unset.
	 */
	private static function render_source( string $source ): void {
		/* translators: %s: where the value comes from: constant, option, default or unset. */
		echo '<p class="description">' . esc_html( sprintf( __( 'Source: %s', 'tia-wordpress-elements' ), $source ) ) . '</p>';
	}
}
