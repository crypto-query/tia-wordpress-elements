# TIA Navigation Implementation

This document describes the navigation implementation for the TIA WordPress theme, which replicates the design from the provided screenshot.

## Features

### Desktop Navigation
- **TIA Branding**: Custom SVG logo with orange and blue geometric design
- **Horizontal Layout**: Clean, centered navigation with proper spacing
- **Dropdown Menus**: Hover-activated dropdowns with smooth animations
- **Member Login Button**: Styled button positioned on the right

### Mobile Navigation
- **Full-Screen Overlay**: Slide-in mobile menu with smooth transitions
- **Custom Styled Buttons**: 
  - "Members" button with orange gradient background
  - "Indicators" button with blue border
- **Dropdown Functionality**: Tap to expand/collapse submenus
- **Close Button**: X icon in the top-right corner

## File Structure

```
wp-content/themes/tia/
├── header.php                 # Main header template
├── functions.php              # WordPress functions and menu registration
├── src/
│   ├── sass/
│   │   ├── styles.scss        # Main stylesheet imports
│   │   └── _header.scss       # Navigation styles
│   └── js/
│       └── scripts.js         # Navigation JavaScript
└── dist/                      # Built assets (generated)
    ├── css/
    │   └── main.min.css       # Compiled CSS
    └── js/
        └── main.min.js        # Compiled JavaScript
```

## Customization

### Adding Menu Items
1. Go to WordPress Admin → Appearance → Menus
2. Create or edit the "Primary Menu"
3. Add pages, custom links, or categories
4. For dropdowns, drag items under parent items

### Styling Changes
- Edit `src/sass/_header.scss` for visual changes
- Run `npm run dev` for development with live reload
- Run `npm run prod` for production build

### JavaScript Functionality
- Mobile menu toggle and dropdown behavior in `src/js/scripts.js`
- Uses vanilla JavaScript with jQuery dependency
- Includes keyboard support (Escape key to close mobile menu)

## Browser Support
- Modern browsers with CSS Grid and Flexbox support
- Mobile-first responsive design
- Touch-friendly mobile interactions

## Dependencies
- WordPress 5.0+
- jQuery (included with WordPress)
- SASS/SCSS for styling
- Webpack for asset compilation

## Build Process
1. Install dependencies: `npm install`
2. Development: `npm run dev` (with live reload)
3. Production: `npm run prod` (minified assets)

## Notes
- The navigation uses WordPress's built-in menu system
- Fallback menu is provided if no menu is assigned
- All styles follow WordPress coding standards
- Mobile menu prevents background scrolling when open 