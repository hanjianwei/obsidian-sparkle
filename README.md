# Sparkle

English · [简体中文](README.cn.md)

A lightweight Obsidian plugin for capturing ideas into your current note or daily note. Requires Obsidian 1.13.0 or later.

## Features

- Quick capture dialog, continuous capture tab, and persistent sidebar.
- Switch between the current note and today's daily note. Reuse Daily notes or Periodic Notes settings.
- Markdown content, timestamps accurate to the second, and existing tag completion.
- Images: select, paste, or drop files. Default folders beside the target note: `assets/` for notes, `assets/{date}/` for daily notes.
- Geotags: device location on mobile with permission, or manual coordinates, with an optional place name.
- Configurable section heading, insertion order, and image folders.
- Local drafts, layouts that adjust to the mobile keyboard, and English / Chinese interfaces.

## Principles

- Make capture quick, with few steps and a small interface.
- Reuse Obsidian's built-in capabilities and features already provided by other plugins.
- Keep features simple and focused on recording. Use Bases, DataviewJS, Map View, and other tools for queries, statistics, maps, and richer workflows.
- Store records as plain Markdown and attachments in the vault.

## Usage

1. Run **Sparkle: Quick capture** or **Sparkle: Continuous capture**.
2. Choose **Current note** or **Daily note**, then write your idea.
3. Select **Capture** or press `Ctrl / ⌘ + Enter`.

Use the toolbar to add images, locations, or tags. Type `#` for tag completion. **Settings → Sparkle** saves changes automatically and includes **Restore defaults**. Daily capture requires Daily notes or Periodic Notes.

## Installation

1. Download **sparkle.zip** from [Releases](https://github.com/hanjianwei/obsidian-sparkle/releases) and extract it.
2. Copy the extracted **sparkle** folder into your vault's `.obsidian/plugins/` directory.
3. Enable Sparkle in Community plugins.

## License

[MIT](LICENSE).
