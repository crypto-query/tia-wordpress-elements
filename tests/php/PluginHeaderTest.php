<?php
/**
 * The plugin header WordPress reads before it activates the plugin.
 *
 * @package tia-wordpress-elements
 */

use PHPUnit\Framework\TestCase;

/**
 * Reads the header the same way get_file_data() does, without loading WordPress.
 */
final class PluginHeaderTest extends TestCase {

	/**
	 * The plugin declares the WordPress and PHP floors the site must meet.
	 */
	public function test_declares_the_wordpress_and_php_floors(): void {
		$header = (string) file_get_contents( __DIR__ . '/../../tia-wordpress-elements.php' );

		$this->assertMatchesRegularExpression( '/^[ \t\/*#@]*Plugin Name:\s*TIA WordPress Elements$/mi', $header );
		$this->assertMatchesRegularExpression( '/^[ \t\/*#@]*Requires at least:\s*7\.0$/mi', $header );
		$this->assertMatchesRegularExpression( '/^[ \t\/*#@]*Requires PHP:\s*8\.3$/mi', $header );
	}
}
