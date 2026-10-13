<?php
/**
 * Server render of the Forward Returns Block: the mount element and its boot JSON.
 *
 * @package tia-wordpress-elements
 *
 * @var array<string, mixed> $attributes Block attributes.
 * @var string               $content    Inner content (none).
 * @var WP_Block             $block      The Block instance.
 */

defined( 'ABSPATH' ) || exit;

printf(
	'<div %s><div class="tia-design-system" data-boot="%s"></div></div>',
	get_block_wrapper_attributes(),
	esc_attr( (string) wp_json_encode( TIA_Elements_Blocks::boot( 'tia-elements/forward-returns', $attributes ) ) )
);
