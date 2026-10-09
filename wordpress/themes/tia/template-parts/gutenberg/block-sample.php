<?php
/**
 * Block Name: Content Sample
 *
 * This is the template that displays the content sample.
 *
 * @package tcc-base-theme
 */

// Create id attribute for specific styling.
$block_id     = $block['id'];
$custom_block = 'gutenberg-block block-' . $block['keywords']['0'];
$class_name   = $block['className'];

// Create align class ("alignwide") from block setting ("wide").
$align_class = $block['align'] ? 'align' . $block['align'] : ''; ?>

<div 
	id="<?php echo esc_attr( $block_id ); ?>"
	class="<?php echo esc_attr( $custom_block ); ?> <?php echo esc_attr( $align_class ); ?>">

	<h2><?php the_field( 'title' ); ?></h2>
	<p><?php the_field( 'content' ); ?></p>

</div>
