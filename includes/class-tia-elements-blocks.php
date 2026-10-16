<?php
/**
 * Registers the Blocks from `build/` and writes the boot data each one mounts with.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * The WordPress side of every Block: the shared stylesheet, registration and the boot JSON.
 */
final class TIA_Elements_Blocks {

	/**
	 * The one stylesheet every `block.json` lists as `style`, so it loads once per page.
	 */
	public const STYLE_HANDLE = 'tia-elements-design-system';

	/**
	 * How many Blocks of each type and post rendered so far, keyed `<name>:<postId>`.
	 *
	 * @var array<string, int>
	 */
	private static array $rendered = array();

	/**
	 * Hooks the Blocks into WordPress.
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'register_blocks' ) );
		add_filter( 'the_content', array( self::class, 'reset_positions' ), 8 );
		if ( defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG ) {
			// Inline styles never reload, so `wp-scripts start --hot` could not swap them.
			add_filter( 'styles_inline_size_limit', '__return_zero' );
		}
	}

	/**
	 * Registers the shared stylesheet and every built Block. Does nothing before the first build.
	 */
	public static function register_blocks(): void {
		$build = dirname( __DIR__ ) . '/build';
		$asset = $build . '/shared/design-system.asset.php';
		if ( ! is_readable( $asset ) ) {
			return;
		}
		/**
		 * The asset file webpack writes beside the CSS; its version changes with the CSS.
		 *
		 * @var array{version: string} $info
		 */
		$info = require $asset;
		wp_register_style( self::STYLE_HANDLE, plugins_url( 'build/shared/design-system.css', __DIR__ ), array(), $info['version'] );

		$blocks = glob( $build . '/*/block.json' );
		foreach ( $blocks ? $blocks : array() as $metadata ) {
			register_block_type( dirname( $metadata ) );
		}
	}

	/**
	 * Restarts the Block positions for each rendering of post content, so a second rendering numbers alike.
	 *
	 * @param string $content Post content.
	 * @return string The same content.
	 */
	public static function reset_positions( $content ) {
		self::$rendered = array();
		return $content;
	}

	/**
	 * The boot data of one Block. Called from its `render.php`; runs no upstream call.
	 *
	 * @param string               $name       Block name.
	 * @param array<string, mixed> $attributes Block attributes.
	 * @param bool                 $trial_card Whether a Trial gets the Trial card; false where a Trial sees the data.
	 * @return array{attributes: object, rest: array{root: string, nonce: string}, card: array<string, string>|null, instance: string}
	 */
	public static function boot( string $name, array $attributes, bool $trial_card = true ): array {
		$logged_in = is_user_logged_in();
		if ( $logged_in && ! defined( 'DONOTCACHEPAGE' ) ) {
			// Logged-out visitors share one cached page; a logged-in page holds a user's own card.
			define( 'DONOTCACHEPAGE', true );
		}

		$post_id                = (int) get_the_ID();
		$key                    = $name . ':' . $post_id;
		self::$rendered[ $key ] = ( self::$rendered[ $key ] ?? 0 ) + 1;
		$product                = wc_get_product( TIA_Elements_Card::PRODUCT_ID );
		$permalink              = get_permalink();

		return array(
			// An object, so empty attributes encode as `{}`, not `[]`.
			'attributes' => (object) $attributes,
			'rest'       => array(
				'root'  => esc_url_raw( rest_url() ),
				'nonce' => wp_create_nonce( 'wp_rest' ),
			),
			'card'       => TIA_Elements_Card::for_access(
				TIA_Elements_Entitlement::current(),
				$logged_in,
				wp_get_current_user()->roles,
				TIA_Elements_Settings::from_wordpress()->member_roles(),
				$product ? $product->get_price_html() : '',
				$product ? $product->get_permalink() : '',
				wp_login_url( $permalink ? $permalink : '' ),
				$trial_card
			),
			'instance'   => $post_id . ':' . self::$rendered[ $key ],
		);
	}
}
