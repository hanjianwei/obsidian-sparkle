# Repository Guidelines

## Project Structure & Module Organization

`obsidian-sparkle` is an Obsidian community plugin. The workspace currently has no source files, package configuration, tests, or Git history. The layout and commands below are conventions to establish during implementation.

Use TypeScript with `src/main.ts` as the plugin entry point; group settings, views, and reusable logic under `src/`. Keep tests in `tests/` and static assets in `assets/`. Place `manifest.json`, `versions.json`, and `styles.css` at the repository root. Bundle the entry point into root-level `main.js`.

## Build, Test, and Development Commands

When scaffolding, define these npm scripts and commit the lockfile:

- `npm install`: install development dependencies.
- `npm run dev`: watch TypeScript sources and rebuild with esbuild.
- `npm run build`: type-check with TypeScript and produce the production bundle.
- `npm run lint`: run ESLint, including Obsidian plugin rules.
- `npm test`: run Vitest tests once.

These commands become available after package configuration is added. Load development output from a disposable vault at `.obsidian/plugins/<manifest-id>/`; restart Obsidian after manifest changes.

## Coding Style & Naming Conventions

Use strict TypeScript, tab indentation, semicolons, and named imports. Use `PascalCase` for classes and types, `camelCase` for functions and variables, and descriptive filenames. Configure ESLint and Prettier when scaffolding; keep formatting consistent.

## Obsidian API & Lifecycle

Follow the [official plugin requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins). Use public APIs and `this.app`; access vault files through Obsidian APIs. Register events, DOM listeners, and intervals with lifecycle helpers, and clean up other resources on unload. Store settings through `loadData()` and `saveData()`. Avoid unsafe HTML insertion and scope CSS to plugin-specific classes. Set `isDesktopOnly` accurately; mobile-compatible code must avoid desktop-only dependencies.

## Testing Guidelines

Use Vitest with `tests/**/*.test.ts` for logic, mocking Obsidian boundaries. No coverage threshold is established. Manually verify commands, settings persistence, enable/disable cycles, and supported platforms in a disposable vault.

## Commit, Pull Request & Release Guidelines

No commit convention exists yet; use concise imperative subjects, optionally prefixed with `feat:`, `fix:`, or `docs:`. PRs should explain behavior, link relevant issues, report validation, and include screenshots for UI changes.

Use semantic versions, synchronize package and manifest versions, and update `versions.json` compatibility mappings. Release tags must match the manifest version; attach `main.js`, `manifest.json`, and `styles.css` when used. Never commit credentials or personal vault data.
