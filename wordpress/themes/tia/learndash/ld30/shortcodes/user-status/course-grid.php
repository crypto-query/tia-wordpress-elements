<?php
/**
 * LearnDash LD30 Displays the status of a user's course in the ld_profile shortode
 *
 * Available Variables:
 * $course_id                  : (int) ID of the course
 * $course                     : (object) Post object of the course
 * $course_link                : (object) Permalink to the current course
 * $progress                   : (array) Progress of the current user's course
 * $status                     : (string) Status of the current user's course
 * $since                      : (string) Date user gained access to the course
 * $course_class               : (string) CSS class for each course row
 * $user_id                    : (int) ID of the user
 * $course_icon_class          : (string) CSS class for course status icon
 * $components                 : (array) User status components
 *
 * @since 3.0.0
 *
 * @package LearnDash\Templates\LD30
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$course      = get_post( $course_id );
$course_link = get_permalink( $course_id );

$progress = learndash_course_progress(
	array(
		'user_id'   => $user_id,
		'course_id' => $course_id,
		'array'     => true,
	)
);

$status = ( 100 === absint( $progress['percentage'] ) ) ? 'completed' : 'notcompleted';
$status = ( absint( $progress['percentage'] ) > 0 && 100 !== absint( $progress['percentage'] ) ? 'progress' : $status );
$since  = learndash_user_group_enrolled_to_course_from( $user_id, $course_id );
if ( empty( $since ) ) {
	$since = ld_course_access_from( $course_id, $user_id );
}

/** This filter is documented in themes/ld30/templates/shortcodes/profile/course-row.php */
$course_class = apply_filters(
	'learndash-course-row-class',
	'ld-item-list-item ld-item-list-item-course ld-expandable ' . ( 100 === absint( $progress['percentage'] ) ? 'learndash-complete' : 'learndash-incomplete' ),
	$course,
	$user_id
);

/**
 * Filters course icon CSS class.
 *
 * @since 3.0.0
 *
 * @param string              $course_icon_class List of Course icon CSS class.
 * @param \WP_Post|array|null $course            Course Object.
 * @param int                 $user_id           User ID.
 */
$course_icon_class = apply_filters(
	'learndash-course-icon-class',
	'ld-status-icon ' . ( 100 === absint( $progress['percentage'] ) ? 'ld-status-complete' : 'ld-status-incomplete' ),
	$course,
	$user_id
); ?>
<script src="https://cdn.jsdelivr.net/npm/js-circle-progress/dist/circle-progress.min.js" type="module"></script>
<div class="<?php echo esc_attr( $course_class ); ?>" id="<?php echo esc_attr( 'ld-course-list-item-' . $course_id ); ?>">
	<div class="ld-item-list-item-preview">
	
		<a href="<?php echo esc_url( get_the_permalink( $course_id ) ); ?>" class="ld-item-name">
			<?php
			switch ( $status ) {
				case ( 'progress' ):
				case ( 'in-progress' ):
					echo <<<HTML
						<div class="ld-status ld-status-complete">
							<circle-progress text-format="percent" value="{$progress['percentage']}" max="100"></circle-progress>
						</div>
					HTML;
					break;
				case 'completed':
					$image_desktop = get_template_directory_uri() . '/src/images/course-complete.png';
					$image_mobile = get_template_directory_uri() . '/src/images/course-complete-mobile.png';
					echo <<<HTML
						<div class="ld-status ld-status-complete">
							<img src="{$image_desktop}" alt="Complete" class="ld-status-complete-desktop">
							<img src="{$image_mobile}" alt="Complete" class="ld-status-complete-mobile">
						</div>
					HTML;
					break;
				default:
				echo <<<HTML
					<div class="ld-status ld-status-complete">
						<circle-progress text-format="percent" value="0" max="100"></circle-progress>
					</div>
				HTML;
				break;
			}
			?>
			<span class="ld-item-title">
				<?php echo esc_html( get_the_title( $course_id ) ); ?>
			</span>
		</a> <!--/.ld-course-name-->
	</div> <!--/.ld-course-preview-->
	<?php
			// If the current course is in progress...
			switch ( $status ) {
				case 'progress':
					$link_text = __( 'Continue', 'tia' );
					$link_url = get_the_permalink( $course_id );
					break;
				case 'completed':
					$link_text = __( 'Retake', 'tia' );
					$course_lessons = learndash_get_course_lessons_list( $course_id );
					$link_url = $course_lessons[ array_key_first( $course_lessons ) ]['permalink'];
					break;
				default:
					$link_text = __( 'Begin', 'tia' );
					$link_url = get_the_permalink( $course_id );
					break;
			}
			?>
			<a
				class="button ld-user-status-link ld-user-status-link--<?php echo esc_attr( strtolower( $status ) ); ?>"
				title="<?php echo esc_attr( $link_text ); ?>"
				href="<?php echo esc_url( $link_url ); ?>"
			>
				<?php echo esc_html( $link_text ); ?>
			</a>
</div> <!--/.ld-course-list-item-->
