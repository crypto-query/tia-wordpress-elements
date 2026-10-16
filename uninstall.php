<?php
/**
 * Runs when the plugin is deleted.
 *
 * @package tia-wordpress-elements
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

require_once __DIR__ . '/includes/class-tia-elements-settings.php';
require_once __DIR__ . '/includes/class-tia-elements-stripe-entitlement-source.php';

foreach ( TIA_Elements_Settings::OPTIONS as $tia_elements_option ) {
	delete_option( $tia_elements_option );
}

TIA_Elements_Stripe_Entitlement_Source::delete_transients();
