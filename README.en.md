# Sparkle

[简体中文](README.md) · English

Capture passing thoughts directly into your current note or today's daily note, using a quick capture dialog, a continuous capture tab, or a persistent side panel. Requires Obsidian 1.13.0 or later.

## Capture an idea

1. Select the sparkle ribbon icon or run **Sparkle: Quick capture**. The content field is focused immediately.
2. Write your thoughts and select **Capture**, or press `Ctrl / ⌘ + Enter`. The dialog closes after a successful save.

The **Current note / Daily note** buttons are always visible above the input. Switch directly without expanding any options; your content and tags are kept. Current note mode uses the open Markdown page, while daily note mode uses today's journal. Closing the dialog keeps your draft for next time.

Quick capture has a single input and one toolbar row: the tag icon appends a selected tag to your text, the continuous capture icon opens the persistent page, and Capture saves your idea. Type `#` for inline tag completion. Use the top-right close button or `Esc` to dismiss the dialog and keep your draft.

## Continuous capture

Run **Sparkle: Continuous capture**, or select its toolbar icon in the quick capture dialog, to open a workspace tab. The composer stays at the top beneath the destination controls, with independently scrolling history below. Select **Capture** or press `Ctrl / ⌘ + Enter`; after a successful save, content and tags clear and the input stays focused for your next thought. Failed writes keep your draft.

A single toolbar row below the input contains a tag icon, save status, and the Capture button. Choose an existing tag to append it to the end of your text, or type `#` in the editor for completion. The success message clears after about two seconds, or as soon as you start typing or choose a tag. When entering continuous capture, any separate tags from an unfinished draft move into the text too.

Select **Daily note** for ongoing daily reflections, or **Current note** to use the Markdown note opened before entering capture. Notes are created only when needed on save. Heading, insertion order, and tag completion work as usual. History follows the order in the note and moves to the new entry after saving.

The page supports mobile, with a composer that adjusts to the keyboard. Reopening the command returns to the existing tab; switching tabs keeps the page, and closing it preserves unfinished drafts. Assign **Continuous capture** to the mobile Quick Action or toolbar to open it directly.

## Faster access

- **Mobile pull-down gesture**: in **Settings → Interface → Configure mobile Quick Action**, select **Sparkle: Quick capture**.
- **Mobile toolbar**: in **Settings → Interface → Configure mobile toolbar → Add a command**, add the same command and move it near the start.
- **Desktop shortcut**: search for **Quick capture** in **Settings → Hotkeys** and assign a shortcut. Sparkle does not claim a default key binding.

See [Obsidian's mobile guide](https://obsidian.md/help/mobile) for the mobile entry points. Quick capture opens a dialog with autofocus and touch-sized controls. Its position and height follow the keyboard; the form scrolls while the toolbar remains visible. Simulated keyboard overlays, dismissal, and orientation changes have been checked; on-device behavior still needs verification.

Use **Sparkle: Open ideas panel** to view entries in the sidebar. Explicitly opening the panel also focuses the editor; after saving, it stays open for the next idea. All capture surfaces share the same draft and writing rules.

Current note mode automatically uses the open Markdown page for each new idea. Once you start typing, its destination stays fixed. Reopening an unfinished draft preserves its original destination; select **Current note** to move the draft to the currently open page without clearing its content or tags. If no Markdown page is open, open one or switch to daily note mode. Sparkle never falls back to an unrelated previously selected file.

Daily note mode uses your Daily notes or Periodic Notes settings, including the folder, date format, and template. Missing notes are created on save.

## Capture settings

Open **Settings → Sparkle**, or select the settings icon in the panel:

- **Section heading**: the level-two heading to write under. Select **Apply heading** after editing it.
- **Insertion position**: add new entries at the start or end of that section.

A missing section is created at the end of the file. Settings apply to both destination modes. Existing sections are not renamed or reordered, and unfinished drafts are kept.

Ideas are stored as ordinary Markdown with local timestamps accurate to the second and tags: `YYYY-MM-DD HH:mm:ss` in current note mode, and `HH:mm:ss` in daily note mode. The interface displays each entry's stored timestamp format. Edit existing entries in the note editor.

Type `#` in the content field, or type a tag name in the tags field, to see existing tag suggestions. Chinese, English, and nested tags are supported, with prefix matches ranked first. Use `↑` / `↓` to navigate, `Enter` or `Tab` to complete, and `Esc` to dismiss, or click a suggestion. Completion replaces only the tag at the cursor. The tags field excludes tags already selected elsewhere in that field. You can still type new tags, and `Ctrl / ⌘ + Enter` saves the idea.

## Languages

Sparkle follows Obsidian's interface language: Chinese language codes use Simplified Chinese; other languages use English. Restart Obsidian after changing its language.

Default headings are **Ideas** in English or **灵感** in Chinese. Changing the interface language preserves your saved heading, draft, tags, and note content.

## Development

Use Node.js 22.13+ and npm:

```sh
npm install
npm run dev
npm run lint
npm run format:check
npm run release:check
npm test
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to a development vault's `.obsidian/plugins/sparkle/` directory. Enable Sparkle, and reload it after copying new builds.

Translations live in `src/i18n/en.ts` and `src/i18n/zh.ts`. Add matching keys and placeholders to both catalogs; TypeScript checks translation keys and interpolation parameters. Tests cover locale selection, catalog consistency, validation messages, and preservation of stored content.

`release:check` validates the package, lockfile, manifest, and version mapping. `npm test` also verifies version synchronization, tag creation, and rejection of mismatched versions in temporary Git repositories.

## Automated releases

GitHub Actions runs version validation, linting, formatting checks, tests, and a production build on pushes to `main`, pull requests, and manual runs. It stores the three plugin files as build artifacts. Pushing a version tag runs the same checks, then creates a GitHub Release with generated notes and attaches `main.js`, `manifest.json`, and `styles.css`.

Commit your code and workflow configuration first. From a clean working tree, set and push a new version:

```sh
npm version 0.2.0
git push origin main --follow-tags
```

You can also use `npm version patch`, `minor`, or `major`. The version hook updates `package.json`, `package-lock.json`, `manifest.json`, and `versions.json`, and creates a version commit and matching tag. Tags use the exact plugin version, such as `0.2.0`; the project's `.npmrc` configures an empty tag prefix.

To publish the existing `0.1.0` version for the first time:

```sh
git tag 0.1.0
git push origin main 0.1.0
```

The release job uses GitHub's automatic `GITHUB_TOKEN` with `contents: write`; no personal access token is needed. Reruns preserve published releases and resume asset uploads for unfinished drafts.
