<?php
/**
 * Loads Composer and defines ABSPATH so plugin class files load without WordPress.
 *
 * @package tia-wordpress-elements
 */

define( 'ABSPATH', __DIR__ . '/' );

require_once __DIR__ . '/../../vendor/autoload.php';
