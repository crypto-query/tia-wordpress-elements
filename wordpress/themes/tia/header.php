<?php
/**
 * The header for our theme
 *
 * This is the template that displays all of the <head> section and everything up until <div id="content">
 *
 * @link https://developer.wordpress.org/themes/basics/template-files/#template-partials
 *
 * @package tcc-base-theme
 */
global $post;
?>
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
	<?php wp_head(); ?>
</head>

<body <?php body_class(); ?>>
<?php

if ( function_exists( 'wp_body_open' ) ) {
	wp_body_open();
}

$is_public = ! is_account_page() && $post->post_parent !== 9;

?>
<div id="page" class="site container <?php echo ! $is_public ? 'my-account' : ''; ?>">

	<header id="masthead" class="site-header">
		<div class="row">
			<!-- Logo/Branding -->
			<div class="site-branding">
				<a href="<?php echo esc_url( home_url( '/' ) ); ?>" alt="TIA" class="custom-logo" rel="home">
					<div class="tia-logo">
						<div class="logo-icon">
							<svg width="121" height="30" viewBox="0 0 121 30" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M33.956 0.0317383H29.7031C29.2416 0.0317383 28.8789 0.427355 28.8789 0.921876V29.1096C28.8789 29.6041 29.2416 29.9997 29.7031 29.9997H33.956C34.4175 29.9997 34.7802 29.6041 34.7802 29.1096V0.921876C34.7802 0.427355 34.4175 0.0317383 33.956 0.0317383Z" fill="#04273F"/>
								<path d="M23.737 0.0317383H0.890138C0.395617 0.0317383 0 0.427355 0 0.921876V3.98791C0 4.48243 0.395617 4.87804 0.890138 4.87804H9.19809V29.1096C9.19809 29.6041 9.59371 29.9997 10.0882 29.9997H14.6049C15.0994 29.9997 15.495 29.6041 15.495 29.1096V4.87804H23.77C24.2645 4.87804 24.6601 4.48243 24.6601 3.98791V0.921876C24.6601 0.427355 24.2645 0.0317383 23.77 0.0317383H23.737Z" fill="#04273F"/>
								<path d="M57.6918 0.592195C57.56 0.262515 57.2303 0.0317383 56.8676 0.0317383H51.1971C50.8345 0.0317383 50.5048 0.262515 50.3729 0.592195L39.6253 28.7799C39.3945 29.3404 39.8231 29.9667 40.4495 29.9667H44.2079C44.5705 29.9667 44.9002 29.736 45.0321 29.4063L53.9994 5.86709L58.6149 17.8015H53.6368L51.6257 23.1424H60.6919L63.1316 29.4063C63.2634 29.736 63.5931 29.9667 63.9558 29.9667H67.6152C68.2416 29.9667 68.6372 29.3404 68.4394 28.7799L57.6918 0.592195Z" fill="#04273F"/>
								<path d="M119.835 2.70338L114.956 0.395617C114.428 0.131872 113.835 0 113.209 0H62.0421C61.6135 0 61.4816 0.560457 61.8443 0.758266L76.3502 9.13216C76.8118 9.3959 77.3063 9.56074 77.8008 9.62668L92.3068 11.7696C92.6364 11.8355 92.6694 12.2971 92.3068 12.363L85.4494 13.5828C85.0868 13.6488 84.9878 14.1433 85.3175 14.3411L89.0759 16.517C89.2407 16.6159 89.2737 16.8467 89.1418 16.9786L77.1414 29.0119C76.8118 29.3416 77.2403 29.902 77.636 29.6713L119.934 4.38475C120.593 3.98914 120.56 3.00009 119.835 2.63745V2.70338Z" fill="#04273F"/>
							</svg>
						</div>
					</div>
				</a>
			</div>

			<?php if ( $is_public ) : ?>

				<!-- Desktop Navigation -->
				<nav class="main-navigation desktop-nav">
					<?php
					wp_nav_menu( array(
						'theme_location' => 'menu-1',
						'menu_id'        => 'primary-menu',
						'container'      => false,
					) );
					?>
				</nav>

				<?php if ( is_account_page() ) : ?>
					<div class="header-actions">
						<a href="<?php echo wp_logout_url(); ?>" class="member-login-btn">Logout</a>
					</div>
				<?php elseif ( is_user_logged_in() ) : ?>
					<div class="header-actions">
						<a href="<?php echo home_url( 'my-account' ); ?>" class="member-login-btn">My Account</a>
					</div>
				<?php else : ?>
				<div class="header-actions">
					<a href="<?php echo home_url( 'login' ); ?>" class="member-login-btn">Member Login</a>
				</div>
				<?php endif; ?>

			<?php endif; ?>

			<!-- Mobile Menu Toggle -->
			<button class="mobile-menu-toggle" aria-label="Toggle mobile menu">
				<span></span>
				<span></span>
				<span></span>
			</button>
		</div>

		<!-- Mobile Navigation Overlay -->
		<div class="mobile-nav-overlay">
			<div class="mobile-nav-header">
				<div class="mobile-logo">
				</div>
				<button class="mobile-nav-close" aria-label="Close mobile menu">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
			</div>
			<nav class="mobile-navigation">
				<?php if ( ! is_account_page() && $post->post_parent !== 9 ) : ?>
					<?php if ( is_user_logged_in() ) : ?>
						<a href="<?php echo home_url( 'my-account' ); ?>" class="member-login-btn">My Account</a>
					<?php else: ?>	
					<a href="<?php echo home_url( 'login' ); ?>" class="member-login-btn">Member Login</a>
				<?php endif; ?>
				<?php
				wp_nav_menu( array(
					'theme_location' => 'menu-1',
					'menu_id'        => 'mobile-primary-menu',
					'container'      => false,
					'fallback_cb'    => 'tia_default_menu',
				) );
				?>
				<?php else: ?>
				<a href="<?php echo wp_logout_url(); ?>" class="member-login-btn">Logout</a>
				<?php endif; ?>
			</nav>
		</div>
	</header>

	<div id="content" class="site-content">
		<div class="row">
