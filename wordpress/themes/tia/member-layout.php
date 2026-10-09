<?php
/**
 * Template Name: Member Layout
 *
 * @package TIA
 */

 // If the user isn't logged in, redirect unless the URL has "lost-password" in it.
 if ( ! is_user_logged_in() && ! strpos( $_SERVER['REQUEST_URI'], 'lost-password' ) ) {
	wp_redirect( home_url( 'login' ) );
	exit;
}

get_header();
?>

	<div id="primary" class="content-area col-8">
		<main id="main" class="site-main">
			<?php

			while ( have_posts() ) :
				the_post();

				get_template_part( 'template-parts/content', 'page' );
			endwhile;
			?>
		</main>
	</div>

<?php
get_footer();
