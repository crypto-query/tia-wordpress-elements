import BrowserSyncPlugin from "browser-sync-webpack-plugin";

export const browserSync = new BrowserSyncPlugin({
	host:   'localhost',
	port:   9002, // Different to Xdebug
	proxy: 'https://tia-new.local/', // Change this to local site when file copied.
	files: [ './**/*.php', './dist/' ]
}, {
	reload: false
});