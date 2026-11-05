# Sparkle

[简体中文](README.md) · English

Capture passing thoughts directly into a selected note or today's daily note, using a persistent side panel. Requires Obsidian 1.7.2 or later.

## Capture an idea

1. Select the sparkle ribbon icon or run **Sparkle: Open ideas panel**.
2. Choose **Note** to pin a Markdown file, or **Daily note** to use today's journal.
3. Select **Add an idea**, write your thoughts, optionally add tags, and select **Save idea**. You can also press `Ctrl / ⌘ + Enter`.

Daily note mode uses your Daily notes or Periodic Notes settings, including the folder, date format, and template. Missing notes are created on save. Switching editor tabs does not change a pinned destination.

## Capture settings

Open **Settings → Sparkle**, or select the settings icon in the panel:

- **Section heading**: the level-two heading to write under. Select **Apply heading** after editing it.
- **Insertion position**: add new entries at the start or end of that section.

A missing section is created at the end of the file. Settings apply to both destination modes. Existing sections are not renamed or reordered, and unfinished drafts are kept.

Ideas are stored as ordinary Markdown with local timestamps and tags. Edit existing entries in the note editor.

## Languages

Sparkle follows Obsidian's interface language: Chinese language codes use Simplified Chinese; other languages use English. Restart Obsidian after changing its language.

Fresh installations default to **Ideas** in English or **灵感** in Chinese. Upgrading or changing languages preserves your saved heading, draft, tags, and note content. Legacy data without heading settings continues to use **灵感**.

## Development

Use Node.js 22.13+ and npm:

```sh
npm install
npm run dev
npm run lint
npm run format:check
npm test
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to a development vault's `.obsidian/plugins/sparkle/` directory. Enable Sparkle, and reload it after copying new builds.

Translations live in `src/i18n/en.ts` and `src/i18n/zh.ts`. Add matching keys and placeholders to both catalogs; TypeScript checks translation keys and interpolation parameters. Tests cover locale selection, catalog consistency, validation messages, and preservation of stored content.
