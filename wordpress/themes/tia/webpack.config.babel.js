import path from "path";
import webpack from "webpack";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import TerserPlugin from "terser-webpack-plugin";
import CssMinimizerPlugin from "css-minimizer-webpack-plugin";

// Detecting Dev Mode
const devMode = process.env.NODE_ENV !== "production";

// BrowserSync in Webpack
let browserSyncFile = [];
if (devMode) {
	try {
		browserSyncFile = require("./browser-sync");
		// do stuff
	} catch (err) {
		console.log(`There is an error: ${err}`);
	}

	if (typeof browserSyncFile.browserSync === "undefined") {
		try {
			browserSyncFile = require("./browser-sync-sample");
			// do stuff
		} catch (err) {
			console.log(`There is an error: ${err}`);
		}
	}
}

// Extract text from a bundle, or bundles, into a separate file
const cssPlugin = new MiniCssExtractPlugin({
	filename: devMode ? "./css/[name].css" : "./css/[name].min.css",
});

// Minify JS
const optimizeJS = new TerserPlugin();

// Minify CSS
const optimizeCss = new CssMinimizerPlugin();

// Added Jquery declaration into Webpack
const jquery = new webpack.ProvidePlugin({
	$: "jquery",
	jQuery: "jquery",
	"window.jQuery": "jquery",
});

export default {
	mode: devMode ? "development" : "production",
	entry: {
		main: ["./src/js/scripts.js", "./src/sass/styles.scss"],
		editor_style_block: ["./src/sass/editor-style-block.scss"],
	},
	output: {
		path: path.resolve(__dirname, "dist"),
		filename: devMode ? "./js/[name].js" : "./js/[name].min.js",
		clean: true,
	},
	watchOptions: {
		ignored: ['**/build', '**/dist', '**/node_modules'],
	},
	module: {
		rules: [
			{
				test: /\.js$/,
				exclude: /node_modules/,
				loader: "babel-loader",
			},
			{
				test: /\.(sa|sc|c)ss$/,
				use: [
					MiniCssExtractPlugin.loader,
					"css-loader",
					"postcss-loader",
					"sass-loader",
				],
			},
			{
				test: /\.(woff(2)?|ttf|eot)$/, // New way to add fonts for Webpack 5.
				type: "asset/resource",
				generator: {
					filename: "./fonts/[name][ext]",
				},
			},
			{
				test: /\.(jpe?g|png|gif|svg|ico)$/i,
				type: "asset/resource",
				generator: {
					filename: "./images/[name][ext]",
				},
			},
		],
	},
	externals: {
		jquery: "jQuery",
	},
	optimization: {
		minimize: true,
		minimizer: [optimizeJS, optimizeCss],
	},
	plugins: [
		cssPlugin,
		jquery,
		...(typeof browserSyncFile.browserSync !== "undefined"
			? [browserSyncFile.browserSync]
			: browserSyncFile),
	],
};
