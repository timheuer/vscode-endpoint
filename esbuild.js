const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Copy webview assets from node_modules to dist/webview
 * These assets need to be distributed with the extension since node_modules is excluded
 */
function copyWebviewAssets() {
	const webviewDir = path.join(__dirname, 'dist', 'webview');

	// Clean and recreate webview directory
	if (fs.existsSync(webviewDir)) {
		fs.rmSync(webviewDir, { recursive: true });
	}
	fs.mkdirSync(webviewDir, { recursive: true });

	// Copy vscode-elements bundled JS
	const elementsSource = path.join(__dirname, 'node_modules', '@vscode-elements', 'elements', 'dist', 'bundled.js');
	const elementsDest = path.join(webviewDir, 'bundled.js');
	if (fs.existsSync(elementsSource)) {
		fs.copyFileSync(elementsSource, elementsDest);
		console.log('[assets] Copied vscode-elements bundled.js');
	} else {
		console.warn('[assets] Warning: vscode-elements bundled.js not found at', elementsSource);
	}

	// Copy codicons CSS and font files
	const codiconsDir = path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist');
	if (fs.existsSync(codiconsDir)) {
		// Copy CSS
		const codiconsCss = path.join(codiconsDir, 'codicon.css');
		if (fs.existsSync(codiconsCss)) {
			fs.copyFileSync(codiconsCss, path.join(webviewDir, 'codicon.css'));
			console.log('[assets] Copied codicon.css');
		}

		// Copy font file(s)
		const files = fs.readdirSync(codiconsDir);
		for (const file of files) {
			if (file.endsWith('.ttf') || file.endsWith('.woff') || file.endsWith('.woff2')) {
				fs.copyFileSync(path.join(codiconsDir, file), path.join(webviewDir, file));
				console.log(`[assets] Copied ${file}`);
			}
		}
	} else {
		console.warn('[assets] Warning: codicons dist not found at', codiconsDir);
	}

	// Copy shared webview CSS
	const sharedCssSource = path.join(__dirname, 'src', 'webview', 'shared.css');
	if (fs.existsSync(sharedCssSource)) {
		fs.copyFileSync(sharedCssSource, path.join(webviewDir, 'shared.css'));
		console.log('[assets] Copied shared.css');
	}

	// Copy requestView.css
	const requestViewCssSource = path.join(__dirname, 'src', 'webview', 'requestView.css');
	if (fs.existsSync(requestViewCssSource)) {
		fs.copyFileSync(requestViewCssSource, path.join(webviewDir, 'requestView.css'));
		console.log('[assets] Copied requestView.css');
	}

	// Copy collectionSettings.css
	const collectionSettingsCssSource = path.join(__dirname, 'src', 'webview', 'collectionSettings.css');
	if (fs.existsSync(collectionSettingsCssSource)) {
		fs.copyFileSync(collectionSettingsCssSource, path.join(webviewDir, 'collectionSettings.css'));
		console.log('[assets] Copied collectionSettings.css');
	}
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			// Copy webview assets after each build
			copyWebviewAssets();
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
