import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules/**',
		'main.js',
		'esbuild.config.mjs',
		'eslint.config.mjs',
		'vitest.config.mjs',
		'scripts/version.mjs',
		'scripts/release.test.mjs',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
		'versions.json',
	]),
	{
		languageOptions: {
			globals: globals.browser,
			parserOptions: {
				projectService: { allowDefaultProject: ['manifest.json'] },
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ['tests/mocks/obsidian.ts'],
		// This mock supplies the host runtime; importing from obsidian would recurse.
		rules: { '@typescript-eslint/no-restricted-imports': 'off' },
	},
);
