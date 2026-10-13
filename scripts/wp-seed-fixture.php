<?php
/**
 * Browser-pass fixture page for the LOCAL WordPress only. Never run it on a live site.
 *
 * Run through `bash scripts/wp-seed-fixture.sh` (add `clean` to only remove the page). It makes
 * or updates the page `fixture-live-site`: the forward-returns Block beside the LearnDash,
 * Presto Player and AffiliateWP markup and CSS captured in tests/fixtures/live-site/.
 *
 * @package tia-wordpress-elements
 */

defined( 'WP_CLI' ) || exit;

const TIA_ELEMENTS_FIXTURE_SLUG   = 'fixture-live-site';
const TIA_ELEMENTS_FIXTURE_MARKER = '_tia_elements_fixture';

/**
 * Makes, updates or (with `clean`) removes the fixture page.
 *
 * @param array<int, string> $cli_args Arguments after the file name; `clean` only removes.
 */
function tia_elements_fixture_run( $cli_args ) {
	$page = get_page_by_path( TIA_ELEMENTS_FIXTURE_SLUG, OBJECT, 'page' );
	if ( $page && ! get_post_meta( $page->ID, TIA_ELEMENTS_FIXTURE_MARKER, true ) ) {
		WP_CLI::error( sprintf( 'Page %s exists and is not the fixture page.', TIA_ELEMENTS_FIXTURE_SLUG ) );
	}

	if ( in_array( 'clean', (array) $cli_args, true ) ) {
		if ( $page ) {
			wp_delete_post( $page->ID, true );
		}
		WP_CLI::success( 'Fixture page removed.' );
		return;
	}

	$dir     = dirname( __DIR__ ) . '/tests/fixtures/live-site';
	$replace = array(
		'{{base}}' => plugins_url( 'tests/fixtures/live-site', __DIR__ ),
		'{{wp}}'   => untrailingslashit( site_url() ),
	);
	$content = "<!-- wp:tia-elements/forward-returns /-->\n";
	foreach ( array( 'learndash/course.html', 'presto-player/video.html', 'affiliatewp/login-form.html' ) as $file ) {
		$html = file_get_contents( "$dir/$file" ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local fixture file.
		if ( false === $html ) {
			WP_CLI::error( "Cannot read $dir/$file." );
		}
		$content .= "\n<!-- wp:html -->\n" . strtr( $html, $replace ) . "<!-- /wp:html -->\n";
	}

	// The fixture needs <link> and custom elements, which kses strips for a user without unfiltered_html.
	kses_remove_filters();
	$id = wp_insert_post(
		array(
			'ID'           => $page ? $page->ID : 0,
			'post_type'    => 'page',
			'post_status'  => 'publish',
			'post_name'    => TIA_ELEMENTS_FIXTURE_SLUG,
			'post_title'   => 'Fixture: live-site plugins',
			'post_content' => wp_slash( $content ),
			'meta_input'   => array( TIA_ELEMENTS_FIXTURE_MARKER => '1' ),
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		WP_CLI::error( $id->get_error_message() );
	}
	WP_CLI::success( (string) get_permalink( $id ) );
}

tia_elements_fixture_run( $args ?? array() );
