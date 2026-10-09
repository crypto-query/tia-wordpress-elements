
( function( $ ) {

    "use strict";

    // Track if mobile navigation has been initialized
    let mobileNavInitialized = false;

    // Mobile Navigation Functionality
    function initMobileNavigation() {
        // Prevent multiple initializations
        if (mobileNavInitialized) {
            return;
        }
        mobileNavInitialized = true;
        const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
        const mobileNavOverlay = document.querySelector('.mobile-nav-overlay');
        const mobileNavClose = document.querySelector('.mobile-nav-close');
        const mobileDropdownItems = document.querySelectorAll('#mobile-primary-menu .menu-item-has-children > a');

        const myAccount = document.querySelector('#page.my-account');

        // If we are in the my account section we need to clone the .account-level-menu and prepend it to .mobile-navigation.
        if (myAccount) {
            const accountLevelMenu = document.querySelector('.account-level-menu');
            const mobileNavigation = document.querySelector('.mobile-navigation');
            mobileNavigation.prepend(accountLevelMenu.cloneNode(true));
        }

        // Toggle mobile menu
        if (mobileMenuToggle && mobileNavOverlay) {
            mobileMenuToggle.addEventListener('click', function() {
                mobileNavOverlay.classList.add('active');
                document.body.style.overflow = 'hidden'; // Prevent background scrolling
            });
        }

        // Close mobile menu
        if (mobileNavClose && mobileNavOverlay) {
            mobileNavClose.addEventListener('click', function() {
                mobileNavOverlay.classList.remove('active');
                document.body.style.overflow = ''; // Restore scrolling
            });
        }

        // Close mobile menu when clicking outside
        if (mobileNavOverlay) {
            mobileNavOverlay.addEventListener('click', function(e) {
                if (e.target === mobileNavOverlay) {
                    mobileNavOverlay.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        }

        // Mobile dropdown functionality (including second level)
        mobileDropdownItems.forEach(function(item) {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                const parent = this.parentElement;
                const subMenu = parent.querySelector('.sub-menu');
                
                // Toggle active class
                parent.classList.toggle('active');
                
                // Toggle submenu visibility
                if (subMenu) {
                    subMenu.classList.toggle('active');
                }
            });
        });

        // Second level mobile dropdown functionality
        const secondLevelDropdownItems = document.querySelectorAll('#mobile-primary-menu .sub-menu .menu-item-has-children > a');
        secondLevelDropdownItems.forEach(function(item) {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                const parent = this.parentElement;
                const subMenu = parent.querySelector('.sub-menu');
                
                // Toggle active class
                parent.classList.toggle('active');
                
                // Toggle submenu visibility
                if (subMenu) {
                    subMenu.classList.toggle('active');
                }
            });
        });

        // Close mobile menu on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && mobileNavOverlay && mobileNavOverlay.classList.contains('active')) {
                mobileNavOverlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });

    }

    // Track if desktop dropdowns have been initialized
    let desktopDropdownsInitialized = false;

    // Desktop dropdown hover functionality
    function initDesktopDropdowns() {
        // Prevent multiple initializations
        if (desktopDropdownsInitialized) {
            return;
        }
        desktopDropdownsInitialized = true;
        const dropdownItems = document.querySelectorAll('#primary-menu .menu-item-has-children');
        
        dropdownItems.forEach(function(item) {
            const subMenu = item.querySelector('.sub-menu');
            
            if (subMenu) {
                // Add hover delay for better UX
                let timeout;
                
                item.addEventListener('mouseenter', function() {
                    clearTimeout(timeout);
                    subMenu.style.opacity = '1';
                    subMenu.style.visibility = 'visible';
                    subMenu.style.transform = 'translateX(-50%) translateY(0)';
                });
                
                item.addEventListener('mouseleave', function() {
                    timeout = setTimeout(function() {
                        subMenu.style.opacity = '0';
                        subMenu.style.visibility = 'hidden';
                        subMenu.style.transform = 'translateX(-50%) translateY(-10px)';
                    }, 150);
                });
            }
        });

        // Second level desktop dropdown functionality
        const secondLevelDropdownItems = document.querySelectorAll('#primary-menu .sub-menu .menu-item-has-children');
        
        secondLevelDropdownItems.forEach(function(item) {
            const subMenu = item.querySelector('.sub-menu');
            
            if (subMenu) {
                // Add hover delay for better UX
                let timeout;
                
                item.addEventListener('mouseenter', function() {
                    clearTimeout(timeout);
                    subMenu.style.opacity = '1';
                    subMenu.style.visibility = 'visible';
                    subMenu.style.transform = 'translateX(0)';
                });
                
                item.addEventListener('mouseleave', function() {
                    timeout = setTimeout(function() {
                        subMenu.style.opacity = '0';
                        subMenu.style.visibility = 'hidden';
                        subMenu.style.transform = 'translateX(-10px)';
                    }, 150);
                });
            }
        });
    }

    // Initialize when DOM is ready
    $(document).ready(function() {
        initMobileNavigation();
        initDesktopDropdowns();
    });

    // Re-initialize on window resize (for responsive behavior)
    $(window).on('resize', function() {
        // Close mobile menu if screen size increases
        const mobileNavOverlay = document.querySelector('.mobile-nav-overlay');
        if (window.innerWidth > 991 && mobileNavOverlay && mobileNavOverlay.classList.contains('active')) {
            mobileNavOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

} )( jQuery );
