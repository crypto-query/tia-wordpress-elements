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
require_once __DIR__ . '/includes/class-tia-elements-access.php';
require_once __DIR__ . '/includes/class-tia-elements-access-resolver.php';
require_once __DIR__ . '/includes/class-tia-elements-wcs-reader.php';
require_once __DIR__ . '/includes/class-tia-elements-suite-subscriptions.php';
require_once __DIR__ . '/includes/class-tia-elements-stripe-client.php';
require_once __DIR__ . '/includes/class-tia-elements-stripe-entitlement-source.php';
require_once __DIR__ . '/includes/class-tia-elements-entitlement.php';
require_once __DIR__ . '/includes/class-tia-elements-card.php';
require_once __DIR__ . '/includes/class-tia-elements-blocks.php';
require_once __DIR__ . '/includes/class-tia-elements-supabase.php';
require_once __DIR__ . '/includes/class-tia-elements-forward-returns.php';
require_once __DIR__ . '/includes/class-tia-elements-forward-returns-service.php';
require_once __DIR__ . '/includes/class-tia-elements-rest.php';
require_once __DIR__ . '/src/suite-subscriptions/class-tia-elements-suite-subscription-rows.php';
require_once __DIR__ . '/src/suite-subscriptions/class-tia-elements-suite-subscriptions-element.php';

TIA_Elements_Settings_Page::register();
TIA_Elements_Blocks::register();
TIA_Elements_Rest::register();
TIA_Elements_Suite_Subscriptions_Element::register();
