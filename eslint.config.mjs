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
		files: ['src/i18n/obsidian.ts'],
		// Keep the storage fallback for Obsidian 1.7.2–1.8.6; newer hosts use getLanguage().
		rules: { 'obsidianmd/prefer-get-language': 'off' },
	},
	{
		files: ['tests/mocks/obsidian.ts'],
		// This mock supplies the host runtime; importing from obsidian would recurse.
		rules: { '@typescript-eslint/no-restricted-imports': 'off' },
	},
);
