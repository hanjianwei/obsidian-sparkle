import { builtinModules } from 'node:module';
import process from 'node:process';
import * as esbuild from 'esbuild';

const production = process.argv[2] === 'production';
const context = await esbuild.context({
	entryPoints: ['src/main.ts'],
	bundle: true,
	external: [
		'obsidian',
		'electron',
		'@codemirror/*',
		'@lezer/*',
		...builtinModules,
		...builtinModules.map((name) => `node:${name}`),
	],
	format: 'cjs',
	target: 'es2021',
	logLevel: 'info',
	sourcemap: production ? false : 'inline',
	minify: production,
	treeShaking: true,
	outfile: 'main.js',
});

if (production) {
	try {
		await context.rebuild();
	} finally {
		await context.dispose();
	}
} else {
	await context.watch();
}
