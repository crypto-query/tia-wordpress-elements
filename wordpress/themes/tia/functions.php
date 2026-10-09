<?php
/**
 * TCC Base Theme functions and definitions
 *
 * @link https://developer.wordpress.org/themes/basics/theme-functions/
 *
 * @package tcc-base-theme
 */

// Allow SVG
add_filter( 'wp_check_filetype_and_ext', function($data, $file, $filename, $mimes) {

	global $wp_version;
	if ( $wp_version !== '4.7.1' ) {
	   return $data;
	}
  
	$filetype = wp_check_filetype( $filename, $mimes );
  
	return [
		'ext'             => $filetype['ext'],
		'type'            => $filetype['type'],
		'proper_filename' => $data['proper_filename']
	];
  
  }, 10, 4 );
  
  function cc_mime_types( $mimes ){
	$mimes['svg'] = 'image/svg+xml';
	return $mimes;
  }
  add_filter( 'upload_mimes', 'cc_mime_types' );
  
  function fix_svg() {
	echo '<style type="text/css">
		  .attachment-266x266, .thumbnail img {
			   width: 100% !important;
			   height: auto !important;
		  }
		  </style>';
  }
  add_action( 'admin_head', 'fix_svg' );

/**
 * Register navigation menus
 */
function tia_register_menus() {
	register_nav_menus( array(
		'menu-1' => esc_html__( 'Primary Menu', 'tia' ),
		'footer-left' => esc_html__( 'Footer Left', 'tia' ),
		'footer-middle' => esc_html__( 'Footer Middle', 'tia' ),
		'footer-right' => esc_html__( 'Footer Right', 'tia' ),
	) );
}
add_action( 'init', 'tia_register_menus' );

/**
 * Default footer menu fallback
 */
function tia_footer_menu_fallback( $location ) {
	$menu_items = array();
	
	switch ( $location ) {
		case 'footer-left':
			$menu_items = array(
				'What is TIA?' => home_url( '/what-is-tia' ),
				'Pricing' => home_url( '/pricing' ),
				'About' => home_url( '/about' ),
				'Free Report' => home_url( '/free-report' ),
				'FAQs' => home_url( '/faqs' ),
				'Contact' => home_url( '/contact' ),
				'Terms and Conditions' => home_url( '/terms' ),
				'Privacy Policy' => home_url( '/privacy-policy' ),
				'Disclaimer' => home_url( '/disclaimer' ),
				'Affiliate' => home_url( '/affiliate' ),
			);
			break;
			
		case 'footer-middle':
			$menu_items = array(
				'TIA Members Account' => home_url( '/my-account/' ),
				'Courses' => home_url( '/my-account/courses/' ),
			);
			break;
			
		case 'footer-right':
			$menu_items = array(
				'My TIA Indicator Suite' => home_url( '/indicator-suite' ),
				'Start 7-day Free Trial' => home_url( '/trial' ),
				'TIA Indicator FAQs' => home_url( '/indicator-faqs' ),
			);
			break;
	}
	
	if ( ! empty( $menu_items ) ) {
		echo '<ul class="footer-menu-list">';
		foreach ( $menu_items as $title => $url ) {
			echo '<li class="menu-item"><a href="' . esc_url( $url ) . '">' . esc_html( $title ) . '</a></li>';
		}
		echo '</ul>';
	}
}


/**
 * Enqueue scripts and styles
 */
function tia_enqueue_scripts() {
	// Enqueue Font Awesome
	wp_enqueue_style( 'font-awesome', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css', array(), '6.4.0' );
	

	if ( defined( 'WP_LOCAL_DEV' ) && WP_LOCAL_DEV ) {
		wp_enqueue_style( 'tia-styles', get_template_directory_uri() . '/dist/css/main.css', array(), '1.0.2' );
		wp_enqueue_script( 'tia-scripts', get_template_directory_uri() . '/dist/js/main.js', array( 'jquery' ), '1.0.2', true );
		if ( is_admin() ) {
			wp_enqueue_style( 'tia-editor-styles', get_template_directory_uri() . '/dist/css/editor_style_block.css', array(), '1.0.2' );
		}
	} else {
		wp_enqueue_style( 'tia-styles', get_template_directory_uri() . '/dist/css/main.min.css', array(), '1.0.2' );
		wp_enqueue_script( 'tia-scripts', get_template_directory_uri() . '/dist/js/main.min.js', array( 'jquery' ), '1.0.2', true );
		if ( is_admin() ) {
			wp_enqueue_style( 'tia-editor-styles', get_template_directory_uri() . '/dist/css/editor_style_block.min.css', array(), '1.0.2' );
		}
	}

	// Enqueue our editor_style_block.min.css file in the block editor.
	if ( is_admin() ) {
		wp_enqueue_style( 'tia-editor-styles', get_template_directory_uri() . '/dist/css/editor_style_block.min.css', array(), '1.0.2' );
	}

	wp_enqueue_script('spectra-pro-register', '/wp-content/plugins/spectra-pro/assets/js/register.min.js', array(), '1.0.0', true);
}
add_action( 'wp_enqueue_scripts', 'tia_enqueue_scripts' );


/**
 * Filters status icon markup for the course element.
 *
 * @since 3.0.0
 *
 * @param string $markup    Icon markup.
 * @param string $status    The current item's status.
 * @param string $post_type What post type we're checking against so this can be used for courses, lessons, topics, and quizzes.
 * @param array   $args      The arguments to get the status icon.
 * @param boolean $echo      True to print the output and false to return the output.
 */
function ld_status_icon( $markup, $status, $post_type, $args, $echo ) {
    
	if ( is_singular( [ 'sfwd-courses', 'sfwd-topic', 'sfwd-lessons' ] ) ) {
		return $markup;
	}
	switch ( $status ) {
		case 'complete':
		case 'completed':
		case 'Completed':
			$markup = '<div class="ld-status ld-status-complete"><img src="' . get_template_directory_uri() . '/src/images/course-complete.png" alt="Complete"></div>';
			break;
		case ( 'progress' ):
		case ( 'in-progress' ):
			$markup = '<circle-progress value="' . $args['percentage'] . '" max="100"></circle-progress>';
			break;
		default:
			break;
	}
	return $markup;
}
add_filter( 'learndash_status_icon', 'ld_status_icon', 10, 5 );

add_filter( 'learndash_user_can_bypass', function( $can_bypass, $user_id, $context, $args ) {
	if ( 'learndash_course_lesson_not_available' === $context ) {
		$course_id = learndash_get_course_id();
		$course_id = absint( $course_id );

		// Change the values to match your course(s).
		if ( ( ! empty( $course_id ) ) && ( in_array( $course_id, array( 2318 ) ) ) ) {
			$group_id = 5998;
			if ( learndash_is_user_in_group( $user_id, $group_id ) ) {
				$can_bypass = true;
			}
		}
	}
	return $can_bypass;
}, 30, 4 );


/**
 * Ensure Action Scheduler is properly updated after early renewal.
 * This hooks into the renewal payment completion to clean up duplicate scheduled actions.
 *
 * @param WC_Subscription $subscription The subscription object.
 * @param WC_Order        $renewal_order The renewal order object.
 */
function cleanup_scheduled_payments_after_early_renewal( $subscription, $renewal_order ) {
    // Check if this is an early renewal by comparing dates
    $renewal_date     = $renewal_order->get_date_created();
    $next_payment_raw = $subscription->get_date( 'next_payment' );
    
    if ( empty( $next_payment_raw ) ) {
        return;
    }
    
    $next_payment_timestamp = wcs_date_to_time( $next_payment_raw );
    $renewal_timestamp      = $renewal_date->getTimestamp();

    // Calculate the minimum acceptable next payment date (Renewal Date + 1 Billing Period).
    $period   = $subscription->get_billing_period();
    $interval = $subscription->get_billing_interval();
    
    // Calculate threshold: Renewal Date + Interval
    $threshold_timestamp = wcs_add_time( $interval, $period, $renewal_timestamp );

    // If the current next payment is BEFORE the threshold, it means the date wasn't updated
    // (or was updated to a date that is still too soon relative to this early renewal).
    if ( $next_payment_timestamp < $threshold_timestamp ) {
        // Calculate new date: Add interval to the EXISTING next payment date.
        // This preserves the billing day/anchor.
        $new_payment_timestamp = wcs_add_time( $interval, $period, $next_payment_timestamp );
        
        // Update the subscription
        $subscription->update_dates( array(
            'next_payment' => gmdate( 'Y-m-d H:i:s', $new_payment_timestamp ),
        ) );
        
        $subscription->add_order_note(
            sprintf(
                __( 'Early renewal detected: Next payment date adjusted from %s to %s to ensure full billing period.', 'tia' ),
                $next_payment_raw,
                gmdate( 'Y-m-d H:i:s', $new_payment_timestamp )
            )
        );

        // Update variable for the cleanup logic below
        $next_payment_timestamp = $new_payment_timestamp;
    }
    
    // Calculate days before renewal using the (potentially updated) next payment date
    $days_before_renewal = ( $next_payment_timestamp - $renewal_timestamp ) / DAY_IN_SECONDS;
    
    if ( $days_before_renewal > 1 ) {
        // This is an early renewal - clear all pending scheduled payments
        $subscription_id = $subscription->get_id();
        
        // Cancel ALL pending scheduled payment actions for this subscription
        as_unschedule_all_actions(
            'woocommerce_scheduled_subscription_payment',
            array( $subscription_id ),
            'woocommerce-subscriptions'
        );
        
        // Also check for gateway-specific hooks
        $payment_method = $subscription->get_payment_method();
        if ( ! empty( $payment_method ) ) {
            as_unschedule_all_actions(
                'woocommerce_scheduled_subscription_payment_' . $payment_method,
                array( $subscription_id ),
                'woocommerce-subscriptions'
            );
        }
        
        // Schedule the new payment at the correct time
        if ( $next_payment_timestamp > 0 ) {
            as_schedule_single_action(
                $next_payment_timestamp,
                'woocommerce_scheduled_subscription_payment',
                array( $subscription_id ),
                'woocommerce-subscriptions'
            );
            
            $subscription->add_order_note(
                sprintf(
                    __( 'Early renewal processed. Scheduled payment cleared and rescheduled for %s.', 'tia' ),
                    gmdate( wc_date_format() . ' ' . wc_time_format(), $next_payment_timestamp )
                )
            );
        }
    }
}
add_action( 'woocommerce_subscription_renewal_payment_complete', 'cleanup_scheduled_payments_after_early_renewal', 10, 2 );

add_filter( 'learndash_ld_course_list_query_args', function ( array $filter, array $atts ): array {
	$filter['orderby'] = 'menu_order';
	$filter['order']   = 'ASC';

	return $filter;
}, PHP_INT_MAX, 2 );

add_filter( 'learndash_course_info_query_args', function ( array $query_args, string $context, int $user_id, array $atts ): array {
	$query_args['orderby'] = 'menu_order';
	$query_args['order']   = 'ASC';

	return $query_args;
}, PHP_INT_MAX, 4 );

/**
 * Account left-nav UX (synced block "Account Navigation", #18091).
 *
 * The nav is a UAGB icon-list of plain anchor links with no current-page
 * handling, so:
 *   1. Clicking the entry for the page you're already on did a full reload.
 *   2. Only Dashboard/Courses/Subscriptions/Orders get the .active-menu-item
 *      highlight (via body-class rules in _woocommerce.scss); Assistant,
 *      Discord, Indicators, TIA Wizard and Account Details never highlight,
 *      and the Assistant item's per-item class is mislabeled.
 *
 * This adds, with no build step, a small inline script that matches the
 * current entry by URL path (per-item classes are unreliable) to:
 *   1. cancel same-page navigation, and
 *   2. flag the current entry with aria-current="page" and the theme's
 *      existing .active-menu-item style, so every tab highlights consistently.
 */
add_action( 'wp_enqueue_scripts', function () {
	wp_add_inline_script( 'tia-scripts', <<<'JS'
( function () {
	var NAV = '.account-level-menu, .account-primary-navigation, .myaccount-primary-navigation';
	var strip = function ( p ) { return ( p || '' ).replace( /\/+$/, '' ); };
	var isCurrent = function ( link ) {
		return link.pathname && strip( link.pathname ) === strip( location.pathname );
	};

	// Cancel a full reload when clicking the entry for the current page.
	// Delegated on document so it also covers the .account-level-menu clone
	// the theme's mobile nav builds into the overlay.
	document.addEventListener( 'click', function ( e ) {
		var link = e.target.closest( 'a[href]' );
		if ( link && link.closest( NAV ) && isCurrent( link ) ) {
			e.preventDefault();
		}
	} );

	// Flag the current entry for styling.
	var markCurrent = function () {
		document.querySelectorAll( 'a[href]' ).forEach( function ( link ) {
			if ( ! link.closest( NAV ) || ! isCurrent( link ) ) { return; }
			link.setAttribute( 'aria-current', 'page' );
			var item = link.closest( '.wp-block-uagb-icon-list-child' );
			if ( item ) { item.classList.add( 'active-menu-item' ); }
		} );
	};
	if ( document.readyState !== 'loading' ) { markCurrent(); }
	else { document.addEventListener( 'DOMContentLoaded', markCurrent ); }
	// Re-run after the theme's jQuery ready clones the menu into mobile nav.
	window.addEventListener( 'load', markCurrent );
} )();
JS
	);

	wp_add_inline_style( 'tia-styles', <<<'CSS'
/* Styling hook for the current account-nav entry. .active-menu-item (set in
   JS) reuses the theme's existing highlight; this bolds the current label as
   an extra affordance. Adjust or extend off a[aria-current="page"] freely. */
.myaccount-primary-navigation a[aria-current="page"] ~ .uagb-icon-list__label,
.account-level-menu a[aria-current="page"] ~ .uagb-icon-list__label {
	font-weight: 700;
}
CSS
	);
}, 20 );
