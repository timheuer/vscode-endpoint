const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Recursively copy a directory with optional filter
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 * @param {function} [filter] - Optional filter function (filename, fullPath) => boolean
 */
function copyDirRecursive(src, dest, filter) {
	if (!fs.existsSync(src)) {
		return false;
	}
	fs.mkdirSync(dest, { recursive: true });
	const entries = fs.readdirSync(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirRecursive(srcPath, destPath, filter);
		} else {
			// Apply filter if provided
			if (!filter || filter(entry.name, srcPath)) {
				fs.copyFileSync(srcPath, destPath);
			}
		}
	}
	return true;
}

/**
 * Filter for Monaco files - excludes workers and non-English localization
 * We disable workers in MonacoEnvironment since we use read-only editors
 */
function monacoFilter(filename, fullPath) {
	// Skip worker files (we disable workers for read-only viewing)
	if (filename.includes('.worker')) {
		return false;
	}
	// Skip non-English localization files (nls.messages.XX.js where XX is not empty)
	if (filename.startsWith('nls.messages.') && !filename.startsWith('nls.messages.js')) {
		return false;
	}
	return true;
}

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

	// Copy Monaco Editor (minified version, excluding workers and non-English localization)
	const monacoSource = path.join(__dirname, 'node_modules', 'monaco-editor', 'min', 'vs');
	const monacoDest = path.join(webviewDir, 'monaco', 'vs');
	if (copyDirRecursive(monacoSource, monacoDest, monacoFilter)) {
		console.log('[assets] Copied Monaco Editor (optimized)');
	} else {
		console.warn('[assets] Warning: Monaco Editor not found at', monacoSource);
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
