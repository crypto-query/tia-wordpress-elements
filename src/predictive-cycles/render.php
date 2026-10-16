<?php
/**
 * Server render of the Predictive Cycles Block: the mount element and its boot JSON.
 *
 * @package tia-wordpress-elements
 *
 * @var array<string, mixed> $attributes Block attributes.
 * @var string               $content    Inner content (none).
 * @var WP_Block             $block      The Block instance.
 */

defined( 'ABSPATH' ) || exit;

// A Trial sees the curves up to its trial end, so it gets no Trial card.
printf(
	'<div %s><div class="tia-design-system" data-boot="%s"></div></div>',
	get_block_wrapper_attributes(),
	esc_attr( (string) wp_json_encode( TIA_Elements_Blocks::boot( 'tia-elements/predictive-cycles', $attributes, false ) ) )
);
