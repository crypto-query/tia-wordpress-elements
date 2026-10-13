<?php
/**
 * Plugin Name:       TIA WordPress Elements
 * Description:       Gutenberg blocks and account elements for TIA Investor.
 * Version:           0.1.0
 * Requires at least: 7.0
 * Requires PHP:      8.3
 * Author:            TIA Strategies
 * License:           Proprietary
 * Text Domain:       tia-wordpress-elements
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/includes/class-tia-elements-settings.php';
require_once __DIR__ . '/includes/class-tia-elements-settings-page.php';
require_once __DIR__ . '/includes/class-tia-elements-card.php';
require_once __DIR__ . '/includes/class-tia-elements-blocks.php';

TIA_Elements_Settings_Page::register();
TIA_Elements_Blocks::register();
