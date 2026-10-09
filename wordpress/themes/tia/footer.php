<?php
/**
 * The template for displaying the footer
 *
 * Contains the closing of the #content div and all content after.
 *
 * @link https://developer.wordpress.org/themes/basics/template-files/#template-partials
 *
 * @package tcc-base-theme
 */

?>

		</div>
	</div>

	<footer id="colophon" class="site-footer">
		<div class="footer-content">
			<div class="footer-columns">
				<!-- First Column - Logo and Main Links -->
				<div class="footer-column">
					<div class="footer-logo">
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
					</div>
				</div>

				<div class="footer-column">
					<h3 class="footer-heading">TIA</h3>
					<nav class="footer-menu">
						<?php
						if ( has_nav_menu( 'footer-left' ) ) {
							wp_nav_menu( array(
								'theme_location' => 'footer-left',
								'menu_class'     => 'footer-menu-list',
								'container'      => false,
								'fallback_cb'    => false,
							) );
						} else {
							tia_footer_menu_fallback( 'footer-left' );
						}
						?>
					</nav>
				</div>

				<div class="footer-column">
					<h3 class="footer-heading">Members</h3>
					<nav class="footer-menu">
						<?php
						if ( has_nav_menu( 'footer-middle' ) ) {
							wp_nav_menu( array(
								'theme_location' => 'footer-middle',
								'menu_class'     => 'footer-menu-list',
								'container'      => false,
								'fallback_cb'    => false,
							) );
						} else {
							tia_footer_menu_fallback( 'footer-middle' );
						}
						?>
					</nav>
				</div>

				<div class="footer-column">
					<h3 class="footer-heading">TIA Indicator Suite</h3>
					<nav class="footer-menu">
						<?php
						if ( has_nav_menu( 'footer-right' ) ) {
							wp_nav_menu( array(
								'theme_location' => 'footer-right',
								'menu_class'     => 'footer-menu-list',
								'container'      => false,
								'fallback_cb'    => false,
							) );
						} else {
							tia_footer_menu_fallback( 'footer-right' );
						}
						?>
					</nav>
				</div>
			</div>

			<!-- Copyright -->
			<div class="footer-copyright">
				<p>&copy; <?php echo date('Y'); ?> TIA. All Rights Reserved.</p>
			</div>
		</div>
	</footer>
</div>

<?php wp_footer(); ?>

</body>
</html>
