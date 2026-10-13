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
		</div>
		<?php
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
